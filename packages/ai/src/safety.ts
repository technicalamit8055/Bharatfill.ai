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
 * Twelve digits, optionally grouped in fours by a space or hyphen, not glued to a longer run.
 *
 * Deliberately broader than `looksLikeAadhaar()` in core: that function applies the Verhoeff
 * checksum to decide whether a number *is* an Aadhaar, which is the right question when
 * classifying a document. Here the question is whether something might be one, and a
 * mistyped or misread Aadhaar is still an Aadhaar we must not store.
 */
const AADHAAR_LIKE = /(?<!\d)(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g;

/**
 * Masks Aadhaar-like runs, keeping the last four — the only part the product is allowed to
 * retain (§19.3). Applied to every string that will be persisted.
 */
export function maskIdentifiersInText(text: string): string {
  return text.replace(AADHAAR_LIKE, (_match, _a, _b, last: string) => `XXXX XXXX ${last}`);
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

/** The Aadhaar-like numbers in a text, digits only. */
export function aadhaarLikeNumbers(text: string): string[] {
  // matchAll() starts from the regex's lastIndex, which `containsAadhaarLikeNumber` leaves set.
  AADHAAR_LIKE.lastIndex = 0;
  return [...text.matchAll(AADHAAR_LIKE)].map((match) => digitsOf(match[0]));
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
  return text.replace(AADHAAR_LIKE, (match, _a, _b, last: string) =>
    digitsOf(match) === keepDigits ? match : `XXXX XXXX ${last}`,
  );
}

/** True when the text still carries something that looks like a full Aadhaar. */
export function containsAadhaarLikeNumber(text: string): boolean {
  AADHAAR_LIKE.lastIndex = 0;
  return AADHAAR_LIKE.test(text);
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
