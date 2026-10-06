/**
 * Tests for `buildFieldsFromStructuredOutput` — the path a vendor's structured-mode response
 * (an organization's custom prompt) takes to become review-ready fields.
 *
 * The one thing every test here is really checking: a custom prompt changes how a field is
 * proposed, never whether it is checked. Normalisation, high-risk review, and the Aadhaar
 * safety gate must all still apply, exactly as they do for the rules-engine path in
 * pipeline.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildFieldsFromStructuredOutput, extractFields, splitMultiLabelLine } from './extract';
import { ALL_EXTRACTABLE_FIELD_KEYS } from './rules';
import type { DocumentType } from '@assistigo/core';
import type { OcrResult, StructuredExtractedField } from './types';

function field(overrides: Partial<StructuredExtractedField>): StructuredExtractedField {
  return {
    key: 'customer.full_name',
    label: 'Name',
    value: 'Amit Kumar',
    confidence: 0.9,
    ...overrides,
  };
}

describe('buildFieldsFromStructuredOutput', () => {
  it('normalises a value through the same helpers the rules engine uses', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.date_of_birth', value: '14/08/1996' })],
    });

    expect(fields[0]?.value).toBe('1996-08-14');
  });

  it('always sends a high-risk field to review, however confident the model claims to be', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.category', value: 'obc', confidence: 0.99 })],
    });

    expect(fields[0]?.status).toBe('needs_review');
    expect(fields[0]?.reviewReason).toBe('high_risk_field');
  });

  it('masks an Aadhaar-like number wherever it turns up, not just under the aadhaar key', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.address.printed', value: 'ID 123456789012, Ghazipur' })],
    });

    expect(fields[0]?.value).toContain('XXXX XXXX 9012');
    expect(fields[0]?.value).not.toContain('123456789012');
  });

  it('reduces an aadhaar_last4 field to four digits regardless of what the model sent', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.aadhaar_last4', value: '123456789012' })],
    });

    expect(fields[0]?.value).toBe('9012');
  });

  it('accepts customer.aadhaar and still sends it to review like any other high-risk field', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.aadhaar', value: '123456789012' })],
    });

    expect(fields[0]?.value).toBe('123456789012');
    expect(fields[0]?.status).toBe('needs_review');
    expect(fields[0]?.reviewReason).toBe('high_risk_field');
  });

  it('drops a key that is not part of the customer field registry, with a warning', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.made_up_field_the_model_invented' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('STRUCTURED_UNKNOWN_FIELD');
  });

  it('drops a value that fails the field-appropriate format check, with a warning', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.mobile', value: 'not a phone number' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('VALUE_NOT_UNDERSTOOD');
  });

  it('keeps the higher-confidence field when the model proposes the same key twice', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [
        field({ value: 'Amit Kumar', confidence: 0.5 }),
        field({ value: 'Amit  Kumar', confidence: 0.95 }),
      ],
    });

    expect(fields).toHaveLength(1);
    expect(fields[0]?.confidence).toBe(0.95);
  });

  it('falls back to the registry label when the model omits one', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ label: '' })],
    });

    expect(fields[0]?.label).toBe('Full name');
  });

  it('reports no fields found when every candidate is dropped', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ value: '' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('NO_FIELDS_FOUND');
  });

  it('accepts a field with no printed-line context, since structured mode has none', () => {
    const { fields } = buildFieldsFromStructuredOutput({ fields: [field({})] });
    expect(fields[0]?.page).toBe(1);
    expect(fields[0]?.bbox).toBeNull();
    expect(fields[0]?.sourceText).toBe('Amit Kumar');
  });
});

// ---------------------------------------------------------------------------
// Grid rows (§12.4)
// ---------------------------------------------------------------------------

/**
 * Indian certificates are printed as grids, and a grid row arrives as several label/value pairs
 * on one line — often with no colon anywhere on it.
 *
 * Half of this group is about what must *not* be split. A wrong split files a value under a
 * field it does not belong to, which is the most damaging extraction error there is (§14.4), and
 * every label word here also occurs inside ordinary values: "School" inside an address, "College"
 * inside a college's own name, "Board" inside a heading.
 */
describe('splitMultiLabelLine', () => {
  function pairs(line: string): string[] {
    return splitMultiLabelLine(line).map((pair) => `${pair.label} = ${pair.value}`);
  }

  it('splits a grid row that carries two pairs and not one colon', () => {
    expect(pairs("Candidate's Name PRITAM KUMAR Father's Name KRISHNA SINGH")).toEqual([
      "Candidate's Name = PRITAM KUMAR",
      "Father's Name = KRISHNA SINGH",
    ]);
  });

  it('splits the same row when the columns are held apart by whitespace instead', () => {
    expect(pairs("Candidate's Name    PRITAM KUMAR    Father's Name    KRISHNA SINGH")).toEqual([
      "Candidate's Name = PRITAM KUMAR",
      "Father's Name = KRISHNA SINGH",
    ]);
  });

  it('splits a row whose pairs each carry their own colon', () => {
    expect(pairs("Mother's Name: SUNITA DEVI Gender: MALE")).toEqual([
      "Mother's Name = SUNITA DEVI",
      'Gender = MALE',
    ]);
  });

  it('trusts a one-word label only when every cell in the row is short', () => {
    expect(pairs('SGPA 7.85 Result PASSED')).toEqual(['SGPA = 7.85', 'Result = PASSED']);
  });

  it('takes every pair once the row is proven, not only the two that proved it', () => {
    expect(pairs('Village Rampur Post Office Rampur Kalan District Sitapur')).toEqual([
      'Village = Rampur',
      'Post Office = Rampur Kalan',
      'District = Sitapur',
    ]);
  });

  it('reads the first cell of a row it cannot justify splitting', () => {
    // Nothing else can read this line: no colon, no double space, no second proven column.
    expect(pairs('Course B.Sc. (Hons) Physics')).toEqual(['Course = B.Sc. (Hons) Physics']);
  });

  it('does not cut a value at a label word inside it', () => {
    expect(pairs('Address: H.No 12, near Government School, Rampur')).toEqual([
      'Address = H.No 12, near Government School, Rampur',
    ]);
  });

  it("does not cut a college's own name at the word college or degree", () => {
    expect(pairs('College Name Rampur Degree College, Sitapur')).toEqual([
      'College Name = Rampur Degree College, Sitapur',
    ]);
  });

  it('keeps a bilingual label as one label', () => {
    // Only the second half carries the colon, so the row is not punctuating two pairs.
    expect(pairs("पिता का नाम / Father's Name : Ram Prasad")).toEqual([
      "पिता का नाम / Father's Name = Ram Prasad",
    ]);
  });

  it('refuses a heading that happens to begin with a label word', () => {
    // A class 10 marksheet opens with this. Split, it would propose "Board = OF HIGH".
    expect(pairs('BOARD OF HIGH SCHOOL AND INTERMEDIATE EDUCATION')).toEqual([' = ']);
  });

  it('refuses a sentence, however many label words it contains', () => {
    expect(pairs('Result will be sent by post office soon')).toEqual([' = ']);
  });
});

// ---------------------------------------------------------------------------
// Higher-education fields (§11, §12.4)
// ---------------------------------------------------------------------------

function ocrOf(text: string): OcrResult {
  return {
    provider: 'test',
    providerRequestId: null,
    rawText: text,
    pageCount: 1,
    blocks: [{ text, page: 1, bbox: null, confidence: 1 }],
    confidence: 1,
  };
}

function extract(text: string, documentType: DocumentType, allowedKeys?: readonly string[]) {
  const { fields } = extractFields({ ocr: ocrOf(text), documentType, allowedKeys });
  return new Map(fields.map((field) => [field.key, field.value]));
}

describe('graduation marksheet fields', () => {
  const MARKSHEET = [
    "Candidate's Name SUNITA DEVI Father's Name RAM PRASAD",
    "Mother's Name KAMLA DEVI Gender FEMALE",
    'Roll Number 2100567 Reg. Number 21BSC004512',
    'University Name Demo State University',
    'College Name Rampur Degree College, Sitapur',
    'Course B.Sc. (Hons) Physics',
    'SGPA 7.85 Result PASSED',
    'Year of Passing 2024',
  ].join('\n');

  it('reads every printed detail off a degree marksheet', () => {
    const values = extract(MARKSHEET, 'marksheet_graduation');

    expect(values.get('customer.full_name')).toBe('SUNITA DEVI');
    expect(values.get('customer.father_name')).toBe('RAM PRASAD');
    expect(values.get('customer.mother_name')).toBe('KAMLA DEVI');
    expect(values.get('customer.gender')).toBe('female');
    expect(values.get('customer.education.graduation.roll_number')).toBe('2100567');
    expect(values.get('customer.education.graduation.registration_number')).toBe('21BSC004512');
    expect(values.get('customer.education.graduation.university')).toBe('Demo State University');
    expect(values.get('customer.education.graduation.college')).toBe(
      'Rampur Degree College, Sitapur',
    );
    expect(values.get('customer.education.graduation.course')).toBe('B.Sc. (Hons) Physics');
    expect(values.get('customer.education.graduation.marks_percentage')).toBe('7.85');
    expect(values.get('customer.education.graduation.result')).toBe('PASSED');
    expect(values.get('customer.education.graduation.passing_year')).toBe('2024');
  });

  it("never files a degree roll number under a school class' own field", () => {
    const values = extract(MARKSHEET, 'marksheet_graduation');

    for (const key of values.keys()) {
      expect(key.startsWith('customer.education.class'), key).toBe(false);
    }
  });

  it('tells the levels apart when a label names one of them', () => {
    const values = extract(
      ['Class 10 Roll No 1234567', 'Class 12 Roll No 7654321', 'University Roll No 2100567'].join(
        '\n',
      ),
      'unknown',
    );

    expect(values.get('customer.education.class10.roll_number')).toBe('1234567');
    expect(values.get('customer.education.class12.roll_number')).toBe('7654321');
    expect(values.get('customer.education.graduation.roll_number')).toBe('2100567');
  });

  it('does not resolve a bare education label to graduation by sort order', () => {
    // "Roll No" alone genuinely does not say which certificate it came from.
    const { fields } = extractFields({
      ocr: ocrOf('Roll No: 1234567'),
      documentType: 'unknown',
    });

    expect(fields[0]?.reviewReason).toBe('ambiguous_match');
  });
});

// ---------------------------------------------------------------------------
// Unclassified documents (§12.2)
// ---------------------------------------------------------------------------

describe('an unclassified document', () => {
  const PAGE = [
    "Candidate's Name SUNITA DEVI Father's Name RAM PRASAD",
    "Mother's Name KAMLA DEVI Gender FEMALE",
    'Reg. Number 21BSC004512',
  ].join('\n');

  it('proposes every field the dictionary can read, not a shortlist', () => {
    const values = extract(PAGE, 'unknown');

    // None of these four were reachable while `unknown` held a four-field allow-list.
    expect(values.get('customer.mother_name')).toBe('KAMLA DEVI');
    expect(values.get('customer.gender')).toBe('female');
    expect(values.get('customer.education.graduation.registration_number')).toBe('21BSC004512');
    expect(values.get('customer.full_name')).toBe('SUNITA DEVI');
  });

  it('has the same scope as pasted text, since neither is an identified document', () => {
    const asUnknown = extract(PAGE, 'unknown');
    const asPastedText = extract(PAGE, 'generic', ALL_EXTRACTABLE_FIELD_KEYS);

    expect([...asUnknown.entries()]).toEqual([...asPastedText.entries()]);
  });

  it('still cannot reach a key the dictionary has no rule for', () => {
    // The label rule now targets customer.aadhaar (the full number), not aadhaar_last4.
    const values = extract('Aadhaar Number: 2000 0000 0000', 'unknown');

    expect(values.has('customer.aadhaar_last4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parent names by script (docs/FORM_ENGINE.md §7a)
// ---------------------------------------------------------------------------

describe('parent names are filed under the spelling their script says', () => {
  it('files a Devanagari father’s name as the Hindi spelling and keeps an English one as is', () => {
    const values = extract(
      [
        'पिता का नाम परीक्षण प्रसाद',
        "Father's Name PARIKSHAN PRASAD",
        'माता का नाम नमूना देवी',
      ].join('\n'),
      'marksheet_10',
    );

    expect(values.get('customer.father_name_hi')).toBe('परीक्षण प्रसाद');
    expect(values.get('customer.father_name')).toBe('PARIKSHAN PRASAD');
    expect(values.get('customer.mother_name_hi')).toBe('नमूना देवी');
    expect(values.has('customer.mother_name')).toBe(false);
  });

  it('corrects a structured answer that put a name under the wrong spelling', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [
        field({ key: 'customer.father_name', label: 'पिता का नाम', value: 'परीक्षण प्रसाद' }),
        field({ key: 'customer.mother_name_hi', label: "Mother's Name", value: 'Sample Devi' }),
      ],
    });
    const keys = fields.map((extracted) => extracted.key).sort();

    expect(keys).toEqual(['customer.father_name_hi', 'customer.mother_name']);
  });

  it('leaves the applicant’s own name where it is, whatever its script', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.full_name', value: 'परीक्षण कुमार' })],
    });

    expect(fields[0]?.key).toBe('customer.full_name');
  });
});
