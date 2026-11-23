import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_FOLDERS,
  documentFolder,
  isDocumentFolder,
  mirrorFolderFrom,
  vaultDocumentIntentSchema,
  vaultDocumentUpdateSchema,
} from './index';

describe('document folders', () => {
  it('are the four vault sections plus other, in vault order', () => {
    expect(DOCUMENT_FOLDERS).toEqual([
      'identity',
      'academic',
      'certificate',
      'form_asset',
      'other',
    ]);
  });

  it('recognise only real folders', () => {
    expect(isDocumentFolder('identity')).toBe(true);
    expect(isDocumentFolder('other')).toBe(true);
    expect(isDocumentFolder('education')).toBe(false);
    expect(isDocumentFolder(null)).toBe(false);
  });
});

describe('documentFolder', () => {
  it('follows the type when nothing was filed', () => {
    expect(documentFolder('pan')).toBe('identity');
    expect(documentFolder('marksheet_12', null)).toBe('academic');
    expect(documentFolder('income_certificate', undefined)).toBe('certificate');
    expect(documentFolder('signature')).toBe('form_asset');
  });

  it('puts types without a section, and unknown or bad types, in other', () => {
    expect(documentFolder('receipt')).toBe('other');
    expect(documentFolder('unknown')).toBe('other');
    expect(documentFolder('not_a_type')).toBe('other');
    expect(documentFolder(undefined)).toBe('other');
  });

  it('keeps the folder a citizen filed it in over the type', () => {
    expect(documentFolder('pan', 'certificate')).toBe('certificate');
    expect(documentFolder('generic', 'academic')).toBe('academic');
  });

  it('ignores a folder value the dashboard does not know', () => {
    expect(documentFolder('pan', 'education')).toBe('identity');
  });
});

describe('mirrorFolderFrom', () => {
  it('keeps a real section', () => {
    expect(mirrorFolderFrom('identity')).toBe('identity');
  });

  it('turns other (and junk) into no folder, so the copy follows its type', () => {
    expect(mirrorFolderFrom('other')).toBeNull();
    expect(mirrorFolderFrom('nope')).toBeNull();
    expect(mirrorFolderFrom(null)).toBeNull();
  });
});

describe('vault document schemas carry the folder', () => {
  const intent = {
    documentType: 'pan',
    title: 'PAN',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  };

  it('accepts an upload with or without a folder', () => {
    expect(vaultDocumentIntentSchema.parse(intent).category).toBeUndefined();
    expect(vaultDocumentIntentSchema.parse({ ...intent, category: 'other' }).category).toBe(
      'other',
    );
  });

  it('refuses a folder that does not exist', () => {
    expect(vaultDocumentIntentSchema.safeParse({ ...intent, category: 'education' }).success).toBe(
      false,
    );
  });

  it('lets a move be the only change', () => {
    expect(vaultDocumentUpdateSchema.parse({ category: 'academic' })).toEqual({
      category: 'academic',
    });
  });
});
