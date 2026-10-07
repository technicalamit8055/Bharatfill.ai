/**
 * Tests for the store-only document classes.
 *
 * The list decides which uploads may skip reading entirely, so both directions matter: a photo or
 * a signature must qualify, and nothing that carries fields may — a class wrongly added here
 * would let an Aadhaar or a marksheet be filed without its details ever being proposed.
 */

import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  STORE_ONLY_DOCUMENT_TYPES,
  isStoreOnlyDocumentType,
} from './types';

describe('isStoreOnlyDocumentType', () => {
  it('accepts a photograph and a signature', () => {
    expect(isStoreOnlyDocumentType('photo')).toBe(true);
    expect(isStoreOnlyDocumentType('signature')).toBe(true);
  });

  it('refuses every class with something on it worth reading', () => {
    // `receipt` and `application_pdf` have no field allow-list either, but they carry text an
    // operator may still want read — skipping them is a separate decision, not this one.
    for (const type of ['aadhaar_like', 'pan', 'marksheet_10', 'receipt', 'application_pdf']) {
      expect(isStoreOnlyDocumentType(type)).toBe(false);
    }
  });

  it('refuses `unknown` — an undecided type is never a reason to skip reading', () => {
    expect(isStoreOnlyDocumentType('unknown')).toBe(false);
    expect(isStoreOnlyDocumentType('')).toBe(false);
    expect(isStoreOnlyDocumentType(null)).toBe(false);
    expect(isStoreOnlyDocumentType(undefined)).toBe(false);
  });

  it('only names real document classes', () => {
    for (const type of STORE_ONLY_DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPES).toContain(type);
    }
  });
});

describe('DOCUMENT_STATUSES', () => {
  it('has a status for a document that was kept without being read', () => {
    expect(DOCUMENT_STATUSES).toContain('stored');
  });
});
