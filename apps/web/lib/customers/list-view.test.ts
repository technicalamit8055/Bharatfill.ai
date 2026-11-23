import { describe, expect, it } from 'vitest';
import {
  addedSince,
  isBihar,
  lastPage,
  listHref,
  monthGrowthPercent,
  pageRange,
  pageWindow,
  parseListParams,
  sharePercent,
  topState,
  type ListParams,
} from './list-view';

const DEFAULTS: ListParams = { view: 'all', page: 1, perPage: 10, added: 'any' };

describe('parseListParams', () => {
  it('uses the defaults for an empty query', () => {
    expect(parseListParams({})).toEqual(DEFAULTS);
  });

  it('reads valid values', () => {
    expect(parseListParams({ page: '3', per: '25', added: '30d' })).toEqual({
      view: 'all',
      page: 3,
      perPage: 25,
      added: '30d',
    });
  });

  it('opens an old "roaming" tab link on the one list (0044 merged it in)', () => {
    expect(parseListParams({ view: 'roaming', page: '2' })).toEqual({ ...DEFAULTS, page: 2 });
  });

  it('falls back field by field instead of failing on a bad URL', () => {
    expect(parseListParams({ view: 'deleted', page: '-2', per: '1000', added: 'forever' })).toEqual(
      DEFAULTS,
    );
    expect(parseListParams({ page: 'abc', per: '25' })).toEqual({ ...DEFAULTS, perPage: 25 });
    expect(parseListParams({ page: '1.5' }).page).toBe(1);
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseListParams({ page: ['2', '9'] }).page).toBe(2);
  });
});

describe('listHref', () => {
  it('keeps the plain URL plain', () => {
    expect(listHref(DEFAULTS)).toBe('/customers');
  });

  it('carries only non-default state', () => {
    expect(listHref(DEFAULTS, { added: '7d', page: 2 })).toBe('/customers?added=7d&page=2');
    expect(listHref({ ...DEFAULTS, perPage: 50 }, { added: '30d' })).toBe(
      '/customers?added=30d&per=50',
    );
  });
});

describe('addedSince', () => {
  const asOf = new Date('2026-09-27T10:00:00.000Z');

  it('admits everything for "any"', () => {
    expect(addedSince('any', asOf)).toBeNull();
  });

  it('reaches back the window length', () => {
    expect(addedSince('7d', asOf)?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(addedSince('90d', asOf)?.toISOString()).toBe('2026-06-29T10:00:00.000Z');
  });
});

describe('paging', () => {
  it('maps a page to an inclusive zero-based range', () => {
    expect(pageRange(1, 10)).toEqual({ from: 0, to: 9 });
    expect(pageRange(3, 25)).toEqual({ from: 50, to: 74 });
    expect(pageRange(0, 10)).toEqual({ from: 0, to: 9 });
  });

  it('always has at least one page', () => {
    expect(lastPage(0, 10)).toBe(1);
    expect(lastPage(10, 10)).toBe(1);
    expect(lastPage(11, 10)).toBe(2);
  });

  it('centres the page buttons and pushes them in at the ends', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
  });
});

describe('monthGrowthPercent', () => {
  it('reads this month against everyone registered before it', () => {
    expect(monthGrowthPercent(30, 10)).toBe(50);
  });

  it('has no comparison in a first month or a quiet one', () => {
    expect(monthGrowthPercent(2, 2)).toBeNull();
    expect(monthGrowthPercent(0, 0)).toBeNull();
    expect(monthGrowthPercent(12, 0)).toBeNull();
  });
});

describe('sharePercent', () => {
  it('rounds and clamps', () => {
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(2, 2)).toBe(100);
    expect(sharePercent(5, 0)).toBe(0);
  });
});

describe('topState', () => {
  it('groups spellings of the same state and keeps the first one seen', () => {
    expect(topState(['Bihar', 'BIHAR ', 'Uttar Pradesh', null, ' bihar'])).toEqual({
      state: 'Bihar',
      count: 3,
    });
  });

  it('gives a tie to the state seen first', () => {
    expect(topState(['Jharkhand', 'Bihar', 'Bihar', 'Jharkhand'])?.state).toBe('Jharkhand');
  });

  it('is null when no address names a state', () => {
    expect(topState([null, undefined, '  '])).toBeNull();
  });
});

describe('isBihar', () => {
  it('recognises both scripts', () => {
    expect(isBihar(' BIHAR ')).toBe(true);
    expect(isBihar('बिहार')).toBe(true);
    expect(isBihar('Jharkhand')).toBe(false);
    expect(isBihar(null)).toBe(false);
  });
});
