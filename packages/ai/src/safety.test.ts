/**
 * Safety regression tests.
 * docs/DEVELOPMENT_RULES.md §1 rule 5 — `customer.aadhaar` may carry the full number; every
 * other field still has Aadhaar-like numbers masked out, bar an education roll / registration /
 * marksheet number's own digits (docs/AI_PIPELINE.md §9).
 */

import { describe, expect, it } from 'vitest';
import {
  aadhaarLikeNumbers,
  containsAadhaarLikeNumber,
  maskIdentifiersInText,
  sanitizeExtractedFields,
  sanitizeRawText,
} from './safety';
import type { ExtractedField } from './types';

function field(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    key: 'customer.full_name',
    label: 'Name',
    value: 'Sunita Devi',
    confidence: 0.9,
    sourceText: 'Name : Sunita Devi',
    page: 1,
    bbox: null,
    status: 'ok',
    reviewReason: null,
    ...overrides,
  };
}

describe('maskIdentifiersInText', () => {
  it.each([
    ['2000 0000 0000', 'XXXX XXXX 0000'],
    ['200000000000', 'XXXX XXXX 0000'],
    ['2000-0000-0000', 'XXXX XXXX 0000'],
  ])('masks %s down to the last four', (input, expected) => {
    expect(maskIdentifiersInText(input)).toBe(expected);
  });

  it('masks an Aadhaar-like number embedded in a sentence', () => {
    expect(maskIdentifiersInText('आधार संख्या : 2000 0000 0000 जारी')).toBe(
      'आधार संख्या : XXXX XXXX 0000 जारी',
    );
  });

  it('masks numbers that fail the Verhoeff check too', () => {
    // Deliberately broader than looksLikeAadhaar(): a mistyped Aadhaar is still an Aadhaar we
    // must not store.
    expect(maskIdentifiersInText('1111 1111 1111')).toBe('XXXX XXXX 1111');
  });

  it('leaves shorter and longer digit runs alone', () => {
    expect(maskIdentifiersInText('Roll Number : 1234567')).toBe('Roll Number : 1234567');
    expect(maskIdentifiersInText('Txn 1234567890123456')).toBe('Txn 1234567890123456');
    expect(maskIdentifiersInText('PIN 261001')).toBe('PIN 261001');
  });

  it('does not mangle a PAN', () => {
    expect(maskIdentifiersInText('ZZZPD1234Q')).toBe('ZZZPD1234Q');
  });

  // An e-Aadhaar's text puts the date of birth just above the number. A single left-to-right
  // match took "1990 2000 1111" and left eight of the Aadhaar's digits in the clear.
  it('masks an Aadhaar on the line after a birth year', () => {
    const masked = maskIdentifiersInText('DOB : 01/01/1990\n2000 1111 2222');
    expect(masked).toBe('DOB : 01/01/XXXX\nXXXX XXXX 2222');
    expect(masked).not.toContain('1111');
    expect(containsAadhaarLikeNumber(masked)).toBe(false);
  });

  it('masks an Aadhaar printed right after a year on the same line', () => {
    const masked = maskIdentifiersInText('DOB 01/01/1990 2000 1111 2222');
    expect(masked).toBe('DOB 01/01/XXXX XXXX XXXX 2222');
    expect(containsAadhaarLikeNumber(masked)).toBe(false);
  });

  it.each([
    ['2000  1111  2222', 'XXXX XXXX 2222'],
    ['2000\t1111\t2222', 'XXXX XXXX 2222'],
    ['2000 - 1111 - 2222', 'XXXX XXXX 2222'],
    ['2000 1111\n2222', 'XXXX XXXX\n2222'],
    ['2000\r\n1111\r\n2222', 'XXXX\r\nXXXX\r\n2222'],
  ])('masks %j however the groups are separated', (input, expected) => {
    expect(maskIdentifiersInText(input)).toBe(expected);
    expect(containsAadhaarLikeNumber(maskIdentifiersInText(input))).toBe(false);
  });

  it('leaves the last four only, even in a longer run of groups', () => {
    const masked = maskIdentifiersInText('Card 2000 1111 2222 3333');
    expect(masked).toBe('Card XXXX XXXX XXXX 3333');
  });

  it('is idempotent', () => {
    const once = maskIdentifiersInText('DOB 1990\n2000 1111 2222, ID 200011112222');
    expect(maskIdentifiersInText(once)).toBe(once);
  });
});

describe('sanitizeRawText', () => {
  it('leaves no Aadhaar-like number in multi-line OCR text', () => {
    const raw = 'Test Person\nDOB : 01/01/1990\nMale\n2000 1111 2222\nVID : 9100 2000 1111 2222';
    const safe = sanitizeRawText(raw);
    expect(containsAadhaarLikeNumber(safe)).toBe(false);
    expect(safe).not.toMatch(/1111|9100/);
    expect(safe).toContain('Test Person');
  });
});

describe('containsAadhaarLikeNumber', () => {
  it('is stateless across calls', () => {
    // The underlying regex is /g, so a leaked lastIndex would make every other call wrong.
    expect(containsAadhaarLikeNumber('2000 0000 0000')).toBe(true);
    expect(containsAadhaarLikeNumber('2000 0000 0000')).toBe(true);
    expect(containsAadhaarLikeNumber('no numbers here')).toBe(false);
    containsAadhaarLikeNumber('2000 0000 0000');
    expect(aadhaarLikeNumbers('2000 0000 0000')).toEqual(['200000000000']);
  });

  it('sees an Aadhaar behind a birth year, and every overlapping reading', () => {
    expect(containsAadhaarLikeNumber('DOB 1990\n2000 1111 2222')).toBe(true);
    expect(aadhaarLikeNumbers('1990 2000 1111 2222')).toEqual(['199020001111', '200011112222']);
  });
});

describe('sanitizeExtractedFields', () => {
  it('reduces an Aadhaar value to its last four', () => {
    const [result] = sanitizeExtractedFields([
      field({ key: 'customer.aadhaar_last4', value: '2000 0000 0000' }),
    ]);
    expect(result?.value).toBe('0000');
  });

  it('masks the source snippet so the full number is never persisted', () => {
    const [result] = sanitizeExtractedFields([
      field({
        key: 'customer.aadhaar_last4',
        value: '0000',
        sourceText: 'आधार संख्या / Aadhaar Number : 2000 0000 0000',
      }),
    ]);
    expect(result?.sourceText).toBe('आधार संख्या / Aadhaar Number : XXXX XXXX 0000');
    expect(containsAadhaarLikeNumber(result?.sourceText ?? '')).toBe(false);
  });

  it('retains fields keyed to customer.aadhaar for auto-fill, value and source snippet both', () => {
    const result = sanitizeExtractedFields([
      field({
        key: 'customer.aadhaar',
        value: '200000000000',
        sourceText: 'आधार संख्या / Aadhaar Number : 2000 0000 0000',
      }),
    ]);
    expect(result.length).toBe(1);
    expect(result[0]?.key).toBe('customer.aadhaar');
    expect(result[0]?.value).toBe('200000000000');
    expect(result[0]?.sourceText).toBe('आधार संख्या / Aadhaar Number : 2000 0000 0000');
  });

  it('drops an Aadhaar value too short to be a last-four', () => {
    expect(sanitizeExtractedFields([field({ key: 'customer.aadhaar_last4', value: '12' })])).toEqual(
      [],
    );
  });

  it('masks an Aadhaar that leaked into an unrelated field', () => {
    const [result] = sanitizeExtractedFields([
      field({ key: 'customer.address.printed', value: 'Rampur, ID 2000 0000 0000' }),
    ]);
    expect(result?.value).toBe('Rampur, ID XXXX XXXX 0000');
  });

  describe('education numbers that happen to be twelve digits', () => {
    const roll = (overrides: Partial<ExtractedField> = {}) =>
      field({
        key: 'customer.education.graduation.roll_number',
        label: 'University Roll No.',
        value: '200000001132',
        sourceText: 'University Roll No. : 200000001132',
        ...overrides,
      });

    it.each([
      'customer.education.class10.roll_number',
      'customer.education.class12.roll_number',
      'customer.education.graduation.roll_number',
      'customer.education.graduation.registration_number',
      'customer.education.class10.marksheet_number',
    ])('keeps %s whole, value and source snippet both', (key) => {
      const [result] = sanitizeExtractedFields([roll({ key })]);
      expect(result?.value).toBe('200000001132');
      expect(result?.sourceText).toBe('University Roll No. : 200000001132');
    });

    it('keeps one printed in groups', () => {
      const [result] = sanitizeExtractedFields([
        roll({ value: '2000 0000 1132', sourceText: 'Roll No : 2000 0000 1132' }),
      ]);
      expect(result?.value).toBe('2000 0000 1132');
      expect(result?.sourceText).toBe('Roll No : 2000 0000 1132');
    });

    it.each(['Aadhaar No', 'Aadhar Number', 'Adhar', 'Adhaar', 'आधार संख्या', 'UID', 'UIDAI No'])(
      'still masks a number printed beside "%s"',
      (wording) => {
        const [bySource] = sanitizeExtractedFields([
          roll({ sourceText: `${wording} : 200000001132` }),
        ]);
        expect(bySource?.value).toBe('XXXX XXXX 1132');
        expect(containsAadhaarLikeNumber(bySource?.sourceText ?? '')).toBe(false);

        const [byLabel] = sanitizeExtractedFields([roll({ label: wording })]);
        expect(byLabel?.value).toBe('XXXX XXXX 1132');
      },
    );

    it('still masks the number this same document gave as the Aadhaar', () => {
      const result = sanitizeExtractedFields([
        roll(),
        field({
          key: 'customer.aadhaar',
          value: '200000001132',
          sourceText: 'Aadhaar : 2000 0000 1132',
        }),
      ]);
      expect(result[0]?.value).toBe('XXXX XXXX 1132');
    });

    it('still masks any other twelve-digit number in the snippet or the value', () => {
      const [snippet] = sanitizeExtractedFields([
        roll({ sourceText: 'Roll No 200000001132 ID 2000 0000 0000' }),
      ]);
      expect(snippet?.sourceText).toBe('Roll No 200000001132 ID XXXX XXXX 0000');

      const [value] = sanitizeExtractedFields([roll({ value: '12345 / 200000000000' })]);
      expect(value?.value).toBe('12345 / XXXX XXXX 0000');
    });

    it('does not extend to other education fields', () => {
      const [result] = sanitizeExtractedFields([
        roll({ key: 'customer.education.graduation.unique_id' }),
      ]);
      expect(result?.value).toBe('XXXX XXXX 1132');
    });
  });

  it('leaves ordinary fields untouched', () => {
    const [result] = sanitizeExtractedFields([field()]);
    expect(result?.value).toBe('Sunita Devi');
    expect(result?.sourceText).toBe('Name : Sunita Devi');
  });
});

describe('sanitizeRawText', () => {
  it('masks identifiers and bounds the length', () => {
    const text = sanitizeRawText('Aadhaar : 2000 0000 0000');
    expect(text).toBe('Aadhaar : XXXX XXXX 0000');
    expect(sanitizeRawText('x'.repeat(50_000)).length).toBe(20_000);
  });
});
