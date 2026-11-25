/**
 * The Home dashboard's pure helpers: greeting name, avatar initials, document ages and counts,
 * row sizing, and the empty dashboard a production build shows.
 */

import { describe, expect, it } from 'vitest';

import {
  documentAgeMessage,
  documentCountMessage,
  EMPTY_HOME_DASHBOARD,
  firstNameOf,
  initialsOf,
  QUICK_SCAN_MODES,
  quickScanParams,
  RECENT_DOCUMENT_LIMIT,
  rowLayout,
  vaultDashboardSummary,
} from '../lib/home/dashboard';
import { VAULT_CATEGORIES } from '../lib/vault/categories';
import type { VaultDocument } from '../lib/vault/vault-index';

describe('firstNameOf', () => {
  it('takes the first word of the name', () => {
    expect(firstNameOf('Amit Kumar')).toBe('Amit');
    expect(firstNameOf('  Sample   Citizen ')).toBe('Sample');
    expect(firstNameOf('अमित कुमार')).toBe('अमित');
  });

  it('has nothing to greet without a name', () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf('   ')).toBeNull();
  });
});

describe('initialsOf', () => {
  it('uses the first letters of the first and last words', () => {
    expect(initialsOf('Amit Kumar')).toBe('AK');
    expect(initialsOf('sample citizen')).toBe('SC');
    expect(initialsOf('Ram Prasad Verma')).toBe('RV');
  });

  it('uses a single initial for a one-word name', () => {
    expect(initialsOf('Asha')).toBe('A');
  });

  it('skips punctuation at the start of a word', () => {
    expect(initialsOf("Sample 'Citizen")).toBe('SC');
  });

  it('works for Devanagari names', () => {
    expect(initialsOf('अमित कुमार')).toBe('अक');
  });

  it('has no initials without a name', () => {
    expect(initialsOf(null)).toBeNull();
    expect(initialsOf('   ')).toBeNull();
    expect(initialsOf("' -")).toBeNull();
  });
});

describe('documentAgeMessage', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const before = (ms: number) => new Date(now.getTime() - ms);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('says "just now" under a minute', () => {
    expect(documentAgeMessage(now, now)).toEqual({ key: 'home.recent.age.justNow' });
    expect(documentAgeMessage(before(59 * 1000), now)).toEqual({ key: 'home.recent.age.justNow' });
  });

  it('counts minutes, hours and days, rounding down', () => {
    expect(documentAgeMessage(before(MINUTE), now)).toEqual({
      key: 'home.recent.age.minutesOne',
      values: { count: 1 },
    });
    expect(documentAgeMessage(before(59 * MINUTE), now)).toEqual({
      key: 'home.recent.age.minutesOther',
      values: { count: 59 },
    });
    expect(documentAgeMessage(before(HOUR), now)).toEqual({
      key: 'home.recent.age.hoursOne',
      values: { count: 1 },
    });
    expect(documentAgeMessage(before(2 * HOUR), now)).toEqual({
      key: 'home.recent.age.hoursOther',
      values: { count: 2 },
    });
    expect(documentAgeMessage(before(DAY - MINUTE), now)).toEqual({
      key: 'home.recent.age.hoursOther',
      values: { count: 23 },
    });
    expect(documentAgeMessage(before(DAY), now)).toEqual({
      key: 'home.recent.age.daysOne',
      values: { count: 1 },
    });
    expect(documentAgeMessage(before(5 * DAY + 3 * HOUR), now)).toEqual({
      key: 'home.recent.age.daysOther',
      values: { count: 5 },
    });
  });

  it('treats a timestamp in the future as "just now"', () => {
    expect(documentAgeMessage(new Date(now.getTime() + HOUR), now)).toEqual({
      key: 'home.recent.age.justNow',
    });
  });

  it('does not produce a NaN age from an invalid date', () => {
    expect(documentAgeMessage(new Date('not a date'), now)).toEqual({
      key: 'home.recent.age.justNow',
    });
  });
});

describe('documentCountMessage', () => {
  it('picks the none, one or other form', () => {
    expect(documentCountMessage(0)).toEqual({ key: 'home.vault.count.none' });
    expect(documentCountMessage(1)).toEqual({ key: 'home.vault.count.one' });
    expect(documentCountMessage(3)).toEqual({
      key: 'home.vault.count.other',
      values: { count: 3 },
    });
  });

  it('never shows a negative count', () => {
    expect(documentCountMessage(-1)).toEqual({ key: 'home.vault.count.none' });
  });
});

describe('rowLayout', () => {
  it('fills the width when every item fits at its minimum', () => {
    // (528 - 4 × 10) / 5 = 97.6 → 97
    expect(rowLayout(528, 5, 88, 10)).toEqual({ itemWidth: 97, scrolls: false });
  });

  it('keeps the minimum width and scrolls when the items do not fit', () => {
    // A 390dp phone: 358dp of content cannot hold five 88dp tiles.
    expect(rowLayout(358, 5, 88, 10)).toEqual({ itemWidth: 88, scrolls: true });
  });

  it('fits exactly at the boundary', () => {
    expect(rowLayout(4 * 100 + 3 * 10, 4, 100, 10)).toEqual({ itemWidth: 100, scrolls: false });
  });

  it('handles an empty row', () => {
    expect(rowLayout(358, 0, 88, 10)).toEqual({ itemWidth: 88, scrolls: false });
  });
});

describe('EMPTY_HOME_DASHBOARD', () => {
  it('claims no name, no alerts and no documents', () => {
    expect(EMPTY_HOME_DASHBOARD.citizenName).toBeNull();
    expect(EMPTY_HOME_DASHBOARD.hasUnreadNotifications).toBe(false);
    expect(EMPTY_HOME_DASHBOARD.recentDocuments).toEqual([]);
    for (const category of VAULT_CATEGORIES) {
      expect(EMPTY_HOME_DASHBOARD.documentCounts[category]).toBe(0);
    }
  });
});

/** A vault index entry with fake ids and no real document details. */
function vaultDocument(
  n: number,
  createdAt: string,
  extra: Partial<VaultDocument> = {},
): VaultDocument {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    createdAt,
    source: 'scanner',
    pages: [{ mimeType: 'image/jpeg' }],
    ...extra,
  };
}

describe('vaultDashboardSummary', () => {
  it('counts documents per category, leaving out the unfiled', () => {
    const { documentCounts } = vaultDashboardSummary([
      vaultDocument(1, '2026-01-01T00:00:00.000Z', { category: 'identity' }),
      vaultDocument(2, '2026-01-02T00:00:00.000Z', { category: 'identity' }),
      vaultDocument(3, '2026-01-03T00:00:00.000Z', { category: 'form_asset' }),
      vaultDocument(4, '2026-01-04T00:00:00.000Z'),
    ]);
    expect(documentCounts).toEqual({ identity: 2, academic: 0, certificate: 0, form_asset: 1 });
  });

  it('lists the newest documents first, at most the limit', () => {
    const documents = [1, 5, 3, 2, 4, 6].map((day) =>
      vaultDocument(day, `2026-03-0${day}T10:00:00.000Z`),
    );
    const { recent } = vaultDashboardSummary(documents);
    expect(recent).toHaveLength(RECENT_DOCUMENT_LIMIT);
    expect(recent.map((document) => document.createdAt.slice(8, 10))).toEqual([
      '06',
      '05',
      '04',
      '03',
    ]);
  });

  it('keeps the index order between documents saved at the same moment', () => {
    const at = '2026-03-01T10:00:00.000Z';
    const { recent } = vaultDashboardSummary([vaultDocument(1, at), vaultDocument(2, at)], 2);
    expect(recent.map((document) => document.id.slice(-1))).toEqual(['1', '2']);
  });

  it('is empty for an empty vault', () => {
    const { documentCounts, recent } = vaultDashboardSummary([]);
    expect(recent).toEqual([]);
    for (const category of VAULT_CATEGORIES) expect(documentCounts[category]).toBe(0);
  });
});

describe('quickScanParams', () => {
  it('opens the ordinary scanner for documents', () => {
    expect(quickScanParams('document')).toEqual({ mode: 'single' });
    expect(quickScanParams('multi_page')).toEqual({ mode: 'multi' });
  });

  it('covers every quick action', () => {
    for (const mode of QUICK_SCAN_MODES) expect(quickScanParams(mode)).toBeTruthy();
  });
});
