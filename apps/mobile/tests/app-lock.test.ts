/**
 * App lock (CITIZEN_MOBILE_APP_SPEC §3 Feature 2): the stored config, the PIN rules, the wait
 * after wrong PINs, when the app locks again, the lock state store and the copy. Pure; the
 * keystore and the system prompt are not touched. PINs here are test values.
 */

import { describe, expect, it } from 'vitest';

import {
  appPinFormError,
  FREE_PIN_ATTEMPTS,
  formatWait,
  forgotPinPath,
  NO_ATTEMPTS,
  parseAppLockConfig,
  parsePinAttempts,
  pinDigestInput,
  RELOCK_AFTER_MS,
  remainingWait,
  shouldRelock,
  waitAfterFailures,
  withFailedPin,
} from '../lib/security/app-lock';
import { createAppLockStore } from '../lib/security/app-lock-store';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

const SALT = '0123456789abcdef0123456789abcdef';
const HASH = 'a'.repeat(64);
const PIN_CONFIG = { version: 1, method: 'pin', salt: SALT, hash: HASH } as const;
const DEVICE_CONFIG = { version: 1, method: 'device' } as const;
const NOW = 1_800_000_000_000;

describe('stored config', () => {
  it('reads a phone-lock and an app-PIN config', () => {
    expect(parseAppLockConfig(JSON.stringify(DEVICE_CONFIG))).toEqual(DEVICE_CONFIG);
    expect(parseAppLockConfig(JSON.stringify(PIN_CONFIG))).toEqual(PIN_CONFIG);
  });

  it('treats anything else as no lock, never as a lock nobody can open', () => {
    expect(parseAppLockConfig(null)).toBeNull();
    expect(parseAppLockConfig('')).toBeNull();
    expect(parseAppLockConfig('{not json')).toBeNull();
    expect(parseAppLockConfig(JSON.stringify({ version: 2, method: 'device' }))).toBeNull();
    expect(parseAppLockConfig(JSON.stringify({ ...PIN_CONFIG, hash: 'short' }))).toBeNull();
    expect(parseAppLockConfig(JSON.stringify({ version: 1, method: 'pin' }))).toBeNull();
    // Never a PIN in the clear.
    expect(parseAppLockConfig(JSON.stringify({ ...PIN_CONFIG, hash: '2580' }))).toBeNull();
  });

  it('salts and versions what is hashed', () => {
    expect(pinDigestInput(SALT, '2580')).toBe(`bharatfill.app-lock.v1:${SALT}:2580`);
    expect(pinDigestInput(SALT, '2580')).not.toBe(pinDigestInput('f'.repeat(32), '2580'));
  });
});

describe('choosing a PIN', () => {
  it('needs four digits twice, the same both times, and not an obvious one', () => {
    expect(appPinFormError('258', '258')).toBe('incomplete');
    expect(appPinFormError('2580', '')).toBe('incomplete');
    expect(appPinFormError('1111', '1111')).toBe('weak');
    expect(appPinFormError('1234', '1234')).toBe('weak');
    expect(appPinFormError('9876', '9876')).toBe('weak');
    expect(appPinFormError('2580', '2581')).toBe('mismatch');
    expect(appPinFormError('2580', '2580')).toBeNull();
  });
});

describe('wrong PINs', () => {
  it('allows five free tries, then waits 30 s, doubling up to an hour', () => {
    for (let failures = 0; failures < FREE_PIN_ATTEMPTS; failures++) {
      expect(waitAfterFailures(failures)).toBe(0);
    }
    expect(waitAfterFailures(5)).toBe(30_000);
    expect(waitAfterFailures(6)).toBe(60_000);
    expect(waitAfterFailures(7)).toBe(120_000);
    expect(waitAfterFailures(12)).toBe(60 * 60_000);
    expect(waitAfterFailures(500)).toBe(60 * 60_000);
  });

  it('starts the wait on the fifth wrong PIN and counts it down', () => {
    let attempts = NO_ATTEMPTS;
    for (let i = 0; i < 4; i++) attempts = withFailedPin(attempts, NOW);
    expect(attempts).toEqual({ failures: 4, waitUntil: null });
    expect(remainingWait(attempts, NOW)).toBe(0);

    attempts = withFailedPin(attempts, NOW);
    expect(attempts).toEqual({ failures: 5, waitUntil: NOW + 30_000 });
    expect(remainingWait(attempts, NOW + 10_000)).toBe(20_000);
    expect(remainingWait(attempts, NOW + 31_000)).toBe(0);
  });

  it('never waits longer than an hour, even if the clock was moved back', () => {
    const attempts = { failures: 6, waitUntil: NOW + 60_000 };
    expect(remainingWait(attempts, NOW - 10 * 24 * 3600_000)).toBe(60 * 60_000);
  });

  it('does not reset the count when the stored count cannot be read', () => {
    expect(parsePinAttempts(null)).toEqual(NO_ATTEMPTS);
    expect(parsePinAttempts('{bad')).toEqual({ failures: FREE_PIN_ATTEMPTS, waitUntil: null });
    expect(parsePinAttempts(JSON.stringify({ failures: -1, waitUntil: null }))).toEqual({
      failures: FREE_PIN_ATTEMPTS,
      waitUntil: null,
    });
  });

  it('shows the wait as minutes and seconds, or hours', () => {
    expect(formatWait(30_000)).toBe('0:30');
    expect(formatWait(29_100)).toBe('0:30');
    expect(formatWait(240_000)).toBe('4:00');
    expect(formatWait(3_600_000)).toBe('1:00:00');
  });

  it('unlocks with the phone when the PIN is forgotten, and resets only without one', () => {
    expect(forgotPinPath(true)).toBe('device');
    expect(forgotPinPath(false)).toBe('reset');
  });
});

describe('when the app locks again', () => {
  it('locks only after a minute in the background', () => {
    expect(shouldRelock(null, NOW)).toBe(false);
    expect(shouldRelock(NOW, NOW + RELOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldRelock(NOW, NOW + RELOCK_AFTER_MS)).toBe(true);
  });
});

describe('lock state', () => {
  it('covers the app until the stored config is read', () => {
    const store = createAppLockStore();
    expect(store.snapshot().phase).toBe('starting');
    store.started(null);
    expect(store.snapshot()).toEqual({ phase: 'unlocked', config: null });
  });

  it('starts locked when a lock is set, and opens once passed', () => {
    const store = createAppLockStore();
    store.started(PIN_CONFIG);
    expect(store.snapshot().phase).toBe('locked');
    store.unlocked();
    expect(store.snapshot().phase).toBe('unlocked');
  });

  it('locks again after a minute away, but not after a quick trip to the system scanner', () => {
    const store = createAppLockStore();
    store.started(DEVICE_CONFIG);
    store.unlocked();

    store.wentToBackground(NOW);
    store.cameToForeground(NOW + 20_000);
    expect(store.snapshot().phase).toBe('unlocked');

    store.wentToBackground(NOW + 30_000);
    store.wentToBackground(NOW + 50_000); // a second event keeps the first time
    store.cameToForeground(NOW + 30_000 + RELOCK_AFTER_MS);
    expect(store.snapshot().phase).toBe('locked');
  });

  it('never locks with no lock set, and coming back without leaving changes nothing', () => {
    const store = createAppLockStore();
    store.started(null);
    store.wentToBackground(NOW);
    store.cameToForeground(NOW + 10 * RELOCK_AFTER_MS);
    expect(store.snapshot().phase).toBe('unlocked');

    const locked = createAppLockStore();
    locked.started(DEVICE_CONFIG);
    locked.unlocked();
    locked.cameToForeground(NOW + 10 * RELOCK_AFTER_MS);
    expect(locked.snapshot().phase).toBe('unlocked');
  });

  it('keeps the app open when the lock is turned on, changed or off from settings', () => {
    const store = createAppLockStore();
    store.started(null);
    store.configured(PIN_CONFIG);
    expect(store.snapshot()).toEqual({ phase: 'unlocked', config: PIN_CONFIG });
    store.configured(null);
    expect(store.snapshot()).toEqual({ phase: 'unlocked', config: null });
  });

  it('tells subscribers about every change', () => {
    const store = createAppLockStore();
    const seen: string[] = [];
    const stop = store.subscribe(() => seen.push(store.snapshot().phase));
    store.started(DEVICE_CONFIG);
    store.unlocked();
    stop();
    store.configured(null);
    expect(seen).toEqual(['locked', 'unlocked']);
  });
});

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

const RENDERED_KEYS = [
  'common.cancel',
  'common.ok',
  'securitySetup.setUp',
  ...[
    'title',
    'bodyDevice',
    'bodyPin',
    'pinLabel',
    'unlock',
    'promptTitle',
    'forgot',
    'wrongOne',
    'wrongOther',
    'wrongNoTries',
    'wait',
    'resetTitle',
    'resetBody',
    'resetConfirm',
    'resetDoneTitle',
    'resetDoneBody',
    'settingsTitle',
    'settingsBody',
    'choices.device.title',
    'choices.device.body',
    'choices.device.unavailable',
    'choices.pin.title',
    'choices.pin.body',
    'choices.off.title',
    'choices.off.body',
    'whenItLocks',
    'verifyBody',
    'currentPinLabel',
    'createBody',
    'newPinLabel',
    'confirmPinLabel',
    'pinNote',
    'setPin',
    'savedOnTitle',
    'savedOnBody',
    'savedOffTitle',
    'savedOffBody',
    'errors.incomplete',
    'errors.weak',
    'errors.mismatch',
    'errors.saveFailed',
  ].map((key) => `appLock.${key}`),
];

describe('app lock copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every key the lock screens render in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('uses the same placeholders in English and Hindi', () => {
    const placeholders = (text: unknown) =>
      [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    for (const key of RENDERED_KEYS) {
      expect(placeholders(lookup(hi, key)), key).toEqual(placeholders(lookup(en, key)));
    }
  });
});
