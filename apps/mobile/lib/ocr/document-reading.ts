/**
 * Reading a document on the phone: what kind of paper it is, the few details worth showing
 * (name, date of birth, roll number…), and its text for searching the vault.
 *
 * The phone's text recogniser (`lib/vision/on-device-vision.ts`) reads each page twice, once for
 * English and once for Devanagari; this module is the pure part, unit tested:
 *
 * - `pickLines` keeps the reading that suits the page's script.
 * - `rowsOf` puts lines that sit side by side back into one printed row, so "Roll No" and the
 *   number printed beside it become the `label  value` pair the label dictionary reads.
 * - `readDocument` classifies the text and extracts its fields with the same rules the
 *   operator dashboard uses (`@assistigo/ai`), keeps only `KEPT_FIELD` keys, and masks every
 *   Aadhaar-like number in the search text to its last four digits.
 *
 * What comes out is a proposal shown to the citizen, who can change the type and name. It stays
 * on the phone: the fields go into the encrypted vault index and the text into an encrypted file
 * beside the pages (`vault-storage.ts`); neither is synced, uploaded or logged.
 */

import {
  classifyDocument,
  extractFields,
  maskIdentifiersInText,
  type OcrBlock,
} from '@assistigo/ai/on-device';
import type { DocumentType } from '@assistigo/core';

import type { Box, PageText, TextLine } from '../vision/on-device-vision';

/** Bumped when reading improves enough that older documents should be read again. */
export const READING_VERSION = 1;
/** Pages read per document: a booklet's first ten carry what anyone searches for. */
export const MAX_READ_PAGES = 10;
/** Characters of a document's text kept for search. */
export const MAX_SEARCH_TEXT = 20_000;
/** Details kept per document. */
export const MAX_READ_FIELDS = 12;
/** Longest detail kept. */
export const MAX_FIELD_VALUE = 160;

/**
 * The details kept: who the paper is about, when they were born, and the numbers and dates a
 * form asks for from a marksheet or certificate. Identity numbers (Aadhaar, PAN, voter ID) are
 * not kept as details; the document itself is in the vault.
 */
const KEPT_FIELD =
  /^customer\.(?:(?:full|father|mother)_name(?:_hi)?|date_of_birth|gender|education\.[a-z0-9]+\.(?:roll_number|registration_number|passing_year|board|marks_percentage|result)|certificate\.[a-z]+\.(?:number|issue_date))$/;

export function isKeptField(key: string): boolean {
  return KEPT_FIELD.test(key);
}

/** Types the reading may suggest: real papers the vault files, not "unknown" or a bare image. */
const NOT_SUGGESTED: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'unknown',
  'generic',
  'photo',
  'signature',
  'receipt',
  'application_pdf',
]);

export type ReadField = { readonly key: string; readonly value: string };

export type DocumentReading = {
  /** What the paper looks like it is; null when the reading cannot say. */
  readonly suggestedType: DocumentType | null;
  readonly fields: readonly ReadField[];
  /** The text, Aadhaar-like numbers masked, for search. Empty when nothing was read. */
  readonly searchText: string;
};

export const EMPTY_READING: DocumentReading = { suggestedType: null, fields: [], searchText: '' };

const DEVANAGARI = /\p{Script=Devanagari}/gu;
const LETTER = /\p{L}/gu;
/** A page is Devanagari when at least this share of what the Devanagari model read is. */
const DEVANAGARI_SHARE = 0.15;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * The lines to use for a page. The Devanagari model also reads English, so it is used whenever
 * the page has a real share of Devanagari (a bilingual certificate); an English-only page uses
 * the English model, which reads English better.
 */
export function pickLines(page: PageText): readonly TextLine[] {
  const devanagari = page.devanagari ?? [];
  const text = devanagari.map((line) => line.text).join(' ');
  const letters = count(text, LETTER);
  if (letters > 0 && count(text, DEVANAGARI) / letters >= DEVANAGARI_SHARE) return devanagari;
  return page.latin ?? devanagari;
}

export type Row = { readonly text: string; readonly box: Box };

/**
 * Lines grouped into printed rows, top to bottom, each row's lines left to right and joined by
 * two spaces (the label dictionary's column gap). A line joins a row when most of the shorter of
 * the two overlaps vertically.
 */
export function rowsOf(lines: readonly TextLine[]): Row[] {
  const sorted = [...lines]
    .filter((line) => line.text.trim() !== '')
    .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const rows: { lines: TextLine[]; top: number; bottom: number }[] = [];
  for (const line of sorted) {
    const [, top, , bottom] = line.box;
    const row = rows.find((candidate) => {
      const overlap = Math.min(candidate.bottom, bottom) - Math.max(candidate.top, top);
      const shorter = Math.max(1, Math.min(candidate.bottom - candidate.top, bottom - top));
      return overlap / shorter >= 0.5;
    });
    if (row) {
      row.lines.push(line);
      row.top = Math.min(row.top, top);
      row.bottom = Math.max(row.bottom, bottom);
    } else {
      rows.push({ lines: [line], top, bottom });
    }
  }
  return rows
    .sort((a, b) => a.top - b.top)
    .map((row) => {
      const ordered = row.lines.sort((a, b) => a.box[0] - b.box[0]);
      return {
        text: ordered.map((line) => line.text.trim()).join('  '),
        box: [
          Math.min(...ordered.map((line) => line.box[0])),
          row.top,
          Math.max(...ordered.map((line) => line.box[2])),
          row.bottom,
        ] as const,
      };
    });
}

/** The phone's recogniser does not report a confidence; a printed page reads well. */
const LINE_CONFIDENCE = 0.9;

/**
 * Trimmed, runs of spaces and blank lines collapsed, Aadhaar-like numbers masked, capped.
 *
 * Each printed row is masked on its own first: the shared mask allows any whitespace between a
 * number's groups, so over the joined text a year ending one row ("DOB 01/01/1990") and an
 * Aadhaar starting the next read as one twelve-digit run, and the Aadhaar's last eight digits
 * survived. The joined text is then masked again, for a number split across two rows.
 */
export function searchTextOf(text: string): string {
  const tidy = text
    .split('\n')
    .map((line) => maskIdentifiersInText(line.replace(/\s+/g, ' ').trim()))
    .filter((line) => line !== '')
    .join('\n');
  return maskIdentifiersInText(tidy).slice(0, MAX_SEARCH_TEXT);
}

/**
 * Reads a document from its pages' text. `chosenType` is what the citizen (or a preset)
 * already said it is: fields are then extracted for that type, and nothing is suggested.
 */
export function readDocument(
  pages: readonly PageText[],
  chosenType: DocumentType | null = null,
): DocumentReading {
  const blocks: OcrBlock[] = pages.slice(0, MAX_READ_PAGES).flatMap((page, index) =>
    rowsOf(pickLines(page)).map((row) => ({
      text: row.text,
      page: index + 1,
      bbox: row.box,
      confidence: LINE_CONFIDENCE,
    })),
  );
  const rawText = blocks.map((block) => block.text).join('\n');
  if (rawText.trim() === '') return EMPTY_READING;

  const classification = classifyDocument({ text: rawText, filename: '', mimeType: 'image/jpeg' });
  const suggestedType =
    chosenType === null && !NOT_SUGGESTED.has(classification.documentType)
      ? classification.documentType
      : null;

  const { fields } = extractFields({
    ocr: {
      provider: 'on_device',
      providerRequestId: null,
      rawText,
      pageCount: pages.length,
      blocks,
      confidence: LINE_CONFIDENCE,
    },
    documentType: chosenType ?? suggestedType ?? 'unknown',
  });

  const kept: ReadField[] = [];
  for (const field of fields) {
    if (!isKeptField(field.key) || kept.some((each) => each.key === field.key)) continue;
    // `extractFields` already masks stray Aadhaar-like numbers; masked again, to be sure.
    const value = maskIdentifiersInText(field.value).trim().slice(0, MAX_FIELD_VALUE);
    if (value !== '') kept.push({ key: field.key, value });
    if (kept.length >= MAX_READ_FIELDS) break;
  }

  return { suggestedType, fields: kept, searchText: searchTextOf(rawText) };
}

/** Lower-cased, spaces collapsed: what a search box's text is compared against. */
function folded(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Whether `haystack` contains what the citizen typed. A number matches however it was spaced
 * on the page or in the box ("1234 567" finds "1234567").
 */
export function textMatches(haystack: string, needle: string): boolean {
  const query = folded(needle);
  if (query === '') return true;
  const text = folded(haystack);
  if (text.includes(query)) return true;
  const digits = query.replace(/[\s-]/g, '');
  return /^\d{3,}$/.test(digits) && text.replace(/[\s-]/g, '').includes(digits);
}
