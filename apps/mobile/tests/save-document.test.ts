/**
 * Save Document rules: the types offered, the name and folder following the type, tag clean-up,
 * the expiry date and its reminder time, the scan status card, and form validation.
 */

import { describe, expect, it } from 'vitest';

import {
  addTag,
  categoryAfterTypeChange,
  expiryStatus,
  expiryYearOptions,
  MAX_EXPIRY_YEARS,
  normaliseTag,
  normaliseTitle,
  reminderTime,
  removeTag,
  SAVE_DOCUMENT_TYPES,
  type SaveDocumentForm,
  scanStatus,
  titleAfterTypeChange,
  validateSaveDocument,
} from '../lib/vault/save-document';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../lib/vault/vault-index';

/** 24 Sep 2026, 14:00 on the test machine's own clock. */
const NOW = new Date(2026, 8, 24, 14, 0, 0);

const FORM: SaveDocumentForm = {
  title: 'Aadhaar Card',
  documentType: 'aadhaar_like',
  category: 'identity',
  tags: [],
  expiresOn: null,
};

describe('document types', () => {
  it('offers every type that has a vault folder, then Other', () => {
    expect(SAVE_DOCUMENT_TYPES[0]).toBe('aadhaar_like');
    expect(SAVE_DOCUMENT_TYPES.at(-1)).toBe('generic');
    expect(SAVE_DOCUMENT_TYPES).toContain('signature');
    expect(SAVE_DOCUMENT_TYPES).not.toContain('receipt');
    expect(SAVE_DOCUMENT_TYPES).not.toContain('application_pdf');
    expect(SAVE_DOCUMENT_TYPES).not.toContain('unknown');
  });
});

describe('name', () => {
  it('trims and collapses spaces', () => {
    expect(normaliseTitle('  PAN   Card \n')).toBe('PAN Card');
  });

  it('follows the type until the citizen types their own', () => {
    expect(titleAfterTypeChange('', null, 'Aadhaar Card')).toBe('Aadhaar Card');
    expect(titleAfterTypeChange('Aadhaar Card', 'Aadhaar Card', 'PAN Card')).toBe('PAN Card');
    expect(titleAfterTypeChange('My old PAN', 'Aadhaar Card', 'PAN Card')).toBe('My old PAN');
  });
});

describe('folder', () => {
  it('follows the type until the citizen picks one', () => {
    expect(categoryAfterTypeChange(null, false, 'marksheet_10')).toBe('academic');
    expect(categoryAfterTypeChange('academic', false, 'pan')).toBe('identity');
    expect(categoryAfterTypeChange('academic', false, 'generic')).toBeNull();
    expect(categoryAfterTypeChange('certificate', true, 'pan')).toBe('certificate');
    expect(categoryAfterTypeChange(null, true, 'pan')).toBeNull();
  });
});

describe('tags', () => {
  it('cleans a tag up', () => {
    expect(normaliseTag('  #Identity  ')).toBe('Identity');
    expect(normaliseTag('my   docs')).toBe('my docs');
    expect(normaliseTag('   ')).toBeNull();
    expect(normaliseTag('#')).toBeNull();
    expect(normaliseTag('x'.repeat(40))).toHaveLength(MAX_TAG_LENGTH);
  });

  it('adds a new tag at the end', () => {
    expect(addTag(['Identity'], 'Personal')).toEqual({
      kind: 'added',
      tags: ['Identity', 'Personal'],
    });
  });

  it('refuses empty, duplicate and one-too-many tags', () => {
    expect(addTag([], '  ').kind).toBe('empty');
    expect(addTag(['Identity'], 'identity').kind).toBe('duplicate');
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `tag ${index}`);
    expect(addTag(full, 'one more').kind).toBe('full');
  });

  it('removes one tag', () => {
    expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('expiry', () => {
  it('needs a real date after today, within the limit', () => {
    expect(expiryStatus('2026-09-25', NOW)).toBe('valid');
    expect(expiryStatus('2026-09-24', NOW)).toBe('not_future');
    expect(expiryStatus('2020-01-01', NOW)).toBe('not_future');
    expect(expiryStatus('2027-02-30', NOW)).toBe('invalid');
    expect(expiryStatus(`${2026 + MAX_EXPIRY_YEARS}-12-31`, NOW)).toBe('valid');
    expect(expiryStatus(`${2027 + MAX_EXPIRY_YEARS}-01-01`, NOW)).toBe('too_far');
  });

  it('offers this year and the next ones, this year first', () => {
    const years = expiryYearOptions(NOW);
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2026 + MAX_EXPIRY_YEARS);
  });
});

describe('reminder time', () => {
  it('fires 30 days before expiry at 9:00', () => {
    expect(reminderTime('2030-08-12', NOW)).toEqual(new Date(2030, 6, 13, 9, 0, 0));
  });

  it('crosses a month boundary correctly', () => {
    expect(reminderTime('2027-03-10', NOW)).toEqual(new Date(2027, 1, 8, 9, 0, 0));
  });

  it('falls back to 7 days, 1 day, then the day itself when time is short', () => {
    expect(reminderTime('2026-10-10', NOW)).toEqual(new Date(2026, 9, 3, 9, 0, 0));
    expect(reminderTime('2026-09-28', NOW)).toEqual(new Date(2026, 8, 27, 9, 0, 0));
    // Tomorrow's expiry: 1 day before is today at 9:00, already past at 14:00.
    expect(reminderTime('2026-09-25', NOW)).toEqual(new Date(2026, 8, 25, 9, 0, 0));
  });

  it('has none for a date that is not a valid expiry', () => {
    expect(reminderTime('2026-09-24', NOW)).toBeNull();
    expect(reminderTime('not a date', NOW)).toBeNull();
  });
});

describe('scan status', () => {
  const ready = { status: 'ready' as const, analysis: { detected: true } };

  it('is clear once every page is processed with its edges found', () => {
    expect(scanStatus([ready, ready])).toBe('clear');
  });

  it('asks for a crop check when a page kept the whole photo', () => {
    expect(scanStatus([ready, { status: 'ready', analysis: { detected: false } }])).toBe(
      'uncropped',
    );
  });

  it('waits while a page is still processing', () => {
    expect(scanStatus([ready, { status: 'processing', analysis: null }])).toBe('processing');
    expect(scanStatus([])).toBe('processing');
  });

  it('reports a failed page before anything else', () => {
    expect(
      scanStatus([
        { status: 'processing', analysis: null },
        { status: 'failed', analysis: null },
      ]),
    ).toBe('failed');
  });
});

describe('validation', () => {
  it('returns the details to store', () => {
    expect(
      validateSaveDocument(
        { ...FORM, title: '  Aadhaar  Card ', tags: ['Identity'], expiresOn: '2030-08-12' },
        NOW,
      ),
    ).toEqual({
      ok: true,
      details: {
        title: 'Aadhaar Card',
        documentType: 'aadhaar_like',
        category: 'identity',
        tags: ['Identity'],
        expiresOn: '2030-08-12',
      },
    });
  });

  it('leaves out an empty folder, tags and expiry', () => {
    const result = validateSaveDocument({ ...FORM, category: null }, NOW);
    expect(result).toEqual({
      ok: true,
      details: { title: 'Aadhaar Card', documentType: 'aadhaar_like' },
    });
  });

  it('needs a name and a type', () => {
    expect(validateSaveDocument({ ...FORM, title: '   ', documentType: null }, NOW)).toEqual({
      ok: false,
      errors: { title: 'required', documentType: 'required' },
    });
  });

  it('refuses an expiry date that has passed', () => {
    expect(validateSaveDocument({ ...FORM, expiresOn: '2026-01-01' }, NOW)).toEqual({
      ok: false,
      errors: { expiresOn: 'not_future' },
    });
  });
});
