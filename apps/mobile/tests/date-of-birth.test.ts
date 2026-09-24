/**
 * Date-of-birth handling for profile setup. Every "now" is built with the local-time `Date`
 * constructor, so these pass in any time zone.
 */

import { describe, expect, it } from 'vitest';

import {
  birthYearOptions,
  clampDay,
  dateOfBirthStatus,
  daysInMonth,
  formatDateOfBirth,
  isLeapYear,
  MAX_AGE_YEARS,
  parseIsoDate,
  toIsoDate,
} from '../lib/profile/date-of-birth';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 23 Sep 2026, late evening local time. */
const NOW = new Date(2026, 8, 23, 23, 30);

describe('isLeapYear', () => {
  it('follows the Gregorian century rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('knows the 30- and 31-day months', () => {
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 9)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it('gives February 28 or 29 by year, and 29 while the year is unknown', () => {
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(null, 2)).toBe(29);
  });
});

describe('clampDay', () => {
  it('pulls a day back into a shorter month', () => {
    expect(clampDay(31, 2025, 4)).toBe(30);
    expect(clampDay(29, 2023, 2)).toBe(28);
    expect(clampDay(30, null, 2)).toBe(29);
  });

  it('leaves a day that fits, or one with no month yet, alone', () => {
    expect(clampDay(15, 2025, 4)).toBe(15);
    expect(clampDay(31, 2025, null)).toBe(31);
  });
});

describe('toIsoDate / parseIsoDate', () => {
  it('zero-pads and round-trips', () => {
    expect(toIsoDate({ year: 2005, month: 3, day: 5 })).toBe('2005-03-05');
    expect(parseIsoDate('2005-03-05')).toEqual({ year: 2005, month: 3, day: 5 });
  });

  it('accepts a real leap day', () => {
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('rejects dates that are not on the calendar or not ISO', () => {
    for (const value of [
      '2023-02-29',
      '2025-04-31',
      '2025-13-01',
      '2025-00-10',
      '2025-01-00',
      '2005-3-15',
      '15/03/2005',
      '',
    ]) {
      expect(parseIsoDate(value), value).toBeNull();
    }
  });
});

describe('dateOfBirthStatus', () => {
  it('accepts an ordinary past date, and today', () => {
    expect(dateOfBirthStatus('2005-03-15', NOW)).toBe('valid');
    expect(dateOfBirthStatus('2026-09-23', NOW)).toBe('valid');
  });

  it('rejects a date after today', () => {
    expect(dateOfBirthStatus('2026-09-24', NOW)).toBe('future');
    expect(dateOfBirthStatus('2030-01-01', NOW)).toBe('future');
  });

  it(`accepts exactly ${MAX_AGE_YEARS} years ago and rejects the day before`, () => {
    expect(dateOfBirthStatus('1906-09-23', NOW)).toBe('valid');
    expect(dateOfBirthStatus('1906-09-22', NOW)).toBe('too_old');
  });

  it('falls back to 28 Feb when today is a leap day and that year was not a leap year', () => {
    const leapDay = new Date(2020, 1, 29, 12);
    expect(dateOfBirthStatus('1900-02-28', leapDay)).toBe('valid');
    expect(dateOfBirthStatus('1900-02-27', leapDay)).toBe('too_old');
  });

  it('rejects anything that is not a real ISO date', () => {
    expect(dateOfBirthStatus('2023-02-29', NOW)).toBe('invalid');
    expect(dateOfBirthStatus('not a date', NOW)).toBe('invalid');
  });
});

describe('birthYearOptions', () => {
  it(`runs newest first, from this year back ${MAX_AGE_YEARS} years`, () => {
    const years = birthYearOptions(NOW);
    expect(years).toHaveLength(MAX_AGE_YEARS + 1);
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2026 - MAX_AGE_YEARS);
  });
});

describe('formatDateOfBirth', () => {
  it('reads as day, month name, year', () => {
    expect(formatDateOfBirth('2005-03-15', MONTHS)).toBe('15 Mar 2005');
    expect(formatDateOfBirth('1999-12-01', MONTHS)).toBe('1 Dec 1999');
  });

  it('is null for a value that is not a real date', () => {
    expect(formatDateOfBirth('2005-02-30', MONTHS)).toBeNull();
  });
});
