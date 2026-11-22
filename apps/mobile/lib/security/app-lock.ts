/**
 * App lock rules (CITIZEN_MOBILE_APP_SPEC §3 Feature 2 "App Lock"): what is stored, how wrong
 * PINs slow down, and when the app locks again. Pure, so it is tested without a device; the
 * keystore and the system prompt are `app-lock-storage.ts`.
 *
 * Two ways to unlock:
 *   device  the phone's own fingerprint, face or screen lock (the system prompt). Offered only
 *           when the phone has a screen lock; nothing about it is stored here.
 *   pin     a 4-digit app PIN, for phones with no screen lock — common on entry-level phones.
 *           Kept only as a salted SHA-256 in the platform keystore. It is a local door, not the
 *           Vault PIN: the Vault PIN restores the cloud vault and is checked only by the server,
 *           with a lifetime attempt cap that a copy on the phone would undercut.
 *
 * Wrong app PINs never erase anything (a child tapping at the phone must not wipe the vault);
 * they make the citizen wait, longer each time. Forgetting the PIN has its own way out
 * (`forgotPinPath`).
 */

import { isWeakVaultPin } from '@assistigo/core';
import { z } from 'zod';

export const APP_LOCK_PIN_LENGTH = 4;

/** Locks again once the app has been in the background this long. */
export const RELOCK_AFTER_MS = 60_000;

/** Wrong PINs allowed before the first wait. */
export const FREE_PIN_ATTEMPTS = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 60 * 60_000;

export const APP_LOCK_METHODS = ['device', 'pin'] as const;
export type AppLockMethod = (typeof APP_LOCK_METHODS)[number];

const HEX_64 = /^[0-9a-f]{64}$/;
const SALT = /^[0-9a-f]{32}$/;

const appLockConfigSchema = z.discriminatedUnion('method', [
  z.object({ version: z.literal(1), method: z.literal('device') }),
  z.object({
    version: z.literal(1),
    method: z.literal('pin'),
    salt: z.string().regex(SALT),
    hash: z.string().regex(HEX_64),
  }),
]);
export type AppLockConfig = z.infer<typeof appLockConfigSchema>;

/** The stored config, or null (no lock) when absent or unreadable. */
export function parseAppLockConfig(json: string | null | undefined): AppLockConfig | null {
  if (!json) return null;
  try {
    const parsed = appLockConfigSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** What is hashed for a PIN: versioned and salted, so equal PINs on two phones never match. */
export function pinDigestInput(salt: string, pin: string): string {
  return `bharatfill.app-lock.v1:${salt}:${pin}`;
}

export type AppPinError = 'incomplete' | 'weak' | 'mismatch';

/** What stops "Set PIN": null when both entries are the same, complete, non-obvious PIN. */
export function appPinFormError(pin: string, confirm: string): AppPinError | null {
  if (pin.length < APP_LOCK_PIN_LENGTH || confirm.length < APP_LOCK_PIN_LENGTH) return 'incomplete';
  if (isWeakVaultPin(pin)) return 'weak';
  if (pin !== confirm) return 'mismatch';
  return null;
}

// ---- Wrong PINs ------------------------------------------------------------------------------

const attemptsSchema = z.object({
  failures: z.number().int().nonnegative().max(10_000),
  /** Epoch ms before which no PIN is checked; null when there is no wait. */
  waitUntil: z.number().int().nonnegative().nullable(),
});
export type PinAttempts = z.infer<typeof attemptsSchema>;

export const NO_ATTEMPTS: PinAttempts = { failures: 0, waitUntil: null };

export function parsePinAttempts(json: string | null | undefined): PinAttempts {
  if (!json) return NO_ATTEMPTS;
  try {
    const parsed = attemptsSchema.safeParse(JSON.parse(json));
    // Unreadable counts are not a free reset: assume one full round was already used.
    return parsed.success ? parsed.data : { failures: FREE_PIN_ATTEMPTS, waitUntil: null };
  } catch {
    return { failures: FREE_PIN_ATTEMPTS, waitUntil: null };
  }
}

/**
 * The wait after `failures` wrong PINs: none for the first five, then 30 s, doubling with every
 * further wrong PIN, up to an hour. Five free tries cover fumbling; a guesser gets about 35
 * tries in the first day and 24 a day after that, out of 10,000 possible PINs.
 */
export function waitAfterFailures(failures: number): number {
  if (failures < FREE_PIN_ATTEMPTS) return 0;
  const doublings = failures - FREE_PIN_ATTEMPTS;
  return Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** Math.min(doublings, 20));
}

export function withFailedPin(attempts: PinAttempts, now: number): PinAttempts {
  const failures = attempts.failures + 1;
  const wait = waitAfterFailures(failures);
  return { failures, waitUntil: wait > 0 ? now + wait : null };
}

/** Milliseconds still to wait before the next PIN is checked (0 when one may be tried now). */
export function remainingWait(attempts: PinAttempts, now: number): number {
  if (attempts.waitUntil === null) return 0;
  // A clock set backwards never makes the wait longer than the longest one.
  return Math.max(0, Math.min(attempts.waitUntil - now, MAX_WAIT_MS));
}

/** "0:30", "4:00", "1:00:00" — how long the lock screen says to wait. */
export function formatWait(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

// ---- When to lock -----------------------------------------------------------------------------

/**
 * Whether coming back to the foreground needs the lock: only after `RELOCK_AFTER_MS` away, so
 * the system's own screens the app opens (Google's scanner, the photo picker, the share sheet,
 * the screen-lock prompt itself) do not lock the citizen out mid-task.
 */
export function shouldRelock(backgroundSince: number | null, now: number): boolean {
  return backgroundSince !== null && now - backgroundSince >= RELOCK_AFTER_MS;
}

/**
 * The way out for a forgotten app PIN. With a phone screen lock the citizen proves it is them
 * with that instead. Without one nothing else can vouch for them, so the only way back in is
 * to remove the app lock together with the documents on this phone (copies in the cloud vault
 * are untouched).
 */
export function forgotPinPath(deviceAuthAvailable: boolean): 'device' | 'reset' {
  return deviceAuthAvailable ? 'device' : 'reset';
}
