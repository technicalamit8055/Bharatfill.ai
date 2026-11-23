/**
 * Pure rules for Upload (`app/import.tsx`): adding photos or PDFs already on the phone, without
 * opening the camera. Which picked files are accepted, what kind each one is, and how many pages
 * the session still has room for. No React Native import, so the rules are unit tested in Node.
 *
 * Accepted: PDFs (when this build can draw their pages, `pdf-pages.ts`), and JPEG or PNG images,
 * which the page processing can read. Other files are skipped and the citizen is told.
 *
 * A file's name is read only to guess its type when the picker gives none; it is never stored,
 * shown back or logged.
 */

import { MULTI_PAGE_LIMIT } from './scan-session';

export const PDF_MIME_TYPE = 'application/pdf';
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

export type ImportFileKind = 'pdf' | 'image' | 'unsupported';

/** The types the system file picker is asked to show. */
export function pickerMimeTypes(pdfAvailable: boolean): string[] {
  return pdfAvailable ? [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES] : [...IMAGE_MIME_TYPES];
}

const EXTENSION_KINDS: Record<string, Exclude<ImportFileKind, 'unsupported'>> = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
};

/**
 * What a picked file is: by its MIME type, or by its extension when the picker reports none (or
 * the generic `application/octet-stream`). A PDF is unsupported when this build cannot draw it.
 */
export function classifyPickedFile(
  file: { readonly mimeType?: string | null; readonly name?: string | null },
  pdfAvailable: boolean,
): ImportFileKind {
  const mime = (file.mimeType ?? '').trim().toLowerCase();
  let kind: ImportFileKind = 'unsupported';
  if (mime === PDF_MIME_TYPE) kind = 'pdf';
  else if ((IMAGE_MIME_TYPES as readonly string[]).includes(mime) || mime === 'image/jpg') {
    kind = 'image';
  } else if (mime === '' || mime === 'application/octet-stream') {
    const extension = /\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1]?.toLowerCase() ?? '';
    kind = EXTENSION_KINDS[extension] ?? 'unsupported';
  }
  return kind === 'pdf' && !pdfAvailable ? 'unsupported' : kind;
}

/**
 * How many more pages fit: one when replacing a page, otherwise whatever is left under the
 * session's page limit.
 */
export function importRoom(scan: {
  readonly retaking: boolean;
  readonly pageCount: number;
  readonly pageLimit: number;
}): number {
  if (scan.retaking) return 1;
  return Math.max(0, Math.min(scan.pageLimit, MULTI_PAGE_LIMIT) - scan.pageCount);
}

/**
 * What an upload left out, gathered over every file picked so the citizen gets one message at
 * the end rather than one per file.
 */
export type ImportReport = {
  /** Files that are neither a PDF nor a JPEG / PNG image. */
  readonly unsupported: boolean;
  /** PDFs that could not be read (damaged, or not really a PDF). */
  readonly unreadable: boolean;
  /** Locked PDFs whose password the citizen did not give. */
  readonly locked: boolean;
  /** Locked PDFs this phone cannot open at all. */
  readonly lockedUnsupported: boolean;
  /** Pages (of a PDF, or whole files) that did not fit under the page limit. */
  readonly overLimit: boolean;
};

export const EMPTY_IMPORT_REPORT: ImportReport = {
  unsupported: false,
  unreadable: false,
  locked: false,
  lockedUnsupported: false,
  overLimit: false,
};

export type ImportReportMessage = {
  readonly key: string;
  readonly values?: { readonly max: number };
};

/**
 * The messages (`importFiles.report.*`) for what an upload left out, most useful first; empty
 * when everything picked was added. `pageLimit` fills the over-limit message.
 */
export function importReportMessages(
  report: ImportReport,
  pageLimit: number,
): ImportReportMessage[] {
  const messages: ImportReportMessage[] = [];
  if (report.overLimit) {
    messages.push({ key: 'importFiles.report.overLimit', values: { max: pageLimit } });
  }
  if (report.lockedUnsupported) messages.push({ key: 'importFiles.report.lockedUnsupported' });
  if (report.locked) messages.push({ key: 'importFiles.report.locked' });
  if (report.unreadable) messages.push({ key: 'importFiles.report.unreadable' });
  if (report.unsupported) messages.push({ key: 'importFiles.report.unsupported' });
  return messages;
}
