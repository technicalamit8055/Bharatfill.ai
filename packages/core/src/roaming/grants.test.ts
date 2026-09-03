import { describe, expect, it } from 'vitest';
import {
  formatGrantRemaining,
  grantCountdownLabel,
  grantExpiryFrom,
  grantRemainingMs,
  isChallengeUsable,
  isGrantActive,
  resolveGrantDuration,
} from './grants';
import { MAX_ROAMING_DURATION_MINUTES } from './types';

const NOW = new Date('2026-09-03T10:00:00.000Z');
const in2Hours = new Date(NOW.getTime() + 2 * 60 * 60_000).toISOString();
const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString();

describe('isGrantActive', () => {
  it('accepts a live grant', () => {
    expect(isGrantActive({ status: 'active', expiresAt: in2Hours }, NOW)).toBe(true);
  });

  it('refuses one whose window has run out', () => {
    expect(isGrantActive({ status: 'active', expiresAt: twoHoursAgo }, NOW)).toBe(false);
  });

  it('refuses a revoked grant even while its window is still open', () => {
    expect(
      isGrantActive({ status: 'revoked', expiresAt: in2Hours, revokedAt: NOW.toISOString() }, NOW),
    ).toBe(false);
    // A row whose status has not caught up with the revocation must still read as dead.
    expect(
      isGrantActive({ status: 'active', expiresAt: in2Hours, revokedAt: NOW.toISOString() }, NOW),
    ).toBe(false);
  });

  it('fails closed on a missing or unparseable expiry', () => {
    expect(isGrantActive({ status: 'active', expiresAt: null }, NOW)).toBe(false);
    expect(isGrantActive({ status: 'active', expiresAt: 'soon' }, NOW)).toBe(false);
  });

  it('treats the exact expiry instant as over', () => {
    expect(isGrantActive({ status: 'active', expiresAt: NOW.toISOString() }, NOW)).toBe(false);
  });
});

describe('remaining time', () => {
  it('reports what is left', () => {
    expect(grantRemainingMs({ status: 'active', expiresAt: in2Hours }, NOW)).toBe(2 * 60 * 60_000);
  });

  it('is zero for anything not live', () => {
    expect(grantRemainingMs({ status: 'expired', expiresAt: in2Hours }, NOW)).toBe(0);
  });

  it('formats hours and minutes, rounding down', () => {
    expect(formatGrantRemaining(108 * 60_000 + 59_000)).toBe('01h 48m');
    expect(formatGrantRemaining(4 * 60_000)).toBe('04m');
    expect(formatGrantRemaining(0)).toBe('00m');
    expect(formatGrantRemaining(-5)).toBe('00m');
  });

  it('gives no countdown label when there is no live session', () => {
    expect(grantCountdownLabel(null, NOW)).toBeNull();
    expect(grantCountdownLabel({ status: 'active', expiresAt: twoHoursAgo }, NOW)).toBeNull();
    expect(grantCountdownLabel({ status: 'active', expiresAt: in2Hours }, NOW)).toBe('02h 00m');
  });
});

describe('resolveGrantDuration', () => {
  it('accepts the offered windows', () => {
    expect(resolveGrantDuration(60)).toBe(60);
    expect(resolveGrantDuration(120)).toBe(120);
    expect(resolveGrantDuration(240)).toBe(240);
  });

  it('falls back to two hours rather than honouring an unoffered number', () => {
    expect(resolveGrantDuration(500)).toBe(120);
    expect(resolveGrantDuration(0)).toBe(120);
    expect(resolveGrantDuration(null)).toBe(120);
    expect(resolveGrantDuration(undefined)).toBe(120);
  });
});

describe('grantExpiryFrom', () => {
  it('adds the window', () => {
    expect(grantExpiryFrom(NOW, 120).toISOString()).toBe('2026-09-03T12:00:00.000Z');
  });

  it('never exceeds the database ceiling', () => {
    const capped = grantExpiryFrom(NOW, 10_000);
    expect(capped.getTime() - NOW.getTime()).toBe(MAX_ROAMING_DURATION_MINUTES * 60_000);
  });
});

describe('isChallengeUsable', () => {
  const base = { expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), attemptsLeft: 5 };

  it('accepts a fresh code', () => {
    expect(isChallengeUsable(base, NOW)).toBe(true);
  });

  it('refuses a spent, timed-out or exhausted code', () => {
    expect(isChallengeUsable({ ...base, consumedAt: NOW.toISOString() }, NOW)).toBe(false);
    expect(isChallengeUsable({ ...base, attemptsLeft: 0 }, NOW)).toBe(false);
    expect(isChallengeUsable({ ...base, expiresAt: twoHoursAgo }, NOW)).toBe(false);
  });
});
