/**
 * The pages of the scan in progress, shared by the camera (`app/scanner.tsx`) and the review
 * screen (`app/scan-review.tsx`). Held in memory only; nothing about a session is persisted.
 *
 * Each page keeps its original photo plus the processed version for its current corners, filter
 * and rotation, and small previews of every filter for the review screen's filter cards (redone
 * only when the corners or the rotation change). Processing (OpenCV) runs one page at a time, and
 * a result that went stale while it was computing — the citizen moved a corner, picked another
 * filter or rotated the page — is thrown away.
 *
 * Retake marks one page (`startRetake`); the next photo taken or picked replaces that page in
 * place, keeping its position and filter (a platform scan's goes to Original), instead of being
 * added at the end.
 *
 * A session has a preset (`presets.ts`), chosen when the camera opens (`startSession`): it caps
 * the pages (an ID card has a front and a back), picks the first filter, and shapes how pages are
 * processed. An ID card's sides are laid out on one A4 page when the scan is saved.
 *
 * Each page carries the quality of its photo (`photo-quality.ts`, measured with the analysis);
 * review shows its issues until the citizen retakes the page or dismisses the warning.
 *
 * A page from Google's document scanner (`platform` source, `platform-scanner.ts`) arrives
 * already cropped, flattened and cleaned: it is not searched for a page again, and it starts on
 * the Original filter so that clean-up is not done twice. The citizen can still pick another.
 * A signature is the exception: it starts on its preset's filter, because its ink is found
 * against white paper (`inkBounds`). So is a passport photo, which starts on the studio look
 * when the phone can cut the person out (`studio-photo.ts`).
 * A page of an uploaded PDF (`pdf` source, `pdf-pages.ts`) is the page itself, drawn by the
 * phone's PDF renderer: it is treated the same way, and has no photo quality to warn about.
 *
 * A session also records where its pages come from (`origin`): the camera, or Upload
 * (`app/import.tsx`), so review returns to the right screen to add or replace a page. One started
 * from a document checklist carries its `goal`: the document wanted, and the checklist to return
 * to once it is saved.
 *
 * Every file a session creates is a plaintext temporary copy in the app's cache or tmp folder.
 * Saving seals the processed pages into the encrypted vault and deletes all of them; discarding
 * the session just deletes them.
 */

import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';

import type { ScanGoal } from '../checklist/scan-goal';
import type { DocumentDetails } from '../vault/vault-index';
import { discardIncoming, saveDocument } from '../vault/vault-storage';
import {
  analysePhoto,
  composeIdCardSheet,
  type FilterPreviews,
  type PageFilter,
  type PhotoAnalysis,
  type RenderedPage,
  renderPage,
  studioPhotoAvailable,
} from './document-vision';
import { nextRotation, type PageRotation, type Quad, sameQuad } from './geometry';
import type { QualityIssue } from './photo-quality';
import { presetDefaultFilter, presetPageLimit, type ScanPreset } from './presets';

export type PageStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type PageSource = 'camera' | 'gallery' | 'platform' | 'pdf';

/** Where a session's pages are taken from: the scanner, or files already on the phone. */
export type SessionOrigin = 'camera' | 'import';

/**
 * Whether a page arrives as the page itself — already cropped (Google's scanner) or drawn from a
 * PDF — so it is not searched for a page, starts on Original, and has no photo to judge.
 */
export function arrivesAsPage(source: PageSource): boolean {
  return source === 'platform' || source === 'pdf';
}

/** Whether a new page is shown as it came. Not a signature: its ink is found on white paper. */
function startsOnOriginal(source: PageSource): boolean {
  return arrivesAsPage(source) && state.preset !== 'signature' && state.preset !== 'photo';
}

/** A new page's filter when it does not start on Original. */
function firstFilter(): PageFilter {
  return state.preset === 'photo'
    ? presetDefaultFilter('photo', studioPhotoAvailable())
    : presetDefaultFilter(state.preset);
}

export type SessionPage = {
  readonly id: string;
  /** The original photo, upright only via EXIF. */
  readonly photoUri: string;
  /**
   * `platform`: Google's document scanner, which hands over the page already cropped. `pdf`: a
   * page of a PDF on the phone, drawn as an image.
   */
  readonly source: PageSource;
  readonly analysis: PhotoAnalysis | null;
  /** The crop, in upright photo pixels. Starts as the detected page (or the whole photo). */
  readonly quad: Quad | null;
  readonly filter: PageFilter;
  /** Quarter turns clockwise, applied to the processed page. */
  readonly rotation: PageRotation;
  /**
   * Where the crop editor's straighten dial was left, in degrees. Only for showing the editor
   * as the citizen left it: the straightening itself is already in `quad`.
   */
  readonly straighten: number;
  readonly rendered: RenderedPage | null;
  /** The page in every filter, small. Null until first processed. */
  readonly previews: FilterPreviews | null;
  /** The corners and rotation `previews` were made for; they are redone when either changes. */
  readonly previewsFor: { readonly quad: Quad; readonly rotation: PageRotation } | null;
  readonly status: PageStatus;
  /** Bumped on every change that invalidates `rendered`. */
  readonly revision: number;
  /** The citizen chose to keep the page despite its photo's quality warning. */
  readonly qualityDismissed: boolean;
};

export type SessionState = {
  readonly pages: readonly SessionPage[];
  /** The page the next photo replaces, while a Retake is in progress. */
  readonly retakeId: string | null;
  /** What the scan is for: an ordinary document unless the camera was opened for a preset. */
  readonly preset: ScanPreset;
  readonly origin: SessionOrigin;
  /** The document a checklist asked for, when one did. */
  readonly goal: ScanGoal | null;
};

export const DEFAULT_FILTER: PageFilter = 'magic';

/** A platform-scanned page is already cleaned: shown as it came, unless the citizen picks. */
export const PLATFORM_FILTER: PageFilter = 'original';

let state: SessionState = {
  pages: [],
  retakeId: null,
  preset: 'document',
  origin: 'camera',
  goal: null,
};
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function patchPage(id: string, patch: Partial<SessionPage>): void {
  setState({
    ...state,
    pages: state.pages.map((page) => (page.id === id ? { ...page, ...patch } : page)),
  });
}

function findPage(id: string): SessionPage | undefined {
  return state.pages.find((page) => page.id === id);
}

function previewUris(previews: FilterPreviews | null | undefined): string[] {
  return previews ? Object.values(previews) : [];
}

/** Every temporary file a page holds: its photo, processed page and filter previews. */
function pageFiles(page: SessionPage): string[] {
  return [
    page.photoUri,
    ...(page.rendered ? [page.rendered.uri] : []),
    ...previewUris(page.previews),
  ];
}

export function getSession(): SessionState {
  return state;
}

export function useCaptureSession(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSession,
    getSession,
  );
}

/** The page a Retake is replacing, if it still exists. */
function retakeTarget(): SessionPage | undefined {
  return state.retakeId === null ? undefined : findPage(state.retakeId);
}

/** Whether `count` more photos fit. A retake replaces a page, so one photo always fits. */
export function canAddPages(count = 1): boolean {
  if (retakeTarget()) return count <= 1;
  return state.pages.length + count <= presetPageLimit(state.preset);
}

/**
 * What the quality check found wrong with a page's photo, for review to warn about: nothing once
 * the citizen has dismissed the warning, or while the photo has not been measured. A passport
 * photo is not judged for blur: the check is calibrated on print, and a sharp face, all soft
 * shading, could read as blurred; light and glare apply to it as to any page.
 */
export function pageQualityIssues(
  page: SessionPage,
  preset: ScanPreset = state.preset,
): readonly QualityIssue[] {
  if (page.qualityDismissed || page.source === 'pdf') return [];
  const issues = page.analysis?.quality?.issues ?? [];
  return preset === 'photo' ? issues.filter((issue) => issue !== 'blurry') : issues;
}

// ---- Processing ----------------------------------------------------------------------------

let queue: Promise<void> = Promise.resolve();

/** Lets a spinner paint before OpenCV holds the JS thread. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

async function processNow(id: string): Promise<void> {
  const page = findPage(id);
  if (!page || page.status === 'ready') return;

  const revision = page.revision;
  patchPage(id, { status: 'processing' });
  await nextFrame();

  try {
    let { analysis, quad } = page;
    if (!analysis) {
      analysis = await analysePhoto(page.photoUri, { findPage: !arrivesAsPage(page.source) });
      quad = quad ?? analysis.quad;
      if (!findPage(id)) return;
      patchPage(id, { analysis, quad });
    }

    const crop = quad ?? analysis.quad;
    const wantPreviews =
      page.previews === null ||
      page.previewsFor?.quad !== crop ||
      page.previewsFor.rotation !== page.rotation;
    const { previews, ...rendered } = await renderPage(page.photoUri, crop, page.filter, {
      rotation: page.rotation,
      previews: wantPreviews,
      preset: state.preset,
    });
    const current = findPage(id);
    if (!current || current.revision !== revision) {
      // Stale or deleted meanwhile: this output is not wanted.
      discardIncoming([rendered.uri, ...previewUris(previews)]);
      if (current) void processPage(id);
      return;
    }

    if (current.rendered) discardIncoming([current.rendered.uri]);
    if (previews) {
      discardIncoming(previewUris(current.previews));
      patchPage(id, {
        rendered,
        previews,
        previewsFor: { quad: crop, rotation: page.rotation },
        status: 'ready',
      });
    } else {
      patchPage(id, { rendered, status: 'ready' });
    }
  } catch (error) {
    // The message is OpenCV's or the file system's; it never holds the page's contents.
    if (__DEV__) console.warn('[scan] page processing failed:', (error as Error)?.message);
    if (findPage(id)?.revision === revision) patchPage(id, { status: 'failed' });
  }
}

/** Queues a page for processing. Resolves once it (or a newer revision) has been handled. */
export function processPage(id: string): Promise<void> {
  queue = queue.then(() => processNow(id));
  return queue;
}

// ---- Editing -------------------------------------------------------------------------------

/**
 * Adds photos as new pages and starts processing them. Returns the new page ids. While a Retake
 * is in progress the first photo replaces that page instead (same id, same place) and any others
 * are dropped.
 */
export function addPhotos(uris: readonly string[], source: SessionPage['source']): string[] {
  const target = retakeTarget();
  if (target) {
    const [photoUri, ...extra] = uris;
    discardIncoming(extra);
    if (!photoUri) return [];
    discardIncoming(pageFiles(target));
    setState({
      ...state,
      retakeId: null,
      pages: state.pages.map((page) =>
        page.id === target.id
          ? {
              ...page,
              photoUri,
              source,
              filter: startsOnOriginal(source) ? PLATFORM_FILTER : page.filter,
              analysis: null,
              quad: null,
              rotation: 0,
              straighten: 0,
              rendered: null,
              previews: null,
              previewsFor: null,
              status: 'pending',
              revision: page.revision + 1,
              qualityDismissed: false,
            }
          : page,
      ),
    });
    void processPage(target.id);
    return [target.id];
  }

  const room = Math.max(0, presetPageLimit(state.preset) - state.pages.length);
  const accepted = uris.slice(0, room);
  discardIncoming(uris.slice(room));

  const pages: SessionPage[] = accepted.map((photoUri) => ({
    id: randomUUID(),
    photoUri,
    source,
    analysis: null,
    quad: null,
    filter: startsOnOriginal(source)
      ? PLATFORM_FILTER
      : (state.pages.at(-1)?.filter ?? firstFilter()),
    rotation: 0,
    straighten: 0,
    rendered: null,
    previews: null,
    previewsFor: null,
    status: 'pending',
    revision: 0,
    qualityDismissed: false,
  }));
  setState({ ...state, pages: [...state.pages, ...pages] });
  for (const page of pages) void processPage(page.id);
  return pages.map((page) => page.id);
}

function revise(id: string, patch: Partial<SessionPage>): void {
  const page = findPage(id);
  if (!page) return;
  patchPage(id, { ...patch, status: 'pending', revision: page.revision + 1 });
  void processPage(id);
}

export function setPageFilter(id: string, filter: PageFilter): void {
  if (findPage(id)?.filter !== filter) revise(id, { filter });
}

export function setPageQuad(id: string, quad: Quad): void {
  revise(id, { quad });
}

export type PageCrop = {
  readonly quad: Quad;
  readonly rotation: PageRotation;
  readonly straighten: number;
};

/**
 * Applies the crop editor's result (Done): corners, quarter turns and straightening together, so
 * the page is processed once. Nothing changed, nothing is redone.
 */
export function setPageCrop(id: string, crop: PageCrop): void {
  const page = findPage(id);
  if (!page) return;
  const unchanged =
    page.quad !== null &&
    sameQuad(page.quad, crop.quad) &&
    page.rotation === crop.rotation &&
    page.straighten === crop.straighten;
  if (!unchanged) revise(id, crop);
}

/** Marks a page to be replaced by the next photo taken or picked. */
export function startRetake(id: string): void {
  if (findPage(id)) setState({ ...state, retakeId: id });
}

/** Keeps a page despite its quality warning: review stops showing it. */
export function dismissQualityWarning(id: string): void {
  if (findPage(id)) patchPage(id, { qualityDismissed: true });
}

/** Forgets a Retake the citizen walked away from. */
export function cancelRetake(): void {
  if (state.retakeId !== null) setState({ ...state, retakeId: null });
}

/** Turns a page a quarter clockwise. */
export function rotatePage(id: string): void {
  const page = findPage(id);
  if (page) revise(id, { rotation: nextRotation(page.rotation) });
}

export function retryPage(id: string): void {
  revise(id, {});
}

export function removePage(id: string): void {
  const page = findPage(id);
  if (!page) return;
  discardIncoming(pageFiles(page));
  setState({
    ...state,
    pages: state.pages.filter((p) => p.id !== id),
    retakeId: state.retakeId === id ? null : state.retakeId,
  });
}

/** Throws the whole session away, deleting every temporary file. */
export function discardSession(): void {
  startSession('document');
}

/**
 * Throws away any session in progress, deleting its files, and starts an empty one for `preset`,
 * taking its pages from `origin`, for a checklist's `goal` if it has one.
 */
export function startSession(
  preset: ScanPreset,
  origin: SessionOrigin = 'camera',
  goal: ScanGoal | null = null,
): void {
  const uris = state.pages.flatMap(pageFiles);
  setState({ pages: [], retakeId: null, preset, origin, goal });
  discardIncoming(uris);
}

export class SessionNotReadyError extends Error {
  constructor() {
    super('Some pages could not be processed.');
    this.name = 'SessionNotReadyError';
  }
}

/**
 * Seals every processed page into one encrypted vault document with the details from the Save
 * Document screen, then deletes all of the session's temporary files. Returns the new
 * document's id.
 */
export async function saveSession(
  details: DocumentDetails = {},
  /** What the phone read off the pages (`lib/ocr`), sealed with the document for search. */
  searchText?: string,
): Promise<string> {
  for (const page of state.pages) {
    if (page.status !== 'ready') await processPage(page.id);
  }
  await queue;

  const pages = state.pages;
  if (pages.length === 0 || pages.some((page) => page.status !== 'ready' || !page.rendered)) {
    throw new SessionNotReadyError();
  }

  const rendered = pages.map((page) => page.rendered as RenderedPage);
  // Uploaded photos and PDFs are filed as imported; anything with a scanned page as a scan.
  const source = pages.every((page) => page.source === 'gallery' || page.source === 'pdf')
    ? 'gallery'
    : 'scanner';

  // An ID card's sides go on one A4 page. If that cannot be drawn, the sides are saved as they
  // are rather than losing the scan. The sheet is a plaintext copy: deleted however it ends.
  let sheet: RenderedPage | null = null;
  if (state.preset === 'id_card') {
    try {
      sheet = await composeIdCardSheet(rendered);
    } catch {
      sheet = null;
    }
  }
  let documentId: string;
  try {
    documentId = await saveDocument(
      (sheet ? [sheet] : rendered).map((page) => ({ uri: page.uri, mimeType: 'image/jpeg' })),
      source,
      details,
      undefined,
      searchText,
    );
  } finally {
    if (sheet) discardIncoming([sheet.uri]);
  }
  discardSession();
  return documentId;
}
