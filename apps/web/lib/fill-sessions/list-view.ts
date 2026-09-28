import { z } from 'zod';
import { FILL_SESSION_STATUSES } from './schema';

/**
 * The fill sessions audit log (spec §7.3.10): its URL state, the date window the summary cards
 * cover, and the rules behind each summary number.
 *
 * Kept out of the page so every rule is unit tested. Nothing here reads a field value — only
 * statuses, counts and timestamps — so no customer data ever passes through this module.
 */

export type FillSessionStatusFilter = (typeof FILL_SESSION_STATUSES)[number];

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

export const DATE_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type DateRange = (typeof DATE_RANGES)[number];
export const DEFAULT_DATE_RANGE: DateRange = '30d';

const DATE_RANGE_DAYS: Record<Exclude<DateRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const SORT_ORDERS = ['newest', 'oldest'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Search terms longer than this are cut, matching `fillSessionSearchSchema`. */
const MAX_QUERY_LENGTH = 200;

export type FillSessionListParams = {
  q: string;
  status: FillSessionStatusFilter | '';
  range: DateRange;
  sort: SortOrder;
  page: number;
  perPage: PageSize;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** First value of a repeated query parameter — `?page=2&page=3` reads as page 2. */
const firstValue = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.unknown(),
);

/*
 * Every field falls back to its default rather than failing: a stale or hand-edited URL should
 * land on a working list, not an error page.
 */
const listParamsSchema = z.object({
  q: firstValue.pipe(z.string().trim().max(MAX_QUERY_LENGTH)).catch(''),
  status: firstValue.pipe(z.enum(['', ...FILL_SESSION_STATUSES])).catch(''),
  range: firstValue.pipe(z.enum(DATE_RANGES)).catch(DEFAULT_DATE_RANGE),
  sort: firstValue.pipe(z.enum(SORT_ORDERS)).catch('newest'),
  page: firstValue.pipe(z.coerce.number().int().min(1).max(100_000)).catch(1),
  per: firstValue
    .pipe(
      z.coerce
        .number()
        .int()
        .refine((value): value is PageSize => (PAGE_SIZES as readonly number[]).includes(value)),
    )
    .catch(DEFAULT_PAGE_SIZE),
});

export function parseFillSessionParams(
  searchParams: Record<string, string | string[] | undefined>,
): FillSessionListParams {
  const parsed = listParamsSchema.parse(searchParams);
  return {
    q: parsed.q,
    status: parsed.status,
    range: parsed.range,
    sort: parsed.sort,
    page: parsed.page,
    perPage: parsed.per as PageSize,
  };
}

/**
 * The URL for the list with some of its state changed. Defaults are left out, so the plain
 * `/fill-sessions` link stays plain and a shared URL carries only what was actually chosen.
 */
export function fillSessionsHref(
  current: FillSessionListParams,
  changes: Partial<FillSessionListParams> = {},
): string {
  const next = { ...current, ...changes };
  const query = new URLSearchParams();
  const q = next.q.trim();
  if (q) query.set('q', q);
  if (next.status) query.set('status', next.status);
  if (next.range !== DEFAULT_DATE_RANGE) query.set('range', next.range);
  if (next.sort !== 'newest') query.set('sort', next.sort);
  if (next.perPage !== DEFAULT_PAGE_SIZE) query.set('per', String(next.perPage));
  if (next.page > 1) query.set('page', String(next.page));
  const search = query.toString();
  return search ? `/fill-sessions?${search}` : '/fill-sessions';
}

/** True when the search box or the status picker is narrowing the list. */
export function hasListFilters(params: FillSessionListParams): boolean {
  return params.q !== '' || params.status !== '';
}

export function rangeDays(range: DateRange): number | null {
  return range === 'all' ? null : DATE_RANGE_DAYS[range];
}

/** The earliest `created_at` the date window admits, or null when it admits everything. */
export function rangeStart(range: DateRange, asOf: Date = new Date()): Date | null {
  const days = rangeDays(range);
  return days === null ? null : new Date(asOf.getTime() - days * DAY_MS);
}

/** Start of the equally long window just before the current one — the comparison period. */
export function previousRangeStart(range: DateRange, asOf: Date = new Date()): Date | null {
  const days = rangeDays(range);
  return days === null ? null : new Date(asOf.getTime() - 2 * days * DAY_MS);
}

/**
 * The current period against the one before it, as a whole percentage.
 *
 * `null` when the earlier period was empty: a first busy month is not "+100%", it has no
 * comparison, and printing one would be a made-up number (spec §8.6, the dashboard trend rule).
 */
export function periodChangePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type CountedSession = { status: string; created_at: string; filled_fields_count: number | null };

/**
 * Share of sessions that ended filled, among those an operator actually took to a result.
 *
 * Sessions still at "detected", or cancelled before any review, say nothing about accuracy and
 * are left out. `null` when nothing has reached a result yet — there is no accuracy to show.
 */
export function reviewAccuracyPercent(sessions: readonly Pick<CountedSession, 'status'>[]): number | null {
  const decided = sessions.filter((row) => ['filled', 'reviewed', 'failed'].includes(row.status));
  if (decided.length === 0) return null;
  const filled = decided.filter((row) => row.status === 'filled').length;
  return Math.round((filled / decided.length) * 100);
}

export function sumFilledFields(sessions: readonly Pick<CountedSession, 'filled_fields_count'>[]): number {
  return sessions.reduce((sum, row) => sum + Math.max(0, row.filled_fields_count ?? 0), 0);
}

/**
 * Splits `[start, end)` into `buckets` equal slices and totals `valueOf` per slice, for the
 * little bar charts on the summary cards. Rows outside the window are ignored.
 */
export function bucketOverWindow<T extends { created_at: string }>(
  rows: readonly T[],
  start: Date,
  end: Date,
  buckets: number,
  valueOf: (row: T) => number = () => 1,
): number[] {
  const series = Array.from({ length: Math.max(0, buckets) }, () => 0);
  const span = end.getTime() - start.getTime();
  if (buckets <= 0 || span <= 0) return series;

  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (Number.isNaN(at) || at < start.getTime() || at >= end.getTime()) continue;
    const index = Math.min(buckets - 1, Math.floor(((at - start.getTime()) / span) * buckets));
    series[index] = (series[index] ?? 0) + valueOf(row);
  }
  return series;
}

/**
 * The search box's text, made safe to drop into a PostgREST `or()` filter.
 *
 * Commas, parentheses and quotes are the filter's own syntax, and `%`/`*` are wildcards; left
 * in, a search for "Bihar, Patna" would split into a second (broken) condition. Removing them
 * costs nothing — no portal title or customer name is searched for by its punctuation.
 */
export function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[,()"'%*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/** `https://serviceonline.bihar.gov.in` → `serviceonline.bihar.gov.in`; anything else as-is. */
export function originHost(origin: string): string {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin;
  }
}
