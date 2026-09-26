/**
 * Document Details: the export file name and format, the "Added On" line, which page the viewer
 * counts as showing, the print HTML (which must refuse anything but image pages), and that every
 * key the screen renders exists in both catalogues. Sample documents only — no real citizen data.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { createTranslator } from '../lib/i18n';
import { VAULT_CATEGORIES } from '../lib/vault/categories';
import {
  documentKindKey,
  exportFileName,
  exportFormat,
  folderLabelKey,
  formatAddedOn,
  imageExportName,
  isCancellation,
  MAX_FILE_STEM_LENGTH,
  printableHtml,
  visiblePageIndex,
} from '../lib/vault/document-details';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('export format', () => {
  it('exports a booklet as one PDF', () => {
    expect(exportFormat(2, 'image/jpeg')).toMatchObject({
      extension: 'pdf',
      mimeType: 'application/pdf',
    });
  });

  it('keeps a single page in its own image format', () => {
    expect(exportFormat(1, 'image/jpeg')).toMatchObject({ extension: 'jpg', uti: 'public.jpeg' });
    expect(exportFormat(1, 'image/png').mimeType).toBe('image/png');
  });

  it('exports a single page as a PDF when asked', () => {
    expect(exportFormat(1, 'image/jpeg', 'pdf')).toMatchObject({ extension: 'pdf' });
  });

  it('keeps a booklet a PDF even when an image is asked for', () => {
    expect(exportFormat(3, 'image/jpeg', 'image').extension).toBe('pdf');
  });

  it('offers the image choice only for a single page, named by its format', () => {
    expect(imageExportName(1, 'image/jpeg')).toBe('JPG');
    expect(imageExportName(1, 'image/png')).toBe('PNG');
    expect(imageExportName(2, 'image/jpeg')).toBeNull();
  });
});

describe('export file name', () => {
  it('joins the words of the name with underscores', () => {
    expect(exportFileName('Aadhaar Card', 'pdf')).toBe('Aadhaar_Card.pdf');
    expect(exportFileName('  10th Marksheet (2019) ', 'jpg')).toBe('10th_Marksheet_2019.jpg');
  });

  it('keeps Hindi letters and their vowel signs', () => {
    expect(exportFileName('आधार कार्ड', 'pdf')).toBe('आधार_कार्ड.pdf');
  });

  it('strips path separators and other unsafe characters', () => {
    expect(exportFileName('../../etc/passwd', 'jpg')).toBe('etc_passwd.jpg');
    expect(exportFileName('a:b*c?"<d>|e', 'png')).toBe('a_b_c_d_e.png');
  });

  it('falls back to "Document" when nothing usable is left', () => {
    expect(exportFileName('', 'pdf')).toBe('Document.pdf');
    expect(exportFileName('!!! ***', 'pdf')).toBe('Document.pdf');
  });

  it('caps the length without leaving a trailing underscore', () => {
    const name = exportFileName(`${'a'.repeat(MAX_FILE_STEM_LENGTH - 1)} b`, 'pdf');
    expect(name).toBe(`${'a'.repeat(MAX_FILE_STEM_LENGTH - 1)}.pdf`);
  });
});

describe('added on', () => {
  const t = createTranslator('en');

  it('reads "12 Sep 2026, 10:24 AM" in the phone time zone', () => {
    expect(formatAddedOn(new Date(2026, 8, 12, 10, 24), t)).toBe('12 Sep 2026, 10:24 AM');
  });

  it('uses a 12-hour clock around noon and midnight', () => {
    expect(formatAddedOn(new Date(2026, 8, 12, 0, 5), t)).toBe('12 Sep 2026, 12:05 AM');
    expect(formatAddedOn(new Date(2026, 8, 12, 12, 0), t)).toBe('12 Sep 2026, 12:00 PM');
    expect(formatAddedOn(new Date(2026, 8, 12, 18, 9), t)).toBe('12 Sep 2026, 6:09 PM');
  });
});

describe('copy keys', () => {
  it('names a kind and a folder for every category, and for none', () => {
    expect(documentKindKey(null)).toBe('documentDetails.kind.none');
    expect(documentKindKey('identity')).toBe('documentDetails.kind.identity');
    expect(folderLabelKey(null)).toBe('saveDocument.folder.none');
    expect(folderLabelKey('academic')).toBe('vault.categories.academic');
  });
});

describe('page viewer', () => {
  const tops = [54, 300, 620];

  it('counts the first page until the next one passes a third of the frame', () => {
    expect(visiblePageIndex(tops, 0, 300)).toBe(0);
    expect(visiblePageIndex(tops, 150, 300)).toBe(0);
    expect(visiblePageIndex(tops, 200, 300)).toBe(1);
    expect(visiblePageIndex(tops, 560, 300)).toBe(2);
  });

  it('starts on the first page before any page is measured', () => {
    expect(visiblePageIndex([], 0, 300)).toBe(0);
  });
});

describe('print html', () => {
  it('puts every page on its own sheet', () => {
    const html = printableHtml([PNG, JPEG]);
    expect(html.match(/<div class="page">/g)).toHaveLength(2);
    expect(html).toContain(`src="${PNG}"`);
    expect(html).toContain('@page { size: A4');
  });

  it('refuses anything that is not a base64 image page', () => {
    expect(() => printableHtml([])).toThrow();
    expect(() => printableHtml(['https://example.com/a.jpg'])).toThrow();
    expect(() => printableHtml(['data:text/html;base64,PHNjcmlwdD4='])).toThrow();
    expect(() => printableHtml([`${PNG}" onerror="alert(1)`])).toThrow();
  });
});

describe('cancellation', () => {
  it('tells a closed picker from a failure', () => {
    expect(isCancellation({ code: 'ERR_PICKER_CANCELLED' })).toBe(true);
    expect(isCancellation({ code: 'ERR_FILE_PICKING_CANCELLED' })).toBe(true);
    expect(isCancellation(new Error('disk full'))).toBe(false);
    expect(isCancellation({ code: 42 })).toBe(false);
    expect(isCancellation(null)).toBe(false);
  });
});

// ---- Copy -----------------------------------------------------------------------------------

const RENDERED_KEYS = [
  'documentDetails.back',
  'documentDetails.star',
  'documentDetails.unstar',
  'documentDetails.more',
  ...VAULT_CATEGORIES.map((category) => documentKindKey(category)),
  documentKindKey(null),
  ...VAULT_CATEGORIES.map((category) => folderLabelKey(category)),
  folderLabelKey(null),
  'documentDetails.pageOf',
  'documentDetails.pageLabel',
  'documentDetails.previousPage',
  'documentDetails.nextPage',
  'documentDetails.pageFailed',
  ...Object.keys(en.documentDetails.actions).map((key) => `documentDetails.actions.${key}`),
  ...Object.keys(en.documentDetails.details).map((key) => `documentDetails.details.${key}`),
  'documentDetails.addedOn',
  'documentDetails.time',
  'documentDetails.am',
  'documentDetails.pm',
  'documentDetails.secure.title',
  'documentDetails.secure.body',
  'documentDetails.move',
  'documentDetails.delete',
  'documentDetails.sheetClose',
  ...Object.keys(en.documentDetails.rename).map((key) => `documentDetails.rename.${key}`),
  ...Object.keys(en.documentDetails.tag).map((key) => `documentDetails.tag.${key}`),
  'documentDetails.moveTitle',
  ...Object.keys(en.documentDetails.menu).map((key) => `documentDetails.menu.${key}`),
  'documentDetails.deleteTitle',
  'documentDetails.deleteBody',
  'documentDetails.working.share',
  'documentDetails.working.download',
  'documentDetails.working.print',
  'documentDetails.downloaded.title',
  'documentDetails.downloaded.body',
  ...Object.keys(en.documentDetails.format).map((key) => `documentDetails.format.${key}`),
  ...Object.keys(en.documentDetails.errors).map((key) => `documentDetails.errors.${key}`),
  'saveDocument.name.placeholder',
  'saveDocument.tags.inputLabel',
  'saveDocument.tags.placeholder',
  'saveDocument.tags.duplicate',
  'saveDocument.tags.full',
  'vault.starFailed',
  'common.loading',
  'common.errorTitle',
  'common.ok',
];

const PLACEHOLDERS: Record<string, readonly string[]> = {
  'documentDetails.star': ['{title}'],
  'documentDetails.unstar': ['{title}'],
  'documentDetails.more': ['{title}'],
  'documentDetails.pageOf': ['{number}', '{total}'],
  'documentDetails.pageLabel': ['{number}', '{total}'],
  'documentDetails.addedOn': ['{date}', '{time}'],
  'documentDetails.time': ['{hour}', '{minute}', '{period}'],
  'documentDetails.tag.remove': ['{tag}'],
  'documentDetails.tag.removeBody': ['{tag}'],
  'documentDetails.deleteBody': ['{title}'],
  'documentDetails.downloaded.body': ['{file}'],
  'documentDetails.format.image': ['{format}'],
  'saveDocument.tags.full': ['{max}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('document details copy', () => {
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

  it('defines the same keys in Hindi as in English', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(hi.documentDetails).sort()).toEqual(keys(en.documentDetails).sort());
  });

  it('does not claim a cloud backup the vault does not make', () => {
    expect(en.documentDetails.secure.body.toLowerCase()).not.toContain('backed up');
  });
});
