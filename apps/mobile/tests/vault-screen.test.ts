/**
 * The Vault tab's pure helpers: which documents each filter, category, search and sort leave on
 * screen, the folder counts, why a list is empty, and the "JPG • 2.4 MB • 12 Sep 2026" line.
 * Sample documents only — no real citizen data.
 */

import { describe, expect, it } from 'vitest';

import { createTranslator } from '../lib/i18n';
import {
  categoryCounts,
  emptyListMessage,
  formatFileSize,
  formatMessage,
  formatVaultDate,
  isRecent,
  matchedInText,
  metaLine,
  RECENT_DAYS,
  type VaultItem,
  type VaultQuery,
  visibleItems,
} from '../lib/vault/vault-screen';

const NOW = new Date(2026, 8, 24, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function item(overrides: Partial<VaultItem> & Pick<VaultItem, 'id' | 'title'>): VaultItem {
  return {
    category: null,
    tag: null,
    createdAt: NOW,
    pageCount: 1,
    mimeType: 'image/jpeg',
    sizeBytes: null,
    starred: false,
    thumbnail: { kind: 'none' },
    ...overrides,
  };
}

const AADHAAR = item({
  id: 'a',
  title: 'Aadhaar Card',
  category: 'identity',
  tag: 'Aadhaar',
  createdAt: new Date(NOW.getTime() - DAY_MS),
  starred: true,
});
const MARKSHEET = item({
  id: 'm',
  title: '10th Marksheet',
  category: 'academic',
  tag: 'Marksheet',
  createdAt: new Date(NOW.getTime() - 5 * DAY_MS),
});
const PAN = item({
  id: 'p',
  title: 'PAN Card',
  category: 'identity',
  tag: 'PAN',
  createdAt: new Date(NOW.getTime() - 60 * DAY_MS),
});
const SCAN = item({
  id: 's',
  title: 'Scanned document',
  tag: 'Scanned',
  createdAt: new Date(NOW.getTime() - 2 * DAY_MS),
});
const ITEMS = [MARKSHEET, PAN, SCAN, AADHAAR];

const ALL: VaultQuery = { filter: 'all', category: null, search: '', sort: 'newest', now: NOW };
const ids = (items: readonly VaultItem[]) => items.map((each) => each.id);

describe('visibleItems', () => {
  it('lists everything newest first by default', () => {
    expect(ids(visibleItems(ITEMS, ALL))).toEqual(['a', 's', 'm', 'p']);
  });

  it('sorts oldest first and by name', () => {
    expect(ids(visibleItems(ITEMS, { ...ALL, sort: 'oldest' }))).toEqual(['p', 'm', 's', 'a']);
    expect(ids(visibleItems(ITEMS, { ...ALL, sort: 'name' }))).toEqual(['m', 'a', 'p', 's']);
  });

  it('does not reorder the list it was given', () => {
    const given = [...ITEMS];
    visibleItems(given, { ...ALL, sort: 'name' });
    expect(given).toEqual(ITEMS);
  });

  it('shows only starred documents under Starred', () => {
    expect(ids(visibleItems(ITEMS, { ...ALL, filter: 'starred' }))).toEqual(['a']);
  });

  it(`shows the last ${RECENT_DAYS} days under Recent`, () => {
    expect(ids(visibleItems(ITEMS, { ...ALL, filter: 'recent' }))).toEqual(['a', 's', 'm']);
  });

  it('shows tiles, not a list, under Folders until a category is picked', () => {
    expect(visibleItems(ITEMS, { ...ALL, filter: 'folders' })).toEqual([]);
    expect(ids(visibleItems(ITEMS, { ...ALL, filter: 'folders', category: 'identity' }))).toEqual([
      'a',
      'p',
    ]);
  });

  it('narrows to a category, leaving uncategorised documents out', () => {
    expect(ids(visibleItems(ITEMS, { ...ALL, category: 'academic' }))).toEqual(['m']);
  });

  it('searches titles and tags, ignoring case and outer spaces', () => {
    expect(ids(visibleItems(ITEMS, { ...ALL, search: '  card ' }))).toEqual(['a', 'p']);
    expect(ids(visibleItems(ITEMS, { ...ALL, search: 'MARKSHEET' }))).toEqual(['m']);
    expect(ids(visibleItems(ITEMS, { ...ALL, search: 'scanned' }))).toEqual(['s']);
    expect(visibleItems(ITEMS, { ...ALL, search: 'passport' })).toEqual([]);
  });

  it('combines filters', () => {
    expect(
      ids(visibleItems(ITEMS, { ...ALL, filter: 'recent', category: 'identity', search: 'card' })),
    ).toEqual(['a']);
  });
});

describe('categoryCounts', () => {
  it('counts each category and skips uncategorised documents', () => {
    expect(categoryCounts(ITEMS)).toEqual({
      identity: 2,
      academic: 1,
      certificate: 0,
      form_asset: 0,
    });
  });
});

describe('isRecent', () => {
  it(`is true inside ${RECENT_DAYS} days and false from then on`, () => {
    expect(isRecent(new Date(NOW.getTime() - (RECENT_DAYS * DAY_MS - 1)), NOW)).toBe(true);
    expect(isRecent(new Date(NOW.getTime() - RECENT_DAYS * DAY_MS), NOW)).toBe(false);
  });
});

describe('emptyListMessage', () => {
  it('says the vault is empty before anything else', () => {
    expect(emptyListMessage(0, { ...ALL, search: 'x', filter: 'starred' }).key).toBe(
      'vault.empty.vault',
    );
  });

  it('explains which filter left the list empty', () => {
    expect(emptyListMessage(3, { ...ALL, search: ' pan ' })).toEqual({
      key: 'vault.empty.search',
      values: { search: 'pan' },
    });
    expect(emptyListMessage(3, { ...ALL, filter: 'starred' }).key).toBe('vault.empty.starred');
    expect(emptyListMessage(3, { ...ALL, filter: 'recent' })).toEqual({
      key: 'vault.empty.recent',
      values: { days: RECENT_DAYS },
    });
    expect(emptyListMessage(3, { ...ALL, category: 'certificate' }).key).toBe(
      'vault.empty.category',
    );
  });
});

describe('document meta line', () => {
  const t = createTranslator('en');

  it('formats sizes in KB below a tenth of a megabyte, else MB', () => {
    expect(formatFileSize(10)).toBe('1 KB');
    expect(formatFileSize(48 * 1024)).toBe('48 KB');
    expect(formatFileSize(0.3 * 1024 * 1024)).toBe('0.3 MB');
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
  });

  it('shows the format for one page and the page count for a booklet', () => {
    expect(formatMessage({ mimeType: 'image/png', pageCount: 1 })).toEqual({
      key: 'vault.meta.format',
      values: { format: 'PNG' },
    });
    expect(formatMessage({ mimeType: 'image/jpeg', pageCount: 3 })).toEqual({
      key: 'vault.meta.pages',
      values: { count: 3 },
    });
  });

  it('dates documents as "12 Sep 2026" in both languages', () => {
    expect(formatVaultDate(new Date(2026, 8, 5), t)).toBe('05 Sep 2026');
    const hindi = formatVaultDate(new Date(2026, 8, 5), createTranslator('hi'));
    expect(hindi).toMatch(/^05 \S+ 2026$/);
  });

  it('joins format, size and date, leaving out an unknown size', () => {
    const photo = item({
      id: 'x',
      title: 'Passport Photo',
      createdAt: new Date(2026, 8, 10),
      sizeBytes: 1.2 * 1024 * 1024,
    });
    expect(metaLine(photo, t)).toBe('JPG  •  1.2 MB  •  10 Sep 2026');
    expect(metaLine({ ...photo, sizeBytes: null, pageCount: 2 }, t)).toBe(
      '2 pages  •  10 Sep 2026',
    );
  });
});

describe('searching the text inside documents', () => {
  const READ = {
    ...MARKSHEET,
    id: 'read',
    searchText: 'SECONDARY SCHOOL EXAMINATION\nRoll No 2112345',
  };

  it('finds a document by a number printed on it, however it is spaced', () => {
    expect(ids(visibleItems([READ, PAN], { ...ALL, search: '211 2345' }))).toEqual(['read']);
    expect(matchedInText(READ, '2112345')).toBe(true);
  });

  it('says when the match was in the text, not the name', () => {
    expect(matchedInText(READ, 'school examination')).toBe(true);
    expect(matchedInText(READ, '10th')).toBe(false);
    expect(matchedInText(READ, '')).toBe(false);
    expect(matchedInText(PAN, 'roll')).toBe(false);
  });
});
