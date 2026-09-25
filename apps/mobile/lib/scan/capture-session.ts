/**
 * The pages of the scan in progress, shared by the camera (`app/scanner.tsx`) and the review
 * screen (`app/scan-review.tsx`). Held in memory only; nothing about a session is persisted.
 *
 * Each page keeps its original photo plus the processed version for its current corners and
 * filter. Processing (OpenCV) runs one page at a time, and a result that went stale while it was
 * computing — the citizen moved a corner or picked another filter — is thrown away.
 *
 * Every file a session creates is a plaintext temporary copy in the app's cache or tmp folder.
 * Saving seals the processed pages into the encrypted vault and deletes all of them; discarding
 * the session just deletes them.
 */

import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';

import type { DocumentDetails } from '../vault/vault-index';
import { discardIncoming, saveDocument } from '../vault/vault-storage';
import {
  analysePhoto,
  type PageFilter,
  type PhotoAnalysis,
  type RenderedPage,
  renderPage,
} from './document-vision';
import type { Quad } from './geometry';
import { MULTI_PAGE_LIMIT } from './scan-session';

export type PageStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type SessionPage = {
  readonly id: string;
  /** The original photo, upright only via EXIF. */
  readonly photoUri: string;
  readonly source: 'camera' | 'gallery';
  readonly analysis: PhotoAnalysis | null;
  /** The crop, in upright photo pixels. Starts as the detected page (or the whole photo). */
  readonly quad: Quad | null;
  readonly filter: PageFilter;
  readonly rendered: RenderedPage | null;
  readonly status: PageStatus;
  /** Bumped on every change that invalidates `rendered`. */
  readonly revision: number;
};

export type SessionState = { readonly pages: readonly SessionPage[] };

export const DEFAULT_FILTER: PageFilter = 'magic';

let state: SessionState = { pages: [] };
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function patchPage(id: string, patch: Partial<SessionPage>): void {
  setState({ pages: state.pages.map((page) => (page.id === id ? { ...page, ...patch } : page)) });
}

function findPage(id: string): SessionPage | undefined {
  return state.pages.find((page) => page.id === id);
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

export function canAddPages(count = 1): boolean {
  return state.pages.length + count <= MULTI_PAGE_LIMIT;
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
      analysis = await analysePhoto(page.photoUri);
      quad = quad ?? analysis.quad;
      if (!findPage(id)) return;
      patchPage(id, { analysis, quad });
    }

    const rendered = await renderPage(page.photoUri, quad ?? analysis.quad, page.filter);
    const current = findPage(id);
    if (!current || current.revision !== revision) {
      // Stale or deleted meanwhile: this output is not wanted.
      discardIncoming([rendered.uri]);
      if (current) void processPage(id);
      return;
    }

    if (current.rendered) discardIncoming([current.rendered.uri]);
    patchPage(id, { rendered, status: 'ready' });
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

/** Adds photos as new pages and starts processing them. Returns the new page ids. */
export function addPhotos(uris: readonly string[], source: SessionPage['source']): string[] {
  const room = Math.max(0, MULTI_PAGE_LIMIT - state.pages.length);
  const accepted = uris.slice(0, room);
  discardIncoming(uris.slice(room));

  const pages: SessionPage[] = accepted.map((photoUri) => ({
    id: randomUUID(),
    photoUri,
    source,
    analysis: null,
    quad: null,
    filter: state.pages.at(-1)?.filter ?? DEFAULT_FILTER,
    rendered: null,
    status: 'pending',
    revision: 0,
  }));
  setState({ pages: [...state.pages, ...pages] });
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

export function retryPage(id: string): void {
  revise(id, {});
}

export function removePage(id: string): void {
  const page = findPage(id);
  if (!page) return;
  discardIncoming([page.photoUri, ...(page.rendered ? [page.rendered.uri] : [])]);
  setState({ pages: state.pages.filter((p) => p.id !== id) });
}

/** Throws the whole session away, deleting every temporary file. */
export function discardSession(): void {
  const uris = state.pages.flatMap((page) => [
    page.photoUri,
    ...(page.rendered ? [page.rendered.uri] : []),
  ]);
  setState({ pages: [] });
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
export async function saveSession(details: DocumentDetails = {}): Promise<string> {
  for (const page of state.pages) {
    if (page.status !== 'ready') await processPage(page.id);
  }
  await queue;

  const pages = state.pages;
  if (pages.length === 0 || pages.some((page) => page.status !== 'ready' || !page.rendered)) {
    throw new SessionNotReadyError();
  }

  const documentId = await saveDocument(
    pages.map((page) => ({ uri: (page.rendered as RenderedPage).uri, mimeType: 'image/jpeg' })),
    pages.every((page) => page.source === 'gallery') ? 'gallery' : 'scanner',
    details,
  );
  discardSession();
  return documentId;
}
