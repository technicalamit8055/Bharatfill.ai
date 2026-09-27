import { z } from 'zod';

/**
 * The customers list page (spec §7.3.2): its URL state, the "added" filter window, paging, and
 * the summary numbers above the table.
 *
 * Kept out of the page so every rule here is unit tested, and so the numbers on the stat cards
 * have one definition. Nothing in this file reads a customer value beyond the state line of an
 * address and a verification status — no name, number or document ever passes through it.
 */

export const LIST_VIEWS = ['all', 'roaming'] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

/** The spec's "created date" filter, as the windows a counter actually asks about. */
export const ADDED_WINDOWS = ['any', '7d', '30d', '90d'] as const;
export type AddedWindow = (typeof ADDED_WINDOWS)[number];

const ADDED_WINDOW_DAYS: Record<Exclude<AddedWindow, 'any'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Statuses the "verified" card counts: someone checked the record, operator or citizen. */
export const VERIFIED_STATUSES = ['operator_verified', 'customer_confirmed'] as const;

export type ListParams = {
  view: ListView;
  page: number;
  perPage: PageSize;
  added: AddedWindow;
};

/** First value of a repeated query parameter — `?page=2&page=3` reads as page 2. */
const firstValue = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.unknown(),
);

/*
 * Every field falls back to its default rather than failing: a hand-edited or stale URL should
 * land on a working list, not an error page.
 */
const listParamsSchema = z.object({
  view: firstValue.pipe(z.enum(LIST_VIEWS)).catch('all'),
  page: firstValue.pipe(z.coerce.number().int().min(1).max(100_000)).catch(1),
  per: firstValue
    .pipe(
      z.coerce
        .number()
        .int()
        .refine((value): value is PageSize => (PAGE_SIZES as readonly number[]).includes(value)),
    )
    .catch(DEFAULT_PAGE_SIZE),
  added: firstValue.pipe(z.enum(ADDED_WINDOWS)).catch('any'),
});

export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
): ListParams {
  const parsed = listParamsSchema.parse(searchParams);
  return {
    view: parsed.view,
    page: parsed.page,
    perPage: parsed.per as PageSize,
    added: parsed.added,
  };
}

/**
 * The URL for the list with some of its state changed. Defaults are left out, so the plain
 * `/customers` link stays plain and a shared URL carries only what was actually chosen.
 */
export function listHref(current: ListParams, changes: Partial<ListParams> = {}): string {
  const next = { ...current, ...changes };
  const query = new URLSearchParams();
  if (next.view !== 'all') query.set('view', next.view);
  if (next.added !== 'any') query.set('added', next.added);
  if (next.perPage !== DEFAULT_PAGE_SIZE) query.set('per', String(next.perPage));
  if (next.page > 1) query.set('page', String(next.page));
  const search = query.toString();
  return search ? `/customers?${search}` : '/customers';
}

/** The earliest `created_at` the "added" filter admits, or null when it admits everything. */
export function addedSince(window: AddedWindow, asOf: Date = new Date()): Date | null {
  if (window === 'any') return null;
  return new Date(asOf.getTime() - ADDED_WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);
}

/** Zero-based inclusive row range for PostgREST's `range()`. */
export function pageRange(page: number, perPage: number): { from: number; to: number } {
  const from = (Math.max(1, page) - 1) * perPage;
  return { from, to: from + perPage - 1 };
}

export function lastPage(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage));
}

/**
 * The page numbers to show as buttons: up to `size` of them, centred on the current page and
 * pushed inwards at either end so the row never shows fewer buttons than it could.
 */
export function pageWindow(page: number, last: number, size = 5): number[] {
  const count = Math.min(size, last);
  const start = Math.min(Math.max(1, page - Math.floor(count / 2)), last - count + 1);
  return Array.from({ length: count }, (_, offset) => start + offset);
}

/**
 * This month's additions as growth over everyone registered before the month began.
 *
 * `null` when there was nobody before: a centre's first month is not "+100%", it has no
 * comparison, and printing one would be a made-up number (the same rule as the dashboard trend).
 */
export function monthGrowthPercent(total: number, addedThisMonth: number): number | null {
  const before = total - addedThisMonth;
  if (before <= 0 || addedThisMonth <= 0) return null;
  return Math.round((addedThisMonth / before) * 100);
}

/** Whole-number share, for the verified card's bar. */
export function sharePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

export type StateTally = { state: string; count: number };

/**
 * The state most customers come from, read from the address a record carries.
 *
 * Grouped case- and space-insensitively so "BIHAR", "Bihar" and " bihar " are one state; the
 * label is the spelling seen first, which — with rows newest first — is the most recent entry.
 * A tie goes to the state seen first for the same reason.
 */
export function topState(states: readonly (string | null | undefined)[]): StateTally | null {
  const tallies = new Map<string, StateTally>();
  for (const raw of states) {
    const state = raw?.trim().replace(/\s+/g, ' ');
    if (!state) continue;
    const key = state.toLocaleLowerCase('en-IN');
    const tally = tallies.get(key);
    if (tally) tally.count += 1;
    else tallies.set(key, { state, count: 1 });
  }

  let best: StateTally | null = null;
  for (const tally of tallies.values()) {
    if (!best || tally.count > best.count) best = tally;
  }
  return best;
}

/** Whether a state line names Bihar, in either script the profile form accepts. */
export function isBihar(state: string | null | undefined): boolean {
  const normalized = state?.trim().toLocaleLowerCase('en-IN');
  return normalized === 'bihar' || normalized === 'बिहार';
}
