/**
 * PDF pages as images, drawn on the phone by Android's own PDF renderer through the local native
 * module in `modules/pdf-pages`. Used when the citizen uploads a PDF already on their phone
 * (`app/import.tsx`): each page becomes a JPEG in the app's cache and joins the capture session
 * like a scanned page, so the vault, its viewer and every export keep working on images.
 *
 * Android only. Without the module (iOS, or an older build) `isPdfImportAvailable` is false and
 * the import screen offers photos alone.
 *
 * A password-locked PDF rejects with `PdfLockedError` until it is opened with its password; on
 * phones whose renderer cannot take a password it rejects with `PdfLockedUnsupportedError`. The
 * password goes to the native module only, to open the file: it is never stored or logged.
 */

import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

import { MULTI_PAGE_LIMIT, toFileUri } from './scan-session';

/** Name the native module registers (`PdfPagesModule.kt`). */
export const PDF_PAGES_MODULE = 'BharatfillPdfPages';

type NativePdfPages = {
  supportsPasswords(): boolean;
  render(uri: string, password: string | null, maxPages: number): Promise<unknown>;
};

export interface PdfPage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface RenderedPdf {
  /** Pages in the PDF; more than `pages.length` when it did not all fit. */
  readonly pageCount: number;
  readonly pages: readonly PdfPage[];
}

/** The PDF needs its password, or the one given was wrong. */
export class PdfLockedError extends Error {
  constructor() {
    super('The PDF needs its password.');
    this.name = 'PdfLockedError';
  }
}

/** The PDF is password-locked and this phone's PDF renderer cannot take a password. */
export class PdfLockedUnsupportedError extends Error {
  constructor() {
    super('Password-locked PDFs cannot be opened on this phone.');
    this.name = 'PdfLockedUnsupportedError';
  }
}

/** The file is not a PDF the renderer can read (damaged, empty, or not a PDF at all). */
export class PdfUnreadableError extends Error {
  constructor() {
    super('The PDF could not be read.');
    this.name = 'PdfUnreadableError';
  }
}

/** There is no PDF renderer in this build. */
export class PdfImportUnavailableError extends Error {
  constructor() {
    super('PDFs cannot be imported on this phone.');
    this.name = 'PdfImportUnavailableError';
  }
}

const nativeResultSchema = z.object({
  pageCount: z.number().int().positive(),
  pages: z
    .array(
      z.object({
        uri: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1),
});

/**
 * What the native module reported, with pages as `file://` URIs. Throws when the shape is wrong
 * (a native bug), or when a page is outside local storage: the session only reads, and only
 * ever deletes, local files.
 */
export function parseRenderedPdf(raw: unknown): RenderedPdf {
  const result = nativeResultSchema.parse(raw);
  if (result.pages.length > result.pageCount) throw new Error('More pages than the PDF has.');
  return {
    pageCount: result.pageCount,
    pages: result.pages.map((page) => {
      const uri = toFileUri(page.uri);
      if (!uri.startsWith('file://')) throw new Error('A PDF page was written outside the app.');
      return { uri, width: page.width, height: page.height };
    }),
  };
}

function nativePdfPages(): NativePdfPages | null {
  try {
    return requireOptionalNativeModule<NativePdfPages>(PDF_PAGES_MODULE);
  } catch {
    return null;
  }
}

/** Whether this build can turn PDFs into pages. */
export function isPdfImportAvailable(): boolean {
  return nativePdfPages() !== null;
}

/** Whether a password-locked PDF can be opened on this phone. */
export function supportsPdfPasswords(): boolean {
  const module = nativePdfPages();
  if (!module) return false;
  try {
    return module.supportsPasswords();
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/**
 * Draws up to `maxPages` pages of the PDF at `uri` (a file in the app's cache) as JPEGs in the
 * cache. An empty password counts as none.
 */
export async function renderPdfPages(
  uri: string,
  options: { readonly password?: string; readonly maxPages: number },
): Promise<RenderedPdf> {
  const module = nativePdfPages();
  if (!module) throw new PdfImportUnavailableError();
  const maxPages = Math.min(MULTI_PAGE_LIMIT, Math.max(1, Math.floor(options.maxPages)));
  const password = options.password ? options.password : null;

  let raw: unknown;
  try {
    raw = await module.render(uri, password, maxPages);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ERR_PDF_LOCKED') throw new PdfLockedError();
    if (code === 'ERR_PDF_LOCKED_UNSUPPORTED') throw new PdfLockedUnsupportedError();
    throw new PdfUnreadableError();
  }
  return parseRenderedPdf(raw);
}
