/**
 * The encrypted vault's index format: parsing refuses anything malformed, updates keep documents
 * newest first, and every page's encryption binding is unique.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_VAULT_INDEX,
  findDocument,
  INDEX_ASSOCIATED_DATA,
  pageAssociatedData,
  pageFileName,
  pageMimeTypeFromName,
  pageMimeTypeOf,
  parseVaultIndex,
  serialiseVaultIndex,
  type VaultDocument,
  withDocument,
  withoutDocument,
  withStarred,
} from '../lib/vault/vault-index';

const OLDER: VaultDocument = {
  id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  createdAt: '2026-09-20T10:00:00.000Z',
  source: 'scanner',
  pages: [{ mimeType: 'image/jpeg' }],
};

const NEWER: VaultDocument = {
  id: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
  createdAt: '2026-09-24T08:30:00.000Z',
  source: 'gallery',
  pages: [{ mimeType: 'image/png' }, { mimeType: 'image/jpeg' }],
};

describe('vault index', () => {
  it('round-trips through serialisation', () => {
    const index = withDocument(withDocument(EMPTY_VAULT_INDEX, OLDER), NEWER);
    expect(parseVaultIndex(serialiseVaultIndex(index))).toEqual(index);
  });

  it('keeps documents newest first', () => {
    const index = withDocument(withDocument(EMPTY_VAULT_INDEX, NEWER), OLDER);
    expect(index.documents.map((document) => document.id)).toEqual([NEWER.id, OLDER.id]);
  });

  it('replaces a document saved twice rather than duplicating it', () => {
    const index = withDocument(withDocument(EMPTY_VAULT_INDEX, OLDER), OLDER);
    expect(index.documents).toHaveLength(1);
  });

  it('removes and finds documents', () => {
    const index = withDocument(withDocument(EMPTY_VAULT_INDEX, OLDER), NEWER);
    expect(findDocument(index, OLDER.id)).toEqual(OLDER);
    expect(findDocument(withoutDocument(index, OLDER.id), OLDER.id)).toBeNull();
  });

  it('refuses malformed or tampered indexes', () => {
    expect(parseVaultIndex('not json')).toBeNull();
    expect(parseVaultIndex('{}')).toBeNull();
    expect(parseVaultIndex(JSON.stringify({ version: 2, documents: [] }))).toBeNull();
    expect(
      parseVaultIndex(JSON.stringify({ version: 1, documents: [{ ...OLDER, id: '../../etc' }] })),
    ).toBeNull();
    expect(
      parseVaultIndex(JSON.stringify({ version: 1, documents: [{ ...OLDER, pages: [] }] })),
    ).toBeNull();
    expect(
      parseVaultIndex(
        JSON.stringify({
          version: 1,
          documents: [{ ...OLDER, pages: [{ mimeType: 'text/html' }] }],
        }),
      ),
    ).toBeNull();
  });

  it('stars and un-stars one document, leaving the others alone', () => {
    const index = withDocument(withDocument(EMPTY_VAULT_INDEX, OLDER), NEWER);
    const starred = withStarred(index, OLDER.id, true);
    expect(findDocument(starred, OLDER.id)?.starred).toBe(true);
    expect(findDocument(starred, NEWER.id)?.starred).toBeUndefined();
    expect(findDocument(withStarred(starred, OLDER.id, false), OLDER.id)?.starred).toBe(false);
    expect(withStarred(index, '00000000-0000-4000-8000-000000000000', true)).toEqual(index);
  });

  it('keeps the star through serialisation', () => {
    const index = withStarred(withDocument(EMPTY_VAULT_INDEX, OLDER), OLDER.id, true);
    expect(parseVaultIndex(serialiseVaultIndex(index))).toEqual(index);
  });

  it('still reads indexes written before starring existed', () => {
    const legacy = JSON.stringify({ version: 1, documents: [OLDER] });
    expect(
      findDocument(parseVaultIndex(legacy) ?? EMPTY_VAULT_INDEX, OLDER.id)?.starred,
    ).toBeUndefined();
    expect(
      parseVaultIndex(JSON.stringify({ version: 1, documents: [{ ...OLDER, starred: 'yes' }] })),
    ).toBeNull();
  });

  it('refuses to add an invalid document', () => {
    expect(() => withDocument(EMPTY_VAULT_INDEX, { ...OLDER, id: 'not-a-uuid' })).toThrow();
  });

  it('serialises to plain ASCII, so it can travel as base64', () => {
    const json = serialiseVaultIndex(withDocument(EMPTY_VAULT_INDEX, NEWER));
    // eslint-disable-next-line no-control-regex
    expect(json).toMatch(/^[\x00-\x7F]*$/);
  });
});

describe('document details', () => {
  const DETAILED: VaultDocument = {
    ...OLDER,
    title: 'आधार कार्ड — Front 😀',
    documentType: 'aadhaar_like',
    category: 'identity',
    tags: ['पहचान', 'Personal'],
    expiresOn: '2030-08-12',
    reminderId: 'reminder-1',
  };

  it('round-trips a Hindi name and tags through the ASCII index', () => {
    const json = serialiseVaultIndex(withDocument(EMPTY_VAULT_INDEX, DETAILED));
    // eslint-disable-next-line no-control-regex
    expect(json).toMatch(/^[\x00-\x7F]*$/);
    expect(findDocument(parseVaultIndex(json) ?? EMPTY_VAULT_INDEX, OLDER.id)).toEqual(DETAILED);
  });

  it('still reads documents saved without details', () => {
    const index = parseVaultIndex(JSON.stringify({ version: 1, documents: [OLDER] }));
    expect(findDocument(index ?? EMPTY_VAULT_INDEX, OLDER.id)?.title).toBeUndefined();
  });

  it('refuses details outside the stored limits', () => {
    const parses = (patch: Record<string, unknown>) =>
      parseVaultIndex(JSON.stringify({ version: 1, documents: [{ ...OLDER, ...patch }] })) !== null;

    expect(parses({ title: '' })).toBe(false);
    expect(parses({ title: 'x'.repeat(81) })).toBe(false);
    expect(parses({ documentType: 'passport_scan' })).toBe(false);
    expect(parses({ category: 'misc' })).toBe(false);
    expect(parses({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toBe(false);
    expect(parses({ tags: ['x'.repeat(25)] })).toBe(false);
    expect(parses({ expiresOn: '12/08/2030' })).toBe(false);
    expect(parses({ title: 'x'.repeat(80), tags: ['x'.repeat(24)] })).toBe(true);
  });
});

describe('page files', () => {
  it('names pages in order', () => {
    expect(pageFileName(0)).toBe('page-001.enc');
    expect(pageFileName(11)).toBe('page-012.enc');
  });

  it('binds every page to its own document and position', () => {
    const bindings = new Set([
      pageAssociatedData(OLDER.id, 0),
      pageAssociatedData(OLDER.id, 1),
      pageAssociatedData(NEWER.id, 0),
      INDEX_ASSOCIATED_DATA,
    ]);
    expect(bindings.size).toBe(4);
  });
});

describe('page MIME types', () => {
  it('accepts the image types the vault shows', () => {
    expect(pageMimeTypeOf('image/jpeg')).toBe('image/jpeg');
    expect(pageMimeTypeOf('image/jpg')).toBe('image/jpeg');
    expect(pageMimeTypeOf('IMAGE/PNG')).toBe('image/png');
  });

  it('refuses everything else', () => {
    expect(pageMimeTypeOf('application/pdf')).toBeNull();
    expect(pageMimeTypeOf(undefined)).toBeNull();
    expect(pageMimeTypeOf(null)).toBeNull();
  });

  it('falls back to the file extension', () => {
    expect(pageMimeTypeFromName('file:///cache/ImagePicker/a.JPG')).toBe('image/jpeg');
    expect(pageMimeTypeFromName('photo.heic')).toBe('image/heic');
    expect(pageMimeTypeFromName('file:///x/y.png?cache=1')).toBe('image/png');
    expect(pageMimeTypeFromName('file:///x/document.pdf')).toBeNull();
    expect(pageMimeTypeFromName('noextension')).toBeNull();
  });
});
