import { describe, expect, it } from 'vitest';
import { currentUsagePeriod, planAction, usagePercent } from './view';

describe('usagePercent', () => {
  it('rounds a ratio to a whole percentage', () => {
    expect(usagePercent(0.033)).toBe(3);
    expect(usagePercent(0.5)).toBe(50);
    expect(usagePercent(1)).toBe(100);
  });

  it('treats unlimited as an empty bar', () => {
    expect(usagePercent(null)).toBe(0);
  });

  it('clamps out-of-range and non-finite ratios', () => {
    expect(usagePercent(1.7)).toBe(100);
    expect(usagePercent(-0.2)).toBe(0);
    expect(usagePercent(Number.NaN)).toBe(0);
  });
});

describe('currentUsagePeriod', () => {
  it('spans the whole calendar month', () => {
    expect(currentUsagePeriod(new Date('2026-09-27T10:00:00Z'))).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('handles February in a leap year and December rollover', () => {
    expect(currentUsagePeriod(new Date('2028-02-10T00:00:00Z')).end).toBe('2028-02-29');
    expect(currentUsagePeriod(new Date('2026-12-31T23:59:59Z'))).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
  });

  it('uses the UTC month, like the entitlement query', () => {
    // 1 Oct 02:00 IST is still 30 Sep in UTC.
    expect(currentUsagePeriod(new Date('2026-09-30T20:30:00Z')).start).toBe('2026-09-01');
  });
});

describe('planAction', () => {
  const catalogue = ['free', 'starter', 'district_pro', 'professional', 'business'];

  it('marks the active plan as current', () => {
    expect(planAction('starter', 'starter', catalogue)).toBe('current');
  });

  it('follows the catalogue order, including admin-created plans', () => {
    expect(planAction('free', 'starter', catalogue)).toBe('downgrade');
    expect(planAction('district_pro', 'starter', catalogue)).toBe('upgrade');
    expect(planAction('district_pro', 'professional', catalogue)).toBe('downgrade');
    expect(planAction('business', 'professional', catalogue)).toBe('upgrade');
  });

  it('offers only upgrades when the active plan is not in the catalogue (retired)', () => {
    expect(planAction('free', 'legacy', catalogue)).toBe('upgrade');
    expect(planAction('business', 'legacy', catalogue)).toBe('upgrade');
  });
});
