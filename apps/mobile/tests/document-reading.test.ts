/**
 * Reading a document on the phone (`lib/ocr/document-reading.ts`): the script choice, printed
 * rows rebuilt from side-by-side lines, the type it suggests, the few details it keeps, Aadhaar
 * numbers masked out of everything kept, and search that finds a number however it is spaced.
 * Every page here is made-up sample text, not a real person's document.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_READING,
  isKeptField,
  MAX_READ_FIELDS,
  MAX_SEARCH_TEXT,
  pickLines,
  readDocument,
  rowsOf,
  searchTextOf,
  textMatches,
} from '../lib/ocr/document-reading';
import type { PageText, TextLine } from '../lib/vision/on-device-vision';

/** Lines laid out down a page: each entry is one printed row, its cells left to right. */
function page(rows: readonly (readonly string[])[]): PageText {
  const lines: TextLine[] = rows.flatMap((cells, row) =>
    cells.map((text, cell) => ({
      text,
      box: [40 + cell * 500, 100 + row * 60, 40 + cell * 500 + 300, 140 + row * 60] as const,
    })),
  );
  return {
    width: 2480,
    height: 3508,
    // Both models read an English page; the English reading is the one kept.
    latin: lines,
    devanagari: lines,
  };
}

const MARKSHEET_10 = page([
  ['SAMPLE BOARD OF SECONDARY EDUCATION'],
  ['SECONDARY SCHOOL EXAMINATION 2021'],
  ['Roll No', '2112345'],
  ['Name', 'ASHA DEVI SAMPLE'],
  ["Father's Name", 'RAMESH SAMPLE'],
  ['Date of Birth', '15/08/2005'],
]);

describe('pickLines', () => {
  it('uses the English reading for an English page', () => {
    const latin: TextLine[] = [{ text: 'INCOME TAX DEPARTMENT', box: [0, 0, 10, 10] }];
    const devanagari: TextLine[] = [{ text: 'INC0ME TAX DEPARTMENT', box: [0, 0, 10, 10] }];
    expect(pickLines({ width: 1, height: 1, latin, devanagari })).toBe(latin);
  });

  it('uses the Devanagari reading when the page has a real share of Hindi', () => {
    const latin: TextLine[] = [{ text: '??? ?????', box: [0, 0, 10, 10] }];
    const devanagari: TextLine[] = [{ text: 'आय प्रमाण पत्र Income Certificate', box: [0, 0, 10, 10] }];
    expect(pickLines({ width: 1, height: 1, latin, devanagari })).toBe(devanagari);
  });

  it('falls back to whichever model could run', () => {
    const devanagari: TextLine[] = [{ text: 'Roll No', box: [0, 0, 10, 10] }];
    expect(pickLines({ width: 1, height: 1, latin: null, devanagari })).toBe(devanagari);
    expect(pickLines({ width: 1, height: 1, latin: null, devanagari: null })).toEqual([]);
  });
});

describe('rowsOf', () => {
  it('joins a label and the value printed beside it into one row', () => {
    const rows = rowsOf([
      { text: '2112345', box: [600, 102, 800, 140] },
      { text: 'Roll No', box: [40, 100, 200, 138] },
      { text: 'Name', box: [40, 160, 140, 198] },
    ]);
    expect(rows.map((row) => row.text)).toEqual(['Roll No  2112345', 'Name']);
    expect(rows[0]?.box).toEqual([40, 100, 800, 140]);
  });

  it('keeps rows top to bottom and drops blank lines', () => {
    const rows = rowsOf([
      { text: 'second', box: [0, 200, 10, 230] },
      { text: '  ', box: [0, 150, 10, 180] },
      { text: 'first', box: [0, 100, 10, 130] },
    ]);
    expect(rows.map((row) => row.text)).toEqual(['first', 'second']);
  });
});

describe('readDocument', () => {
  it('recognises a 10th marksheet and reads its roll number and date of birth', () => {
    const reading = readDocument([MARKSHEET_10]);
    expect(reading.suggestedType).toBe('marksheet_10');
    const keys = reading.fields.map((field) => field.key);
    expect(keys).toContain('customer.education.class10.roll_number');
    expect(keys).toContain('customer.date_of_birth');
    expect(reading.fields.find((field) => field.key.endsWith('roll_number'))?.value).toBe(
      '2112345',
    );
    expect(reading.fields.find((field) => field.key === 'customer.date_of_birth')?.value).toMatch(
      /2005/,
    );
    expect(reading.searchText).toContain('Roll No 2112345');
  });

  it('suggests nothing when the citizen already chose the type, but still reads for it', () => {
    const reading = readDocument([MARKSHEET_10], 'marksheet_10');
    expect(reading.suggestedType).toBeNull();
    expect(reading.fields.length).toBeGreaterThan(0);
  });

  it('suggests nothing for text it cannot place', () => {
    const reading = readDocument([page([['Shopping list'], ['rice, dal, two kilos of onions']])]);
    expect(reading.suggestedType).toBeNull();
    expect(reading.searchText).toContain('onions');
  });

  it('never keeps an Aadhaar number, in the details or the search text', () => {
    const reading = readDocument([
      page([
        ['Unique Identification Authority of India'],
        ['Name', 'SAMPLE PERSON'],
        ['DOB', '01/01/1990'],
        ['1234 5678 9012'],
      ]),
    ]);
    expect(reading.suggestedType).toBe('aadhaar_like');
    expect(reading.fields.some((field) => field.key === 'customer.aadhaar')).toBe(false);
    expect(reading.fields.every((field) => !/\d{4}\s?\d{4}\s?\d{4}/.test(field.value))).toBe(true);
    expect(reading.searchText).not.toContain('1234 5678 9012');
    expect(reading.searchText).toContain('XXXX XXXX 9012');
    // A year ending the row above is not taken for the Aadhaar's first group.
    expect(reading.searchText).toContain('01/01/1990');
    expect(reading.searchText).not.toContain('5678');
  });

  it('keeps only the details worth showing, at most a dozen', () => {
    const reading = readDocument([MARKSHEET_10]);
    expect(reading.fields.length).toBeLessThanOrEqual(MAX_READ_FIELDS);
    expect(reading.fields.every((field) => isKeptField(field.key))).toBe(true);
  });

  it('is empty for a page with no text', () => {
    expect(readDocument([page([])])).toEqual(EMPTY_READING);
    expect(readDocument([])).toEqual(EMPTY_READING);
  });
});

describe('isKeptField', () => {
  it('keeps names, dates and education numbers', () => {
    for (const key of [
      'customer.full_name',
      'customer.father_name_hi',
      'customer.date_of_birth',
      'customer.education.class12.roll_number',
      'customer.education.graduation.registration_number',
      'customer.certificate.caste.issue_date',
    ]) {
      expect(isKeptField(key)).toBe(true);
    }
  });

  it('does not keep identity numbers or addresses', () => {
    for (const key of [
      'customer.aadhaar',
      'customer.aadhaar_last4',
      'customer.pan',
      'customer.voter_id',
      'customer.mobile',
      'customer.address.printed',
    ]) {
      expect(isKeptField(key)).toBe(false);
    }
  });
});

describe('searchTextOf', () => {
  it('tidies spaces, masks Aadhaar numbers and caps the length', () => {
    expect(searchTextOf('  Roll   No  \n\n 2112345 ')).toBe('Roll No\n2112345');
    expect(searchTextOf('UID 1234-5678-9012')).toBe('UID XXXX XXXX 9012');
    expect(searchTextOf('Born 1990\n1234 5678 9012')).toBe('Born 1990\nXXXX XXXX 9012');
    // Split across two rows, it is still masked.
    expect(searchTextOf('1234 5678\n9012')).not.toMatch(/1234|5678/);
    expect(searchTextOf('a'.repeat(MAX_SEARCH_TEXT + 50))).toHaveLength(MAX_SEARCH_TEXT);
  });
});

describe('textMatches', () => {
  const text = 'SECONDARY SCHOOL EXAMINATION\nRoll No 2112345\nआय प्रमाण पत्र';

  it('ignores case and extra spaces', () => {
    expect(textMatches(text, 'roll  no')).toBe(true);
    expect(textMatches(text, 'school examination')).toBe(true);
  });

  it('finds a number however it is spaced', () => {
    expect(textMatches(text, '211 2345')).toBe(true);
    expect(textMatches('Roll No 211 2345', '2112345')).toBe(true);
  });

  it('finds Hindi words', () => {
    expect(textMatches(text, 'प्रमाण')).toBe(true);
  });

  it('does not match what is not there', () => {
    expect(textMatches(text, 'income tax')).toBe(false);
    expect(textMatches(text, '9999999')).toBe(false);
  });
});
