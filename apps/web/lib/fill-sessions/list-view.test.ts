import { describe, expect, it } from 'vitest';
import {
  bucketOverWindow,
  fillSessionsHref,
  hasListFilters,
  originHost,
  parseFillSessionParams,
  periodChangePercent,
  previousRangeStart,
  rangeStart,
  reviewAccuracyPercent,
  sanitizeSearchTerm,
  sumFilledFields,
  type FillSessionListParams,
} from './list-view';

const DEFAULTS: FillSessionListParams = {
  q: '',
  status: '',
  range: '30d',
  sort: 'newest',
  page: 1,
  perPage: 10,
};

describe('parseFillSessionParams', () => {
  it('uses the defaults for an empty query', () => {
    expect(parseFillSessionParams({})).toEqual(DEFAULTS);
  });

  it('reads valid values', () => {
    expect(
      parseFillSessionParams({
        q: '  residence ',
        status: 'filled',
        range: '7d',
        sort: 'oldest',
        page: '4',
        per: '50',
      }),
    ).toEqual({ q: 'residence', status: 'filled', range: '7d', sort: 'oldest', page: 4, perPage: 50 });
  });

  it('falls back field by field instead of failing on a bad URL', () => {
    expect(
      parseFillSessionParams({ status: 'submitted', range: 'forever', sort: 'up', page: '0', per: '7' }),
    ).toEqual(DEFAULTS);
    expect(parseFillSessionParams({ q: 'x'.repeat(500) }).q).toBe('');
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseFillSessionParams({ status: ['detected', 'filled'] }).status).toBe('detected');
  });
});

describe('fillSessionsHref', () => {
  it('keeps the plain URL plain', () => {
    expect(fillSessionsHref(DEFAULTS)).toBe('/fill-sessions');
  });

  it('writes only what differs from the defaults', () => {
    expect(fillSessionsHref(DEFAULTS, { status: 'filled', range: 'all', page: 2 })).toBe(
      '/fill-sessions?status=filled&range=all&page=2',
    );
    expect(fillSessionsHref({ ...DEFAULTS, q: ' caste ', sort: 'oldest', perPage: 25 })).toBe(
      '/fill-sessions?q=caste&sort=oldest&per=25',
    );
  });

  it('round-trips through the parser', () => {
    const params: FillSessionListParams = {
      q: 'RTPS Bihar',
      status: 'detected',
      range: '90d',
      sort: 'oldest',
      page: 3,
      perPage: 25,
    };
    const search = new URLSearchParams(fillSessionsHref(params).split('?')[1]);
    expect(parseFillSessionParams(Object.fromEntries(search))).toEqual(params);
  });
});

describe('hasListFilters', () => {
  it('is about the search box and status only', () => {
    expect(hasListFilters(DEFAULTS)).toBe(false);
    expect(hasListFilters({ ...DEFAULTS, range: '7d', sort: 'oldest' })).toBe(false);
    expect(hasListFilters({ ...DEFAULTS, q: 'bihar' })).toBe(true);
    expect(hasListFilters({ ...DEFAULTS, status: 'failed' })).toBe(true);
  });
});

describe('date windows', () => {
  const asOf = new Date('2026-09-27T12:00:00Z');

  it('goes back the window length, and twice that for the comparison period', () => {
    expect(rangeStart('7d', asOf)?.toISOString()).toBe('2026-09-20T12:00:00.000Z');
    expect(previousRangeStart('7d', asOf)?.toISOString()).toBe('2026-09-13T12:00:00.000Z');
    expect(rangeStart('30d', asOf)?.toISOString()).toBe('2026-08-28T12:00:00.000Z');
  });

  it('has no bound and no comparison for all time', () => {
    expect(rangeStart('all', asOf)).toBeNull();
    expect(previousRangeStart('all', asOf)).toBeNull();
  });
});

describe('periodChangePercent', () => {
  it('compares against the previous period', () => {
    expect(periodChangePercent(57, 51)).toBe(12);
    expect(periodChangePercent(40, 50)).toBe(-20);
    expect(periodChangePercent(5, 5)).toBe(0);
  });

  it('shows no percentage when there is nothing to compare against', () => {
    expect(periodChangePercent(12, 0)).toBeNull();
    expect(periodChangePercent(0, 0)).toBeNull();
  });
});

describe('reviewAccuracyPercent', () => {
  it('counts filled sessions among those that reached a result', () => {
    expect(
      reviewAccuracyPercent([
        { status: 'filled' },
        { status: 'filled' },
        { status: 'filled' },
        { status: 'failed' },
        { status: 'detected' },
        { status: 'cancelled' },
      ]),
    ).toBe(75);
  });

  it('is null until a session reaches a result', () => {
    expect(reviewAccuracyPercent([])).toBeNull();
    expect(reviewAccuracyPercent([{ status: 'detected' }, { status: 'cancelled' }])).toBeNull();
  });
});

describe('sumFilledFields', () => {
  it('adds the filled counts and treats a missing or negative count as zero', () => {
    expect(
      sumFilledFields([
        { filled_fields_count: 11 },
        { filled_fields_count: null },
        { filled_fields_count: -3 },
        { filled_fields_count: 18 },
      ]),
    ).toBe(29);
  });
});

describe('bucketOverWindow', () => {
  const start = new Date('2026-09-01T00:00:00Z');
  const end = new Date('2026-09-07T00:00:00Z');

  it('spreads rows across equal slices of the window', () => {
    const rows = [
      { created_at: '2026-09-01T05:00:00Z', n: 2 },
      { created_at: '2026-09-01T23:00:00Z', n: 1 },
      { created_at: '2026-09-04T10:00:00Z', n: 4 },
      { created_at: '2026-09-06T23:59:00Z', n: 3 },
    ];
    expect(bucketOverWindow(rows, start, end, 6)).toEqual([2, 0, 0, 1, 0, 1]);
    expect(bucketOverWindow(rows, start, end, 3, (row) => row.n)).toEqual([3, 4, 3]);
  });

  it('ignores rows outside the window and unreadable timestamps', () => {
    const rows = [
      { created_at: '2026-08-31T23:59:59Z' },
      { created_at: '2026-09-07T00:00:00Z' },
      { created_at: 'not a date' },
    ];
    expect(bucketOverWindow(rows, start, end, 3)).toEqual([0, 0, 0]);
  });

  it('returns empty buckets for an empty or inverted window', () => {
    expect(bucketOverWindow([{ created_at: '2026-09-02T00:00:00Z' }], end, start, 2)).toEqual([0, 0]);
  });
});

describe('sanitizeSearchTerm', () => {
  it('removes PostgREST filter syntax and wildcards', () => {
    expect(sanitizeSearchTerm('Bihar, Patna')).toBe('Bihar Patna');
    expect(sanitizeSearchTerm('x),status.eq.(filled')).toBe('x status.eq. filled');
    expect(sanitizeSearchTerm('100%*"\'\\')).toBe('100');
  });

  it('keeps ordinary text, including Devanagari and hostnames', () => {
    expect(sanitizeSearchTerm('  सपना   कुमारी ')).toBe('सपना कुमारी');
    expect(sanitizeSearchTerm('serviceonline.bihar.gov.in')).toBe('serviceonline.bihar.gov.in');
  });
});

describe('originHost', () => {
  it('shows the host of a portal origin', () => {
    expect(originHost('https://serviceonline.bihar.gov.in')).toBe('serviceonline.bihar.gov.in');
    expect(originHost('https://example.gov.in:8443')).toBe('example.gov.in:8443');
  });

  it('passes through anything that is not a URL', () => {
    expect(originHost('serviceonline.bihar.gov.in')).toBe('serviceonline.bihar.gov.in');
  });
});
