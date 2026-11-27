/**
 * Extraction safety rules.
 * docs/DEVELOPMENT_RULES.md §1 rule 5, master spec §11.2, §19.3.
 *
 * OCR reads whatever is printed on the page, which for an Aadhaar card is a full twelve-digit
 * number. Everything downstream of the provider — extracted fields, source snippets, and the
 * retained raw text — passes through here first.
 *
 * `customer.aadhaar` is the deliberate exception: the product now stores and uses the full
 * number (with customer consent), so its value and source snippet both survive untouched. Every
 * other field, and all raw OCR retention, still has Aadhaar-like numbers masked — a stray number
 * that leaked into an unrelated field is not the customer's consented, reviewed Aadhaar value,
 * and rule 7 (no PII in logs/error reports/portal adapter reports) still applies to it.
 *
 * Education roll, registration and marksheet numbers are the second exception (product owner,
 * 2026-11-24): boards and universities issue twelve-digit ones, and masking those destroyed the
 * very number the operator needs. See `isPrintedEducationNumber` for what keeps it narrow.
 */

import { isForbiddenFieldKey } from '@assistigo/core';
import type { ExtractedField } from './types';

/**
 * What counts as Aadhaar-like: twelve digits, whole or grouped in fours (4-4-4, 8-4, 4-8), not
 * glued to a longer digit run.
 *
 * Deliberately broader than `looksLikeAadhaar()` in core: that function applies the Verhoeff
 * checksum to decide whether a number *is* an Aadhaar, which is the right question when
 * classifying a document. Here the question is whether something might be one, and a
 * mistyped or misread Aadhaar is still an Aadhaar we must not store.
 *
 * Matching works on a *run* of digit blocks joined by short separators (spaces, tabs, line
 * breaks, hyphens — OCR and PDF text put any of them between the groups), and masks every
 * twelve-digit window in the run, overlapping ones included. A single left-to-right match is not
 * enough: in "DOB 01/01/1990⏎2000 1111 2222" it takes "1990 2000 1111" first and leaves eight of
 * the Aadhaar's digits in the clear. Masking the union means a four-digit number printed right
 * before an Aadhaar (a birth year, usually) is masked too — the safe side to err on.
 */
const DIGIT_RUN = /\d+(?:[\s-]{1,3}\d+)*/g;
const DIGIT_BLOCK = /\d+/g;
const AADHAAR_DIGITS = 12;
const GROUP = 4;

interface DigitBlock {
  readonly start: number;
  readonly end: number;
  readonly digits: string;
}

/** Twelve digits made of whole, consecutive blocks: block indices `first`..`last`. */
interface AadhaarWindow {
  readonly first: number;
  readonly last: number;
  readonly digits: string;
}

function blocksOf(run: string): DigitBlock[] {
  return [...run.matchAll(DIGIT_BLOCK)].map((match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length, digits: match[0] };
  });
}

function windowsOf(blocks: readonly DigitBlock[]): AadhaarWindow[] {
  const windows: AadhaarWindow[] = [];
  for (let first = 0; first < blocks.length; first += 1) {
    let digits = '';
    for (let last = first; last < blocks.length && digits.length < AADHAAR_DIGITS; last += 1) {
      const block = blocks[last];
      if (!block || block.digits.length % GROUP !== 0) break;
      digits += block.digits;
      if (digits.length === AADHAAR_DIGITS) windows.push({ first, last, digits });
    }
  }
  return windows;
}

/**
 * One run with every Aadhaar-like window masked down to its last four, except windows whose
 * digits are `keepDigits` (an education number the field itself holds). Masked groups read
 * `XXXX`, separated by single spaces; line breaks between blocks are left where they were.
 */
function maskRun(run: string, keepDigits: string | null): string {
  const blocks = blocksOf(run);
  const windows = windowsOf(blocks);
  if (windows.length === 0) return run;

  // Per block, per group of four: masked or not.
  const masked = blocks.map((block) =>
    new Array<boolean>(Math.ceil(block.digits.length / GROUP)).fill(false),
  );
  const kept = blocks.map((block) =>
    new Array<boolean>(Math.ceil(block.digits.length / GROUP)).fill(false),
  );
  for (const window of windows) {
    const marks = window.digits === keepDigits ? kept : masked;
    for (let index = window.first; index <= window.last; index += 1) {
      const groups = marks[index];
      if (!groups) continue;
      // The window's last four stay visible — unless another window masks them.
      const upTo = index === window.last && marks === masked ? groups.length - 1 : groups.length;
      for (let group = 0; group < upTo; group += 1) groups[group] = true;
    }
  }
  // The kept number is shown anyway, so its groups are never masked by an overlapping window.
  masked.forEach((groups, index) =>
    groups.forEach((_, group) => {
      if (kept[index]?.[group]) groups[group] = false;
    }),
  );

  let out = '';
  blocks.forEach((block, index) => {
    const groups = masked[index] ?? [];
    const blockMasked = groups.some(Boolean);
    const previous = blocks[index - 1];
    if (previous) {
      const separator = run.slice(previous.end, block.start);
      const touchesMask = blockMasked || (masked[index - 1] ?? []).some(Boolean);
      out += touchesMask && !/[\r\n]/.test(separator) ? ' ' : separator;
    }
    if (!blockMasked) {
      out += block.digits;
      return;
    }
    groups.forEach((isMasked, group) => {
      if (group > 0) out += isMasked || groups[group - 1] ? ' ' : '';
      out += isMasked ? 'XXXX' : block.digits.slice(group * GROUP, (group + 1) * GROUP);
    });
  });
  return out;
}

/**
 * Masks Aadhaar-like runs, keeping the last four — the only part the product is allowed to
 * retain (§19.3). Applied to every string that will be persisted.
 */
export function maskIdentifiersInText(text: string): string {
  return text.replace(DIGIT_RUN, (run) => maskRun(run, null));
}

/** Education identifiers a board or university prints, which are often twelve digits long. */
const EDUCATION_NUMBER_KEY =
  /^customer\.education\.[a-z0-9]+\.(roll_number|registration_number|marksheet_number)$/;

/**
 * Words that say a number is an Aadhaar, whatever field it was filed under. `\b` is ASCII-only in
 * JS regexes, so only the Latin abbreviations are word-bounded.
 */
const AADHAAR_WORDING = /\ba+dh?a+r|आधार|\b(?:uid|uidai|vid)\b|unique\s+identi/i;

function digitsOf(text: string): string {
  return text.replace(/\D+/g, '');
}

/** The Aadhaar-like numbers in a text, digits only — overlapping readings included. */
export function aadhaarLikeNumbers(text: string): string[] {
  return [...text.matchAll(DIGIT_RUN)].flatMap((match) =>
    windowsOf(blocksOf(match[0])).map((window) => window.digits),
  );
}

/**
 * Whether this field's twelve digits are a roll / registration / marksheet number to keep, not
 * an Aadhaar that leaked in. All three must hold: the key is one of those education numbers, the
 * whole value is that one number, and nothing in the extraction says it is an Aadhaar — neither
 * the wording beside it nor the same digits read as this document's Aadhaar.
 */
function isPrintedEducationNumber(
  field: ExtractedField,
  aadhaarNumbers: ReadonlySet<string>,
): boolean {
  if (!EDUCATION_NUMBER_KEY.test(field.key)) return false;
  const digits = digitsOf(field.value);
  if (digits.length !== 12 || !/^[\d\s-]+$/.test(field.value)) return false;
  if (AADHAAR_WORDING.test(field.label) || AADHAAR_WORDING.test(field.sourceText)) return false;
  return !aadhaarNumbers.has(digits);
}

/** Masks every Aadhaar-like run in a snippet except the one number the field itself holds. */
function maskIdentifiersExcept(text: string, keepDigits: string): string {
  return text.replace(DIGIT_RUN, (run) => maskRun(run, keepDigits));
}

/** True when the text still carries something that looks like a full Aadhaar. */
export function containsAadhaarLikeNumber(text: string): boolean {
  return aadhaarLikeNumbers(text).length > 0;
}

/**
 * The last gate before an extraction is persisted or returned.
 *
 * Drops any field whose key has no legitimate storage location, and masks identifiers out of
 * both the value and the source snippet — except for `customer.aadhaar`, the one field allowed
 * to carry a full Aadhaar end to end. A field keyed `customer.aadhaar_last4` keeps its
 * four-digit value, and an education roll / registration / marksheet number keeps its own twelve
 * digits (`isPrintedEducationNumber`); every other field has any Aadhaar-like run masked out.
 */
export function sanitizeExtractedFields(fields: readonly ExtractedField[]): ExtractedField[] {
  const safe: ExtractedField[] = [];

  const aadhaarNumbers = new Set(
    fields
      .filter((field) => field.key === 'customer.aadhaar' || field.key === 'customer.aadhaar_last4')
      .flatMap((field) => [
        ...aadhaarLikeNumbers(field.value),
        ...aadhaarLikeNumbers(field.sourceText),
      ]),
  );

  for (const field of fields) {
    if (isForbiddenFieldKey(field.key)) continue;

    if (isPrintedEducationNumber(field, aadhaarNumbers)) {
      safe.push({
        ...field,
        sourceText: maskIdentifiersExcept(field.sourceText, digitsOf(field.value)),
      });
      continue;
    }

    let value: string;
    if (field.key === 'customer.aadhaar') {
      const digits = field.value.replace(/\D+/g, '');
      value = digits.length >= 12 ? digits.slice(-12) : field.value;
    } else if (field.key === 'customer.aadhaar_last4') {
      const digits = field.value.replace(/\D+/g, '');
      if (digits.length < 4) continue;
      value = digits.slice(-4);
    } else {
      value = maskIdentifiersInText(field.value);
    }

    if (value.trim() === '') continue;

    safe.push({
      ...field,
      value,
      sourceText: field.key === 'customer.aadhaar' ? field.sourceText : maskIdentifiersInText(field.sourceText),
    });
  }

  return safe;
}

/**
 * Raw OCR text is retained only until the extraction is reviewed (docs/AI_PIPELINE.md §7), but
 * even that window is too long to hold a full Aadhaar, so it is masked on the way in.
 */
export function sanitizeRawText(rawText: string, maxLength = 20_000): string {
  return maskIdentifiersInText(rawText).slice(0, maxLength);
}
