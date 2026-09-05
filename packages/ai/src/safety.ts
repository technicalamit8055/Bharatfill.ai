/**
 * Extraction safety rules.
 * docs/DEVELOPMENT_RULES.md §1 rule 5, master spec §11.2, §19.3.
 *
 * OCR reads whatever is printed on the page, which for an Aadhaar card is a full twelve-digit
 * number. Everything downstream of the provider — extracted fields, source snippets, and the
 * retained raw text — passes through here first.
 *
 * `customer.aadhaar` is the one deliberate exception: the product now stores and uses the full
 * number (with customer consent), so its value and source snippet both survive untouched. Every
 * other field, and all raw OCR retention, still has Aadhaar-like numbers masked — a stray number
 * that leaked into an unrelated field is not the customer's consented, reviewed Aadhaar value,
 * and rule 7 (no PII in logs/error reports/portal adapter reports) still applies to it.
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
 * to carry the full number end to end. A field keyed `customer.aadhaar_last4` keeps its
 * four-digit value; every other field has any Aadhaar-like run masked out of its value.
 */
export function sanitizeExtractedFields(fields: readonly ExtractedField[]): ExtractedField[] {
  const safe: ExtractedField[] = [];

  for (const field of fields) {
    if (isForbiddenFieldKey(field.key)) continue;

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
