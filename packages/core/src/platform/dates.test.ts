import { describe, expect, it } from 'vitest';
import {
  END_DATE_KEYWORDS,
  START_DATE_KEYWORDS,
  extractNotificationDates,
  pickLabelledDate,
  readNotificationWindow,
} from './dates';

describe('extractNotificationDates', () => {
  it('reads dd/mm/yyyy day-first', () => {
    // The single most important assertion in this file. Read month-first, 05/03/2026 becomes
    // 5 May and a deadline silently moves by two months.
    const [date] = extractNotificationDates('Last date: 05/03/2026');
    expect(date?.iso).toBe('2026-03-05');
  });

  it('accepts hyphen and dot separators', () => {
    expect(extractNotificationDates('closes 31-03-2026')[0]?.iso).toBe('2026-03-31');
    expect(extractNotificationDates('closes 31.03.2026')[0]?.iso).toBe('2026-03-31');
  });

  it('reads two-digit years as 20xx', () => {
    expect(extractNotificationDates('last date 15/08/26')[0]?.iso).toBe('2026-08-15');
  });

  it('reads "15 January 2026"', () => {
    expect(extractNotificationDates('Applications open 15 January 2026')[0]?.iso).toBe(
      '2026-01-15',
    );
  });

  it('reads ordinal suffixes and abbreviated months', () => {
    expect(extractNotificationDates('on 3rd Feb, 2026')[0]?.iso).toBe('2026-02-03');
  });

  it('reads "January 15, 2026"', () => {
    expect(extractNotificationDates('Exam on January 15, 2026')[0]?.iso).toBe('2026-01-15');
  });

  it('discards a date that cannot be day-first', () => {
    // 13 is not a month, so this is either mm/dd or a typo. Either way it is not something to
    // guess at — an unread date is safe, a misread one is not.
    expect(extractNotificationDates('13/25/2026')).toHaveLength(0);
  });

  it('discards a day the month does not have', () => {
    expect(extractNotificationDates('31/02/2026')).toHaveLength(0);
    expect(extractNotificationDates('31 February 2026')).toHaveLength(0);
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(extractNotificationDates('29/02/2028')[0]?.iso).toBe('2028-02-29');
    expect(extractNotificationDates('29/02/2027')).toHaveLength(0);
  });

  it('discards a year outside 2000-2099', () => {
    expect(extractNotificationDates('01/01/1998')).toHaveLength(0);
    expect(extractNotificationDates('01/01/2150')).toHaveLength(0);
  });

  it('returns nothing for text with no dates', () => {
    expect(extractNotificationDates('Notification will be published shortly.')).toHaveLength(0);
    expect(extractNotificationDates('')).toHaveLength(0);
  });

  it('captures the text before the date as context', () => {
    const [date] = extractNotificationDates('Last date for submission: 31/03/2026');
    expect(date?.context).toContain('last date');
  });

  it('finds a date split across a line break', () => {
    expect(extractNotificationDates('Last date:\n   31/03/2026')[0]?.iso).toBe('2026-03-31');
  });
});

describe('pickLabelledDate', () => {
  it('returns the date whose label matches', () => {
    const dates = extractNotificationDates(
      'Opening date: 01/03/2026. Last date: 31/03/2026. Exam date: 20/05/2026.',
    );
    expect(pickLabelledDate(dates, START_DATE_KEYWORDS)).toBe('2026-03-01');
    expect(pickLabelledDate(dates, END_DATE_KEYWORDS)).toBe('2026-03-31');
  });

  it('returns null when nothing carries a matching label', () => {
    const dates = extractNotificationDates('Published on 01/03/2026.');
    expect(pickLabelledDate(dates, END_DATE_KEYWORDS)).toBeNull();
  });
});

describe('readNotificationWindow', () => {
  it('reads a full window from a realistic notification', () => {
    const text = `
      Staff Selection Commission
      Constable (GD) Examination, 2026

      Opening date for online application: 15/01/2026
      Last date for receipt of online application: 28/02/2026
      Date of computer based examination: 20/05/2026
    `;

    expect(readNotificationWindow(text)).toEqual({
      applicationStartDate: '2026-01-15',
      applicationEndDate: '2026-02-28',
      examDate: '2026-05-20',
    });
  });

  it('reads a closing date alone and leaves the rest null', () => {
    const window = readNotificationWindow('The last date to apply is 31 March 2026.');
    expect(window.applicationEndDate).toBe('2026-03-31');
    expect(window.applicationStartDate).toBeNull();
  });

  it('drops both dates when the window is impossible', () => {
    // Start after end means the labels were misread. Handing on one of the two would be worse
    // than handing on neither, because the surviving one looks trustworthy.
    const window = readNotificationWindow(
      'Opening date: 31/03/2026. Last date: 01/03/2026. Exam: 20/05/2026.',
    );
    expect(window.applicationStartDate).toBeNull();
    expect(window.applicationEndDate).toBeNull();
    // The exam date is independent of that contradiction and survives.
    expect(window.examDate).toBe('2026-05-20');
  });

  it('returns all nulls when nothing is labelled', () => {
    expect(readNotificationWindow('Published 01/03/2026 by the Commission.')).toEqual({
      applicationStartDate: null,
      applicationEndDate: null,
      examDate: null,
    });
  });

  it('does not mistake an exam date for a deadline', () => {
    const window = readNotificationWindow(
      'Last date to apply: 28/02/2026. Examination date: 20/05/2026.',
    );
    expect(window.applicationEndDate).toBe('2026-02-28');
    expect(window.examDate).toBe('2026-05-20');
  });
});
