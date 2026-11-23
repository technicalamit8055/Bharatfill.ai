/**
 * Upload's pure rules (`lib/scan/file-import.ts`): which picked files are accepted and as what,
 * how much room a session has, and the one message an upload ends with. File names here are
 * made up.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import {
  classifyPickedFile,
  EMPTY_IMPORT_REPORT,
  importReportMessages,
  importRoom,
  pickerMimeTypes,
} from '../lib/scan/file-import';
import { MULTI_PAGE_LIMIT } from '../lib/scan/scan-session';

describe('pickerMimeTypes', () => {
  it('asks for PDFs only when this build can draw them', () => {
    expect(pickerMimeTypes(true)).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
    expect(pickerMimeTypes(false)).toEqual(['image/jpeg', 'image/png']);
  });
});

describe('classifyPickedFile', () => {
  it('goes by the MIME type', () => {
    expect(classifyPickedFile({ mimeType: 'application/pdf', name: 'x.bin' }, true)).toBe('pdf');
    expect(classifyPickedFile({ mimeType: 'image/jpeg', name: 'x.pdf' }, true)).toBe('image');
    expect(classifyPickedFile({ mimeType: 'IMAGE/PNG' }, true)).toBe('image');
    expect(classifyPickedFile({ mimeType: 'image/jpg' }, true)).toBe('image');
  });

  it('falls back to the extension when the picker gives no useful type', () => {
    expect(classifyPickedFile({ name: 'sample-card.PDF' }, true)).toBe('pdf');
    expect(classifyPickedFile({ mimeType: 'application/octet-stream', name: 'a.jpeg' }, true)).toBe(
      'image',
    );
    expect(classifyPickedFile({ mimeType: null, name: null }, true)).toBe('unsupported');
  });

  it('refuses everything else, and PDFs when they cannot be drawn', () => {
    expect(classifyPickedFile({ mimeType: 'image/heic', name: 'a.heic' }, true)).toBe(
      'unsupported',
    );
    expect(classifyPickedFile({ mimeType: 'application/zip', name: 'a.pdf' }, true)).toBe(
      'unsupported',
    );
    expect(classifyPickedFile({ mimeType: 'application/pdf' }, false)).toBe('unsupported');
    expect(classifyPickedFile({ name: 'a.pdf' }, false)).toBe('unsupported');
  });
});

describe('importRoom', () => {
  it('is one page when replacing, otherwise what is left under the limit', () => {
    expect(importRoom({ retaking: true, pageCount: 24, pageLimit: 24 })).toBe(1);
    expect(importRoom({ retaking: false, pageCount: 0, pageLimit: 24 })).toBe(24);
    expect(importRoom({ retaking: false, pageCount: 20, pageLimit: 24 })).toBe(4);
    expect(importRoom({ retaking: false, pageCount: 30, pageLimit: 24 })).toBe(0);
    expect(importRoom({ retaking: false, pageCount: 0, pageLimit: 500 })).toBe(MULTI_PAGE_LIMIT);
  });
});

describe('importReportMessages', () => {
  it('is empty when everything was added', () => {
    expect(importReportMessages(EMPTY_IMPORT_REPORT, 24)).toEqual([]);
  });

  it('lists what was left out, the page limit first', () => {
    expect(
      importReportMessages(
        {
          unsupported: true,
          unreadable: true,
          locked: true,
          lockedUnsupported: true,
          overLimit: true,
        },
        24,
      ),
    ).toEqual([
      { key: 'importFiles.report.overLimit', values: { max: 24 } },
      { key: 'importFiles.report.lockedUnsupported' },
      { key: 'importFiles.report.locked' },
      { key: 'importFiles.report.unreadable' },
      { key: 'importFiles.report.unsupported' },
    ]);
  });
});

// ---- Copy -------------------------------------------------------------------------------------

/** Every key Upload, its password sheet and its entry points render. */
const RENDERED_KEYS = [
  'home.quickActions.upload.label',
  'home.quickActions.upload.caption',
  'vault.uploadAction',
  'vault.actions.upload',
  'vault.actions.uploadHint',
  'scanReview.replace',
  ...[
    'close',
    'title',
    'body',
    'replaceTitle',
    'replaceBody',
    'photos.label',
    'photos.caption',
    'files.label',
    'files.caption',
    'files.labelImages',
    'files.captionImages',
    'privacy',
    'opening',
    'reading',
    'review',
    'errorTitle',
    'errorBody',
    'discardTitle',
    'discardBody',
    'password.title',
    'password.titleOf',
    'password.body',
    'password.label',
    'password.placeholder',
    'password.show',
    'password.hide',
    'password.wrong',
    'password.aadhaarHint',
    'password.open',
    'password.skip',
    'password.cancel',
    'report.title',
    'report.full',
    'report.overLimit',
    'report.lockedUnsupported',
    'report.locked',
    'report.unreadable',
    'report.unsupported',
  ].map((key) => `importFiles.${key}`),
  'scanner.errors.title',
  'scanner.discard',
  'scanResult.cancel',
  'common.ok',
];

const PLACEHOLDERS: Record<string, readonly string[]> = {
  'importFiles.review': ['{count}'],
  'importFiles.password.titleOf': ['{number}', '{total}'],
  'importFiles.report.full': ['{max}'],
  'importFiles.report.overLimit': ['{max}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('upload copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the interpolation placeholders in %s', (_locale, dictionary) => {
    for (const [key, placeholders] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of placeholders) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });
});
