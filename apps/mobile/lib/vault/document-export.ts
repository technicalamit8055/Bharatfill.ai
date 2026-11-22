/**
 * Share, Download and Print for one vault document — the Phase 1 "export to WhatsApp / Files"
 * of `docs/CITIZEN_MOBILE_APP_SPEC.md` §6.
 *
 * Every action starts with the citizen and goes only where they pick: the system share sheet, a
 * folder they choose, or the system print dialog. Nothing is uploaded by the app.
 *
 * A single page shares and saves as its own image, or as a PDF when the citizen asks; a booklet
 * is always a PDF. PDFs of scans are written directly by `scan-pdf.ts`, one page per scan sized
 * to it; only pages that are not JPEGs go through the print module's A4 sheets.
 *
 * Sharing needs a real file, so the decrypted document is written to one short-lived folder in
 * the app's cache (`vault-export/`). That folder holds at most one export at a time: it is
 * emptied before every export, after the share sheet closes, and when the details screen
 * closes (`clearExports`). Download writes straight into the chosen folder, and Print hands the
 * pages to the print dialog without writing a file at all.
 *
 * `expo-print` and `expo-sharing` are imported only when an export runs, never at load time.
 * Expo Router loads every route up front, so a static import would crash the whole app on a dev
 * client built before these modules were added; instead, that build reports
 * `ExportUnavailableError` when an export is tried.
 */

import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
// Types only: erased at build time, so neither module is loaded here.
import type * as PrintModule from 'expo-print';
import type * as SharingModule from 'expo-sharing';

import {
  exportFileName,
  exportFormat,
  type ExportFormat,
  type ExportKind,
  isCancellation,
  printableHtml,
} from './document-details';
import { buildScanPdf, decodeBase64, scanPdfPages } from './scan-pdf';
import type { VaultDocument } from './vault-index';
import { readPageDataUri } from './vault-storage';

/** A4 at 72 PPI, the page size the PDF export and the print dialog start from. */
const A4 = { width: 595, height: 842 } as const;

export type ExportOutcome = 'done' | 'cancelled';

/**
 * Told when decrypting and writing starts, and when it is done and a system sheet or dialog is
 * about to open, so the screen shows "Preparing…" only while the citizen is actually waiting.
 */
export type ExportProgress = (phase: 'preparing' | 'ready') => void;

const NO_PROGRESS: ExportProgress = () => undefined;

/** This build of the app does not include the share or print module. */
export class ExportUnavailableError extends Error {
  constructor() {
    super('Sharing and printing are not included in this build of the app.');
    this.name = 'ExportUnavailableError';
  }
}

function loadPrint(): Promise<typeof PrintModule> {
  if (requireOptionalNativeModule('ExpoPrint') === null) throw new ExportUnavailableError();
  return import('expo-print');
}

function loadSharing(): Promise<typeof SharingModule> {
  if (requireOptionalNativeModule('ExpoSharing') === null) throw new ExportUnavailableError();
  return import('expo-sharing');
}

function exportDirectory(): Directory {
  return new Directory(Paths.cache, 'vault-export');
}

/** Deletes every decrypted export copy. Safe to call at any time. */
export function clearExports(): void {
  try {
    const directory = exportDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Best effort: the OS clears the cache folder on its own when space runs low.
  }
}

/** Every page, decrypted one after another into memory. */
async function pageDataUris(document: VaultDocument): Promise<string[]> {
  const uris: string[] = [];
  for (const pageIndex of document.pages.keys()) {
    uris.push(await readPageDataUri(document, pageIndex));
  }
  return uris;
}

function base64Of(dataUri: string): string {
  return dataUri.slice(dataUri.indexOf(',') + 1);
}

type PreparedExport = { readonly file: File; readonly format: ExportFormat };

/**
 * Whether a PDF of this document needs the print module: only when a page is not a JPEG, since
 * JPEG scans are written into the PDF directly (`scan-pdf.ts`).
 */
function pdfNeedsPrint(document: VaultDocument): boolean {
  return document.pages.some((page) => page.mimeType !== 'image/jpeg');
}

/**
 * The document as one PDF: each scan on its own page, sized to it and filling it, like a
 * scanner app's PDF. Pages that cannot go in directly fall back to the print module's A4 sheets.
 */
async function writePdf(uris: readonly string[], file: File): Promise<void> {
  const pages = uris.map((uri) => decodeBase64(base64Of(uri)));
  if (scanPdfPages(pages)) {
    file.write(buildScanPdf(pages));
    return;
  }
  const Print = await loadPrint();
  const printed = await Print.printToFileAsync({ html: printableHtml(uris), ...A4 });
  await new File(printed.uri).move(file);
}

export type SyncFile = {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
};

/**
 * The document as the one file cloud sync uploads (`lib/cloud/sync-plan.ts` `syncFileKind`), in
 * memory: a lone JPEG/PNG/WebP page as itself, otherwise the same PDF Share would make. Only the
 * print-module fallback touches disk, in the export folder, and that copy is deleted at once.
 * The bytes returned are plaintext; the caller encrypts them before anything leaves the phone.
 */
export async function buildSyncFile(
  document: VaultDocument,
  kind: 'image' | 'pdf',
): Promise<SyncFile> {
  const uris = await pageDataUris(document);
  const first = document.pages[0];
  if (kind === 'image' && first && first.mimeType !== 'image/heic' && uris[0]) {
    return { bytes: decodeBase64(base64Of(uris[0])), mimeType: first.mimeType };
  }

  const pages = uris.map((uri) => decodeBase64(base64Of(uri)));
  if (scanPdfPages(pages)) return { bytes: buildScanPdf(pages), mimeType: 'application/pdf' };

  const Print = await loadPrint();
  const printed = new File(
    (await Print.printToFileAsync({ html: printableHtml(uris), ...A4 })).uri,
  );
  try {
    return { bytes: await printed.bytes(), mimeType: 'application/pdf' };
  } finally {
    try {
      printed.delete();
    } catch {
      // The OS clears the cache folder on its own.
    }
  }
}

/**
 * Writes the document as one file in the export folder: a PDF for a booklet or when `kind` asks
 * for one, else the page's own image.
 */
async function prepareExport(
  document: VaultDocument,
  title: string,
  kind: ExportKind,
): Promise<PreparedExport> {
  const firstPage = document.pages[0];
  if (!firstPage) throw new RangeError('A document needs at least one page.');

  clearExports();
  const directory = exportDirectory();
  directory.create({ intermediates: true, idempotent: true });

  const format = exportFormat(document.pages.length, firstPage.mimeType, kind);
  const file = new File(directory, exportFileName(title, format.extension));
  const uris = await pageDataUris(document);

  if (format.mimeType === 'application/pdf') {
    await writePdf(uris, file);
  } else {
    file.write(base64Of(uris[0] ?? ''), { encoding: 'base64' });
  }
  return { file, format };
}

/** Opens the system share sheet with the document. Throws when sharing is not available. */
export async function shareDocument(
  document: VaultDocument,
  title: string,
  kind: ExportKind = 'image',
  progress: ExportProgress = NO_PROGRESS,
): Promise<void> {
  const Sharing = await loadSharing();
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available.');
  try {
    progress('preparing');
    const { file, format } = await prepareExport(document, title, kind);
    progress('ready');
    await Sharing.shareAsync(file.uri, {
      mimeType: format.mimeType,
      UTI: format.uti,
      dialogTitle: title,
    });
  } finally {
    clearExports();
  }
}

/**
 * Opens the share sheet with a JPEG made in memory (Export for a form, `portal-export.ts`):
 * written once into the export folder and deleted as soon as the sheet closes, like Share.
 */
export async function shareJpegBytes(
  bytes: Uint8Array,
  fileName: string,
  dialogTitle: string,
): Promise<void> {
  const Sharing = await loadSharing();
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available.');
  try {
    clearExports();
    const directory = exportDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, fileName);
    file.write(bytes);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
      dialogTitle,
    });
  } finally {
    clearExports();
  }
}

/** One page decrypted into memory, as base64 — for Export for a form. */
export async function pageBase64(document: VaultDocument, pageIndex: number): Promise<string> {
  return base64Of(await readPageDataUri(document, pageIndex));
}

/**
 * Asks for a folder, then saves the document into it. The folder is asked for first, so closing
 * the picker costs nothing.
 */
export async function downloadDocument(
  document: VaultDocument,
  title: string,
  kind: ExportKind = 'image',
  progress: ExportProgress = NO_PROGRESS,
): Promise<ExportOutcome> {
  // A PDF of non-JPEG pages goes through the print module, so check for it before asking for a
  // folder.
  const asPdf = document.pages.length > 1 || kind === 'pdf';
  if (asPdf && pdfNeedsPrint(document)) await loadPrint();

  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isCancellation(error)) return 'cancelled';
    throw error;
  }

  try {
    progress('preparing');
    const { file, format } = await prepareExport(document, title, kind);
    const saved = target.createFile(file.name, format.mimeType);
    saved.write(await file.bytes());
    return 'done';
  } finally {
    progress('ready');
    clearExports();
  }
}

/** Opens the system print dialog with every page, one per A4 sheet. */
export async function printDocument(
  document: VaultDocument,
  progress: ExportProgress = NO_PROGRESS,
): Promise<void> {
  const Print = await loadPrint();
  progress('preparing');
  let html: string;
  try {
    html = printableHtml(await pageDataUris(document));
  } finally {
    progress('ready');
  }
  await Print.printAsync({ html, ...A4 });
}
