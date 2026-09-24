/**
 * Date-of-birth handling for the profile step of registration.
 *
 * Dates travel as ISO `YYYY-MM-DD` strings, the shape core's `isoDateSchema` and the vault's
 * extracted fields use. A birthday is a calendar date, not an instant, so "today" is read from
 * the device's local calendar and no `Date` is ever built from the birth date itself — that
 * would shift it by a day across the UTC boundary.
 *
 * Everything here is pure so it can be tested without a device, and nothing here logs or
 * persists the date — it is PII.
 */

/** How far back the picker goes and validation accepts, in whole years before today. */
export const MAX_AGE_YEARS = 120;

/** Month translation keys, January first: `profileSetup.months.<key>`. */
export const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

export type DateParts = {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly day: number;
};

export type DateOfBirthStatus = 'valid' | 'invalid' | 'future' | 'too_old';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Days in `month` (1–12). With the year not picked yet February allows 29, so picking the day
 * first never rules out a leap-day birthday.
 */
export function daysInMonth(year: number | null, month: number): number {
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Keeps a picked day valid when the month or year changes under it: 31 becomes 30 in April. */
export function clampDay(day: number, year: number | null, month: number | null): number {
  return month === null ? day : Math.min(day, daysInMonth(year, month));
}

export function toIsoDate({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Reads an ISO date back to its parts, or `null` when it is not a real calendar date. */
export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

/** Today on the device's own calendar. */
export function localDateParts(now: Date): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * Whether `value` can be someone's date of birth as of `now`: a real date, not after today,
 * and no more than `MAX_AGE_YEARS` years ago.
 */
export function dateOfBirthStatus(value: string, now: Date): DateOfBirthStatus {
  const parts = parseIsoDate(value);
  if (!parts) return 'invalid';

  const today = localDateParts(now);
  const earliestYear = today.year - MAX_AGE_YEARS;
  const earliest = toIsoDate({
    year: earliestYear,
    month: today.month,
    // Today is 29 Feb and the earliest year is not a leap year: fall back to 28 Feb.
    day: Math.min(today.day, daysInMonth(earliestYear, today.month)),
  });

  // Zero-padded ISO dates order correctly as plain strings.
  const iso = toIsoDate(parts);
  if (iso > toIsoDate(today)) return 'future';
  if (iso < earliest) return 'too_old';
  return 'valid';
}

/** Birth years the picker offers, newest first: this year back to `MAX_AGE_YEARS` ago. */
export function birthYearOptions(now: Date): number[] {
  const current = now.getFullYear();
  return Array.from({ length: MAX_AGE_YEARS + 1 }, (_, index) => current - index);
}

/**
 * "15 Mar 2005". `monthNames` holds the twelve translated month names, January first; `null`
 * when `value` is not a real date.
 */
export function formatDateOfBirth(value: string, monthNames: readonly string[]): string | null {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  return `${parts.day} ${monthNames[parts.month - 1] ?? parts.month} ${parts.year}`;
}
