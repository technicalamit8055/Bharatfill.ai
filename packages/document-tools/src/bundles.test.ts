import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES } from '@assistigo/core';
import {
  BUNDLE_DOCUMENT_TYPES,
  BUNDLE_SIZE_CHOICES_KB,
  BUNDLE_TEMPLATES,
  bundleTargetBytes,
  findBundleTemplate,
  isBundleableMime,
  matchBundleSlots,
  type BundleCandidate,
} from './bundles';
import { isPresetCode } from './presets';

function doc(overrides: Partial<BundleCandidate> & Pick<BundleCandidate, 'id'>): BundleCandidate {
  return {
    documentType: 'caste_certificate',
    mimeType: 'application/pdf',
    status: 'uploaded',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('bundle templates', () => {
  it('have unique codes that never collide with a requirement preset', () => {
    const codes = BUNDLE_TEMPLATES.map((template) => template.code);
    expect(new Set(codes).size).toBe(codes.length);
    // The derivative route refuses unknown preset codes, so a bundle must never pose as one.
    for (const code of codes) expect(isPresetCode(code)).toBe(false);
  });

  it('only use real, bundleable document types and carry Hindi labels', () => {
    for (const template of BUNDLE_TEMPLATES) {
      expect(template.documentTypes.length).toBeGreaterThan(1);
      for (const type of template.documentTypes) {
        expect(DOCUMENT_TYPES).toContain(type);
        expect(BUNDLE_DOCUMENT_TYPES).toContain(type);
      }
      expect(template.labelHi.trim()).not.toBe('');
      expect(template.maxBytes).toBeGreaterThan(0);
    }
  });

  it('keeps photos and signatures out of bundles', () => {
    expect(BUNDLE_DOCUMENT_TYPES).not.toContain('photo');
    expect(BUNDLE_DOCUMENT_TYPES).not.toContain('signature');
  });

  it('finds a template by code', () => {
    expect(findBundleTemplate('bundle.education')?.documentTypes).toEqual([
      'marksheet_10',
      'marksheet_12',
      'marksheet_graduation',
    ]);
    expect(findBundleTemplate('ssc.photo')).toBeNull();
  });

  it('offers ascending size choices', () => {
    expect([...BUNDLE_SIZE_CHOICES_KB]).toEqual([...BUNDLE_SIZE_CHOICES_KB].sort((a, b) => a - b));
  });
});

describe('isBundleableMime', () => {
  it('accepts PDFs and the image types a document can be stored as', () => {
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(isBundleableMime(mime)).toBe(true);
    }
    expect(isBundleableMime('text/plain')).toBe(false);
    expect(isBundleableMime(null)).toBe(false);
  });
});

describe('matchBundleSlots', () => {
  it('fills each slot in the order the set lists them', () => {
    const matches = matchBundleSlots(
      ['aadhaar_like', 'caste_certificate'],
      [doc({ id: 'c', documentType: 'caste_certificate' }), doc({ id: 'a', documentType: 'aadhaar_like' })],
    );
    expect(matches).toEqual([
      { documentType: 'aadhaar_like', documentId: 'a' },
      { documentType: 'caste_certificate', documentId: 'c' },
    ]);
  });

  it('leaves a gap when the customer has no such document', () => {
    expect(matchBundleSlots(['marksheet_10'], [doc({ id: 'c' })])).toEqual([
      { documentType: 'marksheet_10', documentId: null },
    ]);
  });

  it('prefers a verified document over a newer unverified one', () => {
    const [match] = matchBundleSlots(
      ['caste_certificate'],
      [
        doc({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }),
        doc({ id: 'checked', status: 'verified', createdAt: '2025-01-01T00:00:00.000Z' }),
      ],
    );
    expect(match?.documentId).toBe('checked');
  });

  it('prefers the newest among equals', () => {
    const [match] = matchBundleSlots(
      ['caste_certificate'],
      [
        doc({ id: 'old', createdAt: '2025-01-01T00:00:00.000Z' }),
        doc({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }),
      ],
    );
    expect(match?.documentId).toBe('new');
  });

  it('never uses one document for two slots', () => {
    const matches = matchBundleSlots(
      ['caste_certificate', 'caste_certificate'],
      [doc({ id: 'only' })],
    );
    expect(matches.map((match) => match.documentId)).toEqual(['only', null]);
  });

  it('skips files it cannot put in a PDF', () => {
    const [match] = matchBundleSlots(['caste_certificate'], [doc({ id: 'x', mimeType: 'text/plain' })]);
    expect(match?.documentId).toBeNull();
  });
});

describe('bundleTargetBytes', () => {
  const cap = 8 * 1024 * 1024;

  it('converts KB to bytes', () => {
    expect(bundleTargetBytes(500, cap)).toBe(512_000);
  });

  it('treats blank, zero and negative as no limit', () => {
    expect(bundleTargetBytes('', cap)).toBeNull();
    expect(bundleTargetBytes(0, cap)).toBeNull();
    expect(bundleTargetBytes(-5, cap)).toBeNull();
    expect(bundleTargetBytes(Number.NaN, cap)).toBeNull();
  });

  it('never exceeds what a derivative may hold', () => {
    expect(bundleTargetBytes(100_000, cap)).toBe(cap);
  });
});
