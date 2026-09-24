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

  it('refuses to add an invalid document', () => {
    expect(() => withDocument(EMPTY_VAULT_INDEX, { ...OLDER, id: 'not-a-uuid' })).toThrow();
  });

  it('serialises to plain ASCII, so it can travel as base64', () => {
    const json = serialiseVaultIndex(withDocument(EMPTY_VAULT_INDEX, NEWER));
    // eslint-disable-next-line no-control-regex
    expect(json).toMatch(/^[\x00-\x7F]*$/);
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
