import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES } from '../documents/types';
import {
  CITIZEN_TERMS_VERSION,
  CITIZEN_VAULT_DOCUMENT_CATEGORIES,
  afterPinFailure,
  citizenAccountCreateSchema,
  citizenVaultPinChangeSchema,
  codeEntryAllowed,
  decideHoldRestore,
  decideLookup,
  DEV_LOOKUP_LIMITS,
  LOOKUP_LIMITS,
  isPinDisabled,
  isPinLocked,
  isVaultGrantLive,
  isWeakVaultPin,
  normalizeShareCode,
  restoreHoldUntil,
  storedVaultCategory,
  vaultGrantExpiry,
  vaultGrantMinutesLeft,
  vaultLookupSchema,
  vaultUnlockSchema,
} from './index';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('vault categories', () => {
  it('places every core document type', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(type in CITIZEN_VAULT_DOCUMENT_CATEGORIES, type).toBe(true);
    }
  });

  it('stores unplaced types as other', () => {
    expect(storedVaultCategory('marksheet_10')).toBe('academic');
    expect(storedVaultCategory('generic')).toBe('other');
  });
});

describe('vault PIN strength', () => {
  it.each(['0000', '7777', '1234', '6789', '9876', '3210', '12a4', '123'])('refuses %s', (pin) => {
    expect(isWeakVaultPin(pin)).toBe(true);
  });

  it.each(['4826', '1357', '2580', '1122'])('accepts %s', (pin) => {
    expect(isWeakVaultPin(pin)).toBe(false);
  });
});

describe('request schemas', () => {
  const signup = {
    displayName: '  Demo Citizen ',
    vaultPin: '4826',
    termsVersion: CITIZEN_TERMS_VERSION,
    device: { platform: 'android' },
  };

  it('accepts a sign-up and fills defaults', () => {
    const parsed = citizenAccountCreateSchema.parse(signup);
    expect(parsed.displayName).toBe('Demo Citizen');
    expect(parsed.preferredLocale).toBe('hi');
    expect(parsed.cloudSync).toBe(true);
  });

  it('refuses a weak PIN and stale terms', () => {
    expect(citizenAccountCreateSchema.safeParse({ ...signup, vaultPin: '1111' }).success).toBe(
      false,
    );
    expect(
      citizenAccountCreateSchema.safeParse({ ...signup, termsVersion: '2020-01-01' }).success,
    ).toBe(false);
  });

  it('accepts a PIN change only to a strong, different PIN', () => {
    const ok = citizenVaultPinChangeSchema.safeParse({ currentPin: '4826', newPin: '5937' });
    expect(ok.success).toBe(true);

    const same = citizenVaultPinChangeSchema.safeParse({ currentPin: '4826', newPin: '4826' });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.message).toBe('errors.vault.pin_same');

    const weak = citizenVaultPinChangeSchema.safeParse({ currentPin: '4826', newPin: '1234' });
    expect(weak.error?.issues[0]?.message).toBe('errors.vault.pin_weak');

    // The current PIN is only checked for shape: a PIN set before the weak-PIN rule still works.
    expect(
      citizenVaultPinChangeSchema.safeParse({ currentPin: '12a4', newPin: '5937' }).success,
    ).toBe(false);
  });

  it('normalises a mobile typed at the counter', () => {
    expect(vaultLookupSchema.parse({ mobile: '+91 99000 12345' }).mobile).toBe('9900012345');
    expect(vaultLookupSchema.safeParse({ mobile: '12345' }).success).toBe(false);
  });

  it('normalises a share code read aloud', () => {
    expect(normalizeShareCode('849 201')).toBe('849201');
    expect(vaultUnlockSchema.parse({ mobile: '9900012345', code: '849-201' }).code).toBe('849201');
    expect(vaultUnlockSchema.safeParse({ mobile: '9900012345', code: '8492' }).success).toBe(false);
  });
});

describe('grants', () => {
  it('caps the window at two hours', () => {
    expect(vaultGrantExpiry(NOW, 999).toISOString()).toBe(minutes(120));
    expect(vaultGrantExpiry(NOW, 30).toISOString()).toBe(minutes(30));
  });

  it('is live until expiry or an early end', () => {
    expect(isVaultGrantLive({ expiresAt: minutes(5) }, NOW)).toBe(true);
    expect(isVaultGrantLive({ expiresAt: minutes(-1) }, NOW)).toBe(false);
    expect(isVaultGrantLive({ expiresAt: minutes(5), endedAt: NOW.toISOString() }, NOW)).toBe(
      false,
    );
    expect(isVaultGrantLive({ expiresAt: 'not a date' }, NOW)).toBe(false);
    expect(vaultGrantMinutesLeft({ expiresAt: minutes(90) }, NOW)).toBe(90);
  });
});

describe('lookup and code limits', () => {
  it('uses the production limits unless others are passed', () => {
    const atProductionCap = {
      byOperatorLast15Minutes: 0,
      byCentreLastHour: 0,
      toNumberLast15Minutes: LOOKUP_LIMITS.perNumberPer15Minutes,
    };
    expect(decideLookup(atProductionCap)).toEqual({ allowed: true, deliver: false });
    expect(decideLookup(atProductionCap, DEV_LOOKUP_LIMITS)).toEqual({
      allowed: true,
      deliver: true,
    });
    expect(LOOKUP_LIMITS.perNumberPer15Minutes).toBe(3);
  });

  it('stops an operator or a centre that looks up too many numbers', () => {
    expect(
      decideLookup({ byOperatorLast15Minutes: 10, byCentreLastHour: 0, toNumberLast15Minutes: 0 }),
    ).toEqual({
      allowed: false,
      reason: 'operator_limit',
    });
    expect(
      decideLookup({ byOperatorLast15Minutes: 0, byCentreLastHour: 30, toNumberLast15Minutes: 0 }),
    ).toEqual({
      allowed: false,
      reason: 'centre_limit',
    });
  });

  it('answers as usual but stops notifying a number that is being spammed', () => {
    expect(
      decideLookup({ byOperatorLast15Minutes: 0, byCentreLastHour: 0, toNumberLast15Minutes: 3 }),
    ).toEqual({
      allowed: true,
      deliver: false,
    });
    expect(
      decideLookup({ byOperatorLast15Minutes: 0, byCentreLastHour: 0, toNumberLast15Minutes: 2 }),
    ).toEqual({
      allowed: true,
      deliver: true,
    });
  });

  it('pauses code entry after too many wrong codes', () => {
    expect(codeEntryAllowed({ byCentreLastHour: 9, forNumberLastDay: 9 })).toBe(true);
    expect(codeEntryAllowed({ byCentreLastHour: 10, forNumberLastDay: 0 })).toBe(false);
    expect(codeEntryAllowed({ byCentreLastHour: 0, forNumberLastDay: 10 })).toBe(false);
  });
});

describe('vault PIN lockout', () => {
  it('locks for 24 hours on the fifth wrong PIN', () => {
    let state = { failures: 0, totalFailures: 0, lockedUntil: null as string | null };
    for (let i = 0; i < 4; i++) state = afterPinFailure(state, NOW);
    expect(state).toEqual({ failures: 4, totalFailures: 4, lockedUntil: null });
    state = afterPinFailure(state, NOW);
    expect(state.failures).toBe(0);
    expect(isPinLocked(state, NOW)).toBe(true);
    expect(isPinLocked(state, new Date(NOW.getTime() + 25 * 3_600_000))).toBe(false);
  });

  it('switches the PIN path off after ten wrong PINs in total', () => {
    let state = { failures: 0, totalFailures: 0, lockedUntil: null as string | null };
    let clock = NOW;
    for (let i = 0; i < 9; i++) {
      state = afterPinFailure(state, clock);
      clock = new Date(clock.getTime() + 25 * 3_600_000);
    }
    expect(isPinDisabled(state)).toBe(false);
    state = afterPinFailure(state, clock);
    expect(isPinDisabled(state)).toBe(true);
  });

  it('treats an unreadable lock as locked', () => {
    expect(isPinLocked({ failures: 0, totalFailures: 0, lockedUntil: 'garbage' }, NOW)).toBe(true);
  });
});

describe('hold restore', () => {
  it('waits out seven days, then restores', () => {
    const requestedAt = NOW.toISOString();
    const holdUntil = restoreHoldUntil(NOW).toISOString();
    expect(decideHoldRestore({ lastActiveAt: days(-3), requestedAt, holdUntil, now: NOW })).toBe(
      'waiting',
    );
    expect(
      decideHoldRestore({ lastActiveAt: days(-3), requestedAt, holdUntil, now: new Date(days(7)) }),
    ).toBe('restore');
  });

  it('refuses when the account was idle long enough for the number to be recycled', () => {
    const requestedAt = NOW.toISOString();
    const holdUntil = restoreHoldUntil(NOW).toISOString();
    expect(
      decideHoldRestore({
        lastActiveAt: days(-61),
        requestedAt,
        holdUntil,
        now: new Date(days(8)),
      }),
    ).toBe('refused_inactive');
  });
});
