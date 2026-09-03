/**
 * Dashboard command-centre arithmetic.
 *
 * Lives here rather than in the page so it can be unit tested (DEVELOPMENT_RULES §2: domain
 * logic outside React components) and so every number the operator sees has one definition.
 *
 * Nothing in this file touches a customer value. It counts timestamps and field tallies, which
 * is why a seven-day trend can be derived without any personal data crossing a boundary.
 */

/** IST is UTC+05:30 all year — India observes no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(instant: Date | string): Date | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The same instant shifted so that UTC getters read as IST wall-clock components. */
function shiftToIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

/**
 * The IST calendar day an instant falls in, as `YYYY-MM-DD`.
 *
 * The centre's day is the operator's day: a fill session recorded at 23:40 IST belongs to the
 * shift that is still open, not to tomorrow because the database happens to store UTC.
 */
export function istDayKey(instant: Date | string): string | null {
  const date = toDate(instant);
  if (!date) return null;
  return shiftToIst(date).toISOString().slice(0, 10);
}

/** The IST hour of day (0–23) — what the greeting and the "open now" badge read. */
export function istHour(asOf: Date = new Date()): number {
  return shiftToIst(asOf).getUTCHours();
}

/**
 * The last `days` IST day keys, oldest first, ending with the day `asOf` falls in.
 * Oldest-first because that is the reading order of a sparkline.
 */
export function istDayKeys(days: number, asOf: Date = new Date()): string[] {
  const span = Math.max(0, Math.trunc(days));
  const end = shiftToIst(asOf).getTime();
  const keys: string[] = [];
  for (let offset = span - 1; offset >= 0; offset--) {
    keys.push(new Date(end - offset * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * One bucket per IST day over the window, oldest first.
 *
 * `valueOf` defaults to counting rows; pass it to sum a column instead (fields filled per day).
 * Rows outside the window are ignored rather than folded into the nearest bucket — a bar has to
 * mean the day it sits under.
 */
export function bucketByIstDay<T extends { created_at: string }>(
  rows: readonly T[],
  days: number,
  asOf: Date = new Date(),
  valueOf: (row: T) => number = () => 1,
): number[] {
  const keys = istDayKeys(days, asOf);
  const index = new Map<string, number>();
  keys.forEach((key, position) => index.set(key, position));

  const buckets = new Array<number>(keys.length).fill(0);
  for (const row of rows) {
    const key = istDayKey(row.created_at);
    if (!key) continue;
    const position = index.get(key);
    if (position === undefined) continue;
    buckets[position] = (buckets[position] ?? 0) + valueOf(row);
  }
  return buckets;
}

/**
 * Bar heights as percentages of the tallest bar, for the stat-card sparkline.
 *
 * A zero day still gets `minPercent` so the operator can see that the day existed and was quiet,
 * rather than seeing a gap and reading it as missing data. An all-zero week returns all
 * `minPercent`: a flat floor is the honest picture of a week with nothing in it.
 */
export function sparklineHeights(series: readonly number[], minPercent = 8): number[] {
  const peak = series.reduce((max, value) => (value > max ? value : max), 0);
  if (peak <= 0) return series.map(() => minPercent);
  return series.map((value) => {
    const scaled = Math.round((value / peak) * 100);
    return Math.max(minPercent, Math.min(100, scaled));
  });
}

export type Trend = {
  /** The most recent day in the window. */
  latest: number;
  /** Mean of the days before the latest one. */
  baseline: number;
  /** Latest against that baseline, as a whole percentage. `null` when there is no baseline. */
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat';
};

/**
 * Today read against the rest of the window.
 *
 * `deltaPercent` is `null` when the earlier days are all zero: a first busy day is not "+100%",
 * it is a day with no comparison, and printing a percentage there would be a made-up number
 * (master spec §8.6 — an estimate is labelled, a fabrication is not shown).
 */
export function trendFrom(series: readonly number[]): Trend | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1] ?? 0;
  const earlier = series.slice(0, -1);
  if (earlier.length === 0) {
    return { latest, baseline: 0, deltaPercent: null, direction: 'flat' };
  }

  const baseline = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
  if (baseline <= 0) {
    return { latest, baseline, deltaPercent: null, direction: latest > 0 ? 'up' : 'flat' };
  }

  const deltaPercent = Math.round(((latest - baseline) / baseline) * 100);
  const direction = deltaPercent > 0 ? 'up' : deltaPercent < 0 ? 'down' : 'flat';
  return { latest, baseline, deltaPercent, direction };
}

/**
 * Time saved is presented as an estimate and labelled as one (spec §8.6 — no overclaiming).
 * 12 seconds per field is a placeholder until the pilot measures it for real; Phase 10 replaces
 * this with observed data.
 */
export const SECONDS_SAVED_PER_FIELD = 12;

/**
 * Keystrokes avoided per autofilled field. Fourteen is the rough width of the fields that
 * actually get typed at a counter — a name, a district, a ten-digit mobile, an IFSC — and like
 * the seconds figure it is an estimate the UI labels as one, not a measurement.
 */
export const KEYSTROKES_PER_FIELD = 14;

export function estimatedSecondsSaved(fieldsFilled: number): number {
  return Math.max(0, Math.round(fieldsFilled)) * SECONDS_SAVED_PER_FIELD;
}

export function estimatedKeystrokesSaved(fieldsFilled: number): number {
  return Math.max(0, Math.round(fieldsFilled)) * KEYSTROKES_PER_FIELD;
}

export type DurationParts = { hours: number; minutes: number };

/**
 * Seconds split into whole hours and minutes for the widget to localise.
 *
 * Returns the parts rather than a formatted string so "2h 15m" and "2 घं 15 मि" come from
 * translation keys, not from this module (DEVELOPMENT_RULES §9).
 */
export function durationParts(totalSeconds: number): DurationParts {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.round((safe % 3600) / 60);
  // 119.6 minutes must not render as "1h 60m".
  return minutes === 60 ? { hours: hours + 1, minutes: 0 } : { hours, minutes };
}

export function greetingKey(hour: number): string {
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

/** Initials for the avatar chip: first and last word, so "Amit Kumar Singh" reads "AS". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
