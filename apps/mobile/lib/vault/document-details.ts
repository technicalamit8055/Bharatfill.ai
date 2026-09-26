/**
 * Pure rules for the Document Details screen: the subtitle and folder copy, the "Added On" line,
 * which file a document exports as and what it is called, the page the viewer is showing, and
 * the HTML a document prints from.
 *
 * The name and tags are the citizen's own data. Nothing here logs or persists them;
 * `vault-storage.ts` seals changes into the encrypted index and `document-export.ts` writes the
 * short-lived export copy.
 */

import type { Translate } from '../i18n';
import type { VaultCategoryKey } from './categories';
import type { PageMimeType } from './vault-index';
import { formatVaultDate } from './vault-screen';

// ---- Copy -----------------------------------------------------------------------------------

/** "Identity Document" under the title; "Document" before it has a folder. */
export function documentKindKey(category: VaultCategoryKey | null): string {
  return `documentDetails.kind.${category ?? 'none'}`;
}

/** The Folder row: the vault folder's full name, or "No folder". */
export function folderLabelKey(category: VaultCategoryKey | null): string {
  return category === null ? 'saveDocument.folder.none' : `vault.categories.${category}`;
}

/** "12 Sep 2026, 10:24 AM" in the phone's time zone, in the citizen's language. */
export function formatAddedOn(date: Date, t: Translate): string {
  const hours = date.getHours();
  const time = t('documentDetails.time', {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: String(date.getMinutes()).padStart(2, '0'),
    period: t(hours < 12 ? 'documentDetails.am' : 'documentDetails.pm'),
  });
  return t('documentDetails.addedOn', { date: formatVaultDate(date, t), time });
}

// ---- Export ---------------------------------------------------------------------------------

export type ExportFormat = {
  readonly extension: string;
  readonly mimeType: string;
  /** iOS Uniform Type Identifier, so the share sheet offers the right apps. */
  readonly uti: string;
};

const PDF: ExportFormat = { extension: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' };

const IMAGE_FORMATS: Record<PageMimeType, ExportFormat> = {
  'image/jpeg': { extension: 'jpg', mimeType: 'image/jpeg', uti: 'public.jpeg' },
  'image/png': { extension: 'png', mimeType: 'image/png', uti: 'public.png' },
  'image/heic': { extension: 'heic', mimeType: 'image/heic', uti: 'public.heic' },
  'image/webp': { extension: 'webp', mimeType: 'image/webp', uti: 'org.webmproject.webp' },
};

/** What a document exports as: its own image, or a PDF. */
export type ExportKind = 'image' | 'pdf';

/**
 * A booklet always exports as one PDF. A single page keeps its image format unless the citizen
 * asks for a PDF: portals ask for a JPG photo or signature, while offices and email often want
 * a PDF.
 */
export function exportFormat(
  pageCount: number,
  firstPageMimeType: PageMimeType,
  kind: ExportKind = 'image',
): ExportFormat {
  return pageCount > 1 || kind === 'pdf' ? PDF : IMAGE_FORMATS[firstPageMimeType];
}

/**
 * "JPG" for a single-page document, which can export as its image or as a PDF; null for a
 * booklet, which is always a PDF.
 */
export function imageExportName(pageCount: number, firstPageMimeType: PageMimeType): string | null {
  return pageCount === 1 ? IMAGE_FORMATS[firstPageMimeType].extension.toUpperCase() : null;
}

/** Longest file name stem, so the name fits every file system and share sheet. */
export const MAX_FILE_STEM_LENGTH = 60;

/**
 * "Aadhaar Card" → "Aadhaar_Card.pdf". Letters and digits in any script are kept; everything
 * else becomes a single underscore. A name with nothing usable left becomes "Document".
 */
export function exportFileName(title: string, extension: string): string {
  const stem = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+/, '')
    .slice(0, MAX_FILE_STEM_LENGTH)
    .replace(/_+$/, '');
  return `${stem.length > 0 ? stem : 'Document'}.${extension}`;
}

const PAGE_DATA_URI = /^data:image\/(?:jpeg|png|heic|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * One A4 sheet per page, each image scaled to fit. Only decrypted vault pages go in, and each
 * must be a base64 image data URI, so nothing in the document can inject markup.
 */
export function printableHtml(pageDataUris: readonly string[]): string {
  if (pageDataUris.length === 0) throw new RangeError('A document needs at least one page.');
  const pages = pageDataUris.map((uri, index) => {
    if (!PAGE_DATA_URI.test(uri)) throw new TypeError(`Page ${index + 1} is not an image.`);
    return `<div class="page"><img src="${uri}" alt="" /></div>`;
  });

  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<style>',
    '@page { size: A4; margin: 10mm; }',
    'html, body { margin: 0; padding: 0; background: #fff; }',
    '.page { display: flex; align-items: center; justify-content: center; height: 277mm; }',
    '.page:not(:last-child) { break-after: page; page-break-after: always; }',
    'img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }',
    '</style></head><body>',
    ...pages,
    '</body></html>',
  ].join('');
}

/** A picker or share sheet the citizen closed, as opposed to one that failed. */
export function isCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const { code } = error as { code: unknown };
  return typeof code === 'string' && code.toUpperCase().includes('CANCEL');
}

// ---- Page viewer ----------------------------------------------------------------------------

/**
 * The page the viewer counts as showing: the last one whose top edge has passed a third of the
 * way down the frame. `pageTops` are each page's offset in the scroll content, in page order.
 */
export function visiblePageIndex(
  pageTops: readonly number[],
  scrollY: number,
  frameHeight: number,
): number {
  const line = scrollY + frameHeight / 3;
  let index = 0;
  for (const [each, top] of pageTops.entries()) {
    if (top <= line) index = each;
  }
  return index;
}
