/**
 * Proves the mobile app links cleanly against @assistigo/core: if the barrel stops resolving,
 * or a document class is added in core without being placed in a vault category, this fails.
 */

import { describe, expect, it } from 'vitest';

import { DOCUMENT_TYPES, isDocumentType, type DocumentType } from '@assistigo/core';

import {
  categoryOf,
  documentTypesIn,
  isVaultCategory,
  VAULT_CATEGORIES,
  VAULT_DOCUMENT_TYPES,
  vaultCategoryLabelKey,
} from '../lib/vault/categories';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

describe('@assistigo/core link', () => {
  it('resolves the core barrel from apps/mobile', () => {
    expect(DOCUMENT_TYPES.length).toBeGreaterThan(0);
    expect(isDocumentType('marksheet_10')).toBe(true);
  });
});

describe('vault categories', () => {
  it('assigns every core document type to a category or explicitly to none', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(VAULT_DOCUMENT_TYPES).toHaveProperty(type);
    }
    expect(Object.keys(VAULT_DOCUMENT_TYPES).sort()).toEqual([...DOCUMENT_TYPES].sort());
  });

  it('maps the identity classes the spec calls out', () => {
    expect(categoryOf('aadhaar_like')).toBe('identity');
    expect(categoryOf('marksheet_10')).toBe('academic');
    expect(categoryOf('caste_certificate')).toBe('certificate');
    expect(categoryOf('photo')).toBe('form_asset');
  });

  it('treats operator-side artefacts as uncategorised', () => {
    expect(categoryOf('receipt')).toBeNull();
    expect(categoryOf('application_pdf')).toBeNull();
    expect(categoryOf('unknown')).toBeNull();
  });

  it('returns every type belonging to a category', () => {
    expect(documentTypesIn('academic')).toEqual([
      'marksheet_10',
      'marksheet_12',
      'marksheet_graduation',
    ]);
  });

  it('covers each category with at least one document type', () => {
    for (const category of VAULT_CATEGORIES) {
      expect(documentTypesIn(category).length).toBeGreaterThan(0);
    }
  });

  it('narrows unknown values', () => {
    expect(isVaultCategory('identity')).toBe(true);
    expect(isVaultCategory('not_a_category')).toBe(false);
    expect(isVaultCategory(undefined)).toBe(false);
  });
});

describe('localisation', () => {
  function lookup(dictionary: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, dictionary);
  }

  it('has an en and hi label for every vault category', () => {
    for (const category of VAULT_CATEGORIES) {
      const key = vaultCategoryLabelKey(category);
      expect(typeof lookup(en, key)).toBe('string');
      expect(typeof lookup(hi, key)).toBe('string');
    }
  });

  it('keeps the hi catalogue structurally in step with en', () => {
    const flatten = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object') return [prefix];
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k),
      );
    };
    expect(flatten(hi).sort()).toEqual(flatten(en).sort());
  });
});

describe('no real citizen data', () => {
  it('ships no sample identity numbers in the message catalogues', () => {
    const serialised = JSON.stringify(en) + JSON.stringify(hi);
    // 12-digit Aadhaar-shaped or 10-char PAN-shaped strings must never appear in UI copy.
    expect(serialised).not.toMatch(/\d{12}/);
    expect(serialised).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
  });
});

/** Compile-time guard: a new DocumentType must be placed in the map above. */
const _exhaustive: Record<DocumentType, unknown> = VAULT_DOCUMENT_TYPES;
void _exhaustive;
