import { describe, expect, it } from 'vitest';
import {
  KEYSTROKES_PER_FIELD,
  SECONDS_SAVED_PER_FIELD,
  bucketByIstDay,
  bucketByIstMonth,
  durationParts,
  estimatedKeystrokesSaved,
  estimatedSecondsSaved,
  greetingKey,
  initialsOf,
  istDayKey,
  istDayKeys,
  istHour,
  istMonthKey,
  istMonthKeys,
  istMonthStart,
  sparklineHeights,
  trendFrom,
} from './metrics';

describe('istDayKey', () => {
  it('reads an instant as its IST calendar day', () => {
    expect(istDayKey('2026-03-15T06:30:00.000Z')).toBe('2026-03-15');
  });

  it('keeps a late-evening IST session on the day the shift started', () => {
    // 18:10 UTC is 23:40 IST — still the 15th at the counter.
    expect(istDayKey('2026-03-15T18:10:00.000Z')).toBe('2026-03-15');
  });

  it('rolls over at IST midnight, not UTC midnight', () => {
    // 18:31 UTC is 00:01 IST the next day.
    expect(istDayKey('2026-03-15T18:31:00.000Z')).toBe('2026-03-16');
    // 22:00 UTC is already the 16th in India, even though UTC still says the 15th.
    expect(istDayKey('2026-03-15T22:00:00.000Z')).toBe('2026-03-16');
  });

  it('returns null for an unparseable timestamp rather than guessing a day', () => {
    expect(istDayKey('not a date')).toBeNull();
  });
});

describe('istHour', () => {
  it('reports the IST wall-clock hour', () => {
    expect(istHour(new Date('2026-03-15T03:30:00.000Z'))).toBe(9);
    expect(istHour(new Date('2026-03-15T18:31:00.000Z'))).toBe(0);
  });
});

describe('istDayKeys', () => {
  it('returns the window oldest-first, ending on the current IST day', () => {
    expect(istDayKeys(3, new Date('2026-03-15T06:00:00.000Z'))).toEqual([
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
  });

  it('crosses a month boundary correctly', () => {
    expect(istDayKeys(3, new Date('2026-03-01T06:00:00.000Z'))).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('is empty for a zero or negative window', () => {
    expect(istDayKeys(0, new Date('2026-03-15T06:00:00.000Z'))).toEqual([]);
    expect(istDayKeys(-2, new Date('2026-03-15T06:00:00.000Z'))).toEqual([]);
  });
});

describe('bucketByIstDay', () => {
  const asOf = new Date('2026-03-15T06:00:00.000Z');

  it('counts rows into their IST day, oldest first', () => {
    const rows = [
      { created_at: '2026-03-15T04:00:00.000Z' },
      { created_at: '2026-03-15T05:00:00.000Z' },
      { created_at: '2026-03-13T05:00:00.000Z' },
    ];
    expect(bucketByIstDay(rows, 3, asOf)).toEqual([1, 0, 2]);
  });

  it('sums a column when given a value accessor', () => {
    const rows = [
      { created_at: '2026-03-15T04:00:00.000Z', filled_fields_count: 12 },
      { created_at: '2026-03-15T05:00:00.000Z', filled_fields_count: 8 },
      { created_at: '2026-03-14T05:00:00.000Z', filled_fields_count: 5 },
    ];
    expect(bucketByIstDay(rows, 3, asOf, (row) => row.filled_fields_count)).toEqual([0, 5, 20]);
  });

  it('ignores rows outside the window instead of folding them into the edge bucket', () => {
    const rows = [
      { created_at: '2026-03-01T05:00:00.000Z' },
      { created_at: '2026-03-15T05:00:00.000Z' },
    ];
    expect(bucketByIstDay(rows, 3, asOf)).toEqual([0, 0, 1]);
  });

  it('ignores an unparseable timestamp', () => {
    expect(bucketByIstDay([{ created_at: 'garbage' }], 3, asOf)).toEqual([0, 0, 0]);
  });
});

describe('sparklineHeights', () => {
  it('scales against the tallest bar', () => {
    expect(sparklineHeights([0, 5, 10])).toEqual([8, 50, 100]);
  });

  it('gives a quiet day a visible floor so it does not read as missing data', () => {
    expect(sparklineHeights([0, 100], 8)).toEqual([8, 100]);
  });

  it('renders a flat floor for a week with nothing in it', () => {
    expect(sparklineHeights([0, 0, 0])).toEqual([8, 8, 8]);
  });
});

describe('trendFrom', () => {
  it('compares the latest day against the mean of the earlier days', () => {
    const trend = trendFrom([10, 10, 10, 15]);
    expect(trend?.deltaPercent).toBe(50);
    expect(trend?.direction).toBe('up');
  });

  it('reports a fall', () => {
    const trend = trendFrom([10, 10, 10, 5]);
    expect(trend?.deltaPercent).toBe(-50);
    expect(trend?.direction).toBe('down');
  });

  it('withholds a percentage when there is no baseline to compare against', () => {
    const trend = trendFrom([0, 0, 0, 7]);
    expect(trend?.deltaPercent).toBeNull();
    expect(trend?.direction).toBe('up');
  });

  it('has no trend for an empty series', () => {
    expect(trendFrom([])).toBeNull();
  });

  it('treats a single-day window as having no comparison', () => {
    expect(trendFrom([4])).toEqual({
      latest: 4,
      baseline: 0,
      deltaPercent: null,
      direction: 'flat',
    });
  });
});

describe('estimates', () => {
  it('derives seconds and keystrokes from the documented per-field placeholders', () => {
    expect(estimatedSecondsSaved(10)).toBe(10 * SECONDS_SAVED_PER_FIELD);
    expect(estimatedKeystrokesSaved(10)).toBe(10 * KEYSTROKES_PER_FIELD);
  });

  it('never returns a negative estimate', () => {
    expect(estimatedSecondsSaved(-5)).toBe(0);
    expect(estimatedKeystrokesSaved(-5)).toBe(0);
  });
});

describe('durationParts', () => {
  it('splits into whole hours and minutes', () => {
    expect(durationParts(3600 + 15 * 60)).toEqual({ hours: 1, minutes: 15 });
  });

  it('reports a sub-hour duration as minutes only', () => {
    expect(durationParts(90)).toEqual({ hours: 0, minutes: 2 });
  });

  it('carries a rounded 60 minutes into the hour instead of rendering 1h 60m', () => {
    expect(durationParts(7199)).toEqual({ hours: 2, minutes: 0 });
  });

  it('floors at zero', () => {
    expect(durationParts(-10)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('greetingKey', () => {
  it('changes with the IST hour', () => {
    expect(greetingKey(8)).toBe('dashboard.greetingMorning');
    expect(greetingKey(13)).toBe('dashboard.greetingAfternoon');
    expect(greetingKey(20)).toBe('dashboard.greetingEvening');
  });
});

describe('initialsOf', () => {
  it('uses the first and last word', () => {
    expect(initialsOf('Amit Kumar Singh')).toBe('AS');
    expect(initialsOf('Sunita')).toBe('S');
  });

  it('falls back to a placeholder for an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('( )')).toBe('?');
  });

  it('ignores punctuation and prefers the Latin rendering of a bilingual name', () => {
    expect(initialsOf('सपना कुमारी (Sapna Kumari)')).toBe('SK');
    expect(initialsOf('Suraj Pratap Singh.')).toBe('SS');
  });

  it('keeps Devanagari letters when the name has no Latin rendering', () => {
    expect(initialsOf('सपना कुमारी')).toBe('सक');
  });
});

describe('istMonthKey', () => {
  it('reads an instant as its IST calendar month', () => {
    expect(istMonthKey('2026-09-15T06:30:00.000Z')).toBe('2026-09');
  });

  it('rolls into the next month after IST midnight on the 1st', () => {
    // 18:40 UTC on 31 Aug is 00:10 IST on 1 Sep.
    expect(istMonthKey('2026-08-31T18:40:00.000Z')).toBe('2026-09');
  });

  it('returns null for an unparseable instant', () => {
    expect(istMonthKey('not a date')).toBeNull();
  });
});

describe('istMonthStart', () => {
  const asOf = new Date('2026-09-27T10:00:00.000Z');

  it('is IST midnight on the 1st, expressed in UTC', () => {
    expect(istMonthStart(asOf).toISOString()).toBe('2026-08-31T18:30:00.000Z');
  });

  it('steps back across a year boundary', () => {
    expect(istMonthStart(new Date('2026-02-10T00:00:00.000Z'), 3).toISOString()).toBe(
      '2025-10-31T18:30:00.000Z',
    );
  });
});

describe('istMonthKeys', () => {
  it('lists the window oldest first, ending with the current month', () => {
    expect(istMonthKeys(3, new Date('2026-01-05T00:00:00.000Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('bucketByIstMonth', () => {
  it('counts rows per IST month and ignores rows outside the window', () => {
    const asOf = new Date('2026-09-27T10:00:00.000Z');
    const rows = [
      { created_at: '2026-09-02T04:00:00.000Z' },
      { created_at: '2026-08-31T18:40:00.000Z' }, // 1 Sep IST
      { created_at: '2026-08-19T04:00:00.000Z' },
      { created_at: '2026-01-01T04:00:00.000Z' }, // outside a 3-month window
    ];
    expect(bucketByIstMonth(rows, 3, asOf)).toEqual([0, 1, 2]);
  });
});
