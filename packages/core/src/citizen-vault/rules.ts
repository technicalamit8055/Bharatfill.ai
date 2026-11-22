/**
 * Citizen Vault bridge — time windows, rate-limit and restore decisions.
 * docs/VAULT_BRIDGE_DESIGN.md §3.3, §7.
 *
 * Pure and clock-injectable so the API, the citizen app's countdowns and the tests agree. All of
 * it fails closed: a malformed timestamp reads as "not live" / "locked", never "probably fine".
 */

import {
  LOOKUP_LIMITS,
  MAX_VAULT_GRANT_MINUTES,
  RESTORE_HOLD_DAYS,
  RESTORE_INACTIVITY_GUARD_DAYS,
  VAULT_PIN_LOCK_HOURS,
  VAULT_PIN_MAX_FAILURES,
  VAULT_PIN_MAX_TOTAL_FAILURES,
  WRONG_CODE_LIMITS,
  type LookupLimits,
} from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export type VaultGrantLike = { expiresAt: string | null; endedAt?: string | null };

export function vaultGrantExpiry(grantedAt: Date, minutes: number): Date {
  const clamped = Math.min(Math.max(Math.floor(minutes), 1), MAX_VAULT_GRANT_MINUTES);
  return new Date(grantedAt.getTime() + clamped * MINUTE);
}

export function isVaultGrantLive(grant: VaultGrantLike, now: Date = new Date()): boolean {
  if (grant.endedAt) return false;
  const expires = ms(grant.expiresAt);
  return expires !== null && expires > now.getTime();
}

export function vaultGrantMinutesLeft(grant: VaultGrantLike, now: Date = new Date()): number {
  if (!isVaultGrantLive(grant, now)) return 0;
  return Math.ceil(((ms(grant.expiresAt) ?? 0) - now.getTime()) / MINUTE);
}

// ---------------------------------------------------------------------------
// Lookup and code limits
// ---------------------------------------------------------------------------

export type LookupCounts = {
  byOperatorLast15Minutes: number;
  byCentreLastHour: number;
  toNumberLast15Minutes: number;
};

export type LookupDecision =
  | { allowed: false; reason: 'operator_limit' | 'centre_limit' }
  /** `deliver` false: answer the operator exactly as usual, but do not notify the citizen again. */
  | { allowed: true; deliver: boolean };

export function decideLookup(
  counts: LookupCounts,
  limits: LookupLimits = LOOKUP_LIMITS,
): LookupDecision {
  if (counts.byOperatorLast15Minutes >= limits.perOperatorPer15Minutes) {
    return { allowed: false, reason: 'operator_limit' };
  }
  if (counts.byCentreLastHour >= limits.perCentrePerHour) {
    return { allowed: false, reason: 'centre_limit' };
  }
  return {
    allowed: true,
    deliver: counts.toNumberLast15Minutes < limits.perNumberPer15Minutes,
  };
}

export type WrongCodeCounts = { byCentreLastHour: number; forNumberLastDay: number };

export function codeEntryAllowed(counts: WrongCodeCounts): boolean {
  return (
    counts.byCentreLastHour < WRONG_CODE_LIMITS.perCentrePerHour &&
    counts.forNumberLastDay < WRONG_CODE_LIMITS.perNumberPerDay
  );
}

// ---------------------------------------------------------------------------
// Vault PIN
// ---------------------------------------------------------------------------

export type PinState = { failures: number; totalFailures: number; lockedUntil: string | null };

export function isPinLocked(state: PinState, now: Date = new Date()): boolean {
  if (!state.lockedUntil) return false;
  const until = ms(state.lockedUntil);
  // An unreadable lock timestamp is treated as locked.
  return until === null || until > now.getTime();
}

/** Too many wrong PINs over the account's life: only the old phone or the hold can restore. */
export function isPinDisabled(state: PinState): boolean {
  return state.totalFailures >= VAULT_PIN_MAX_TOTAL_FAILURES;
}

/** State after a wrong PIN. The fifth in a row locks for 24 hours and resets the run. */
export function afterPinFailure(state: PinState, now: Date = new Date()): PinState {
  const totalFailures = state.totalFailures + 1;
  const failures = (isPinLocked(state, now) ? 0 : state.failures) + 1;
  if (failures >= VAULT_PIN_MAX_FAILURES) {
    return {
      failures: 0,
      totalFailures,
      lockedUntil: new Date(now.getTime() + VAULT_PIN_LOCK_HOURS * HOUR).toISOString(),
    };
  }
  return { failures, totalFailures, lockedUntil: null };
}

// ---------------------------------------------------------------------------
// Restore by hold (design §3.3, option 3)
// ---------------------------------------------------------------------------

export function restoreHoldUntil(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + RESTORE_HOLD_DAYS * DAY);
}

export type HoldDecision = 'restore' | 'waiting' | 'refused_inactive';

/**
 * `lastActiveAt` is the account's last sign-in *before* the new phone asked. If that is older
 * than the inactivity guard, the number may have been recycled to a stranger: refuse.
 */
export function decideHoldRestore(input: {
  lastActiveAt: string | null;
  requestedAt: string | null;
  holdUntil: string | null;
  now?: Date;
}): HoldDecision {
  const now = (input.now ?? new Date()).getTime();
  const lastActive = ms(input.lastActiveAt);
  const requested = ms(input.requestedAt);
  const until = ms(input.holdUntil);
  if (lastActive === null || requested === null || until === null) return 'refused_inactive';
  if (requested - lastActive > RESTORE_INACTIVITY_GUARD_DAYS * DAY) return 'refused_inactive';
  return until <= now ? 'restore' : 'waiting';
}
