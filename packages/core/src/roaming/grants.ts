/**
 * Grant arithmetic: is this session live, and how long is left?
 *
 * Pure and clock-injectable, because three different surfaces have to agree about it — a Postgres
 * policy comparing `expires_at > now()`, a server route deciding whether to unmask a profile, and
 * a countdown ticking in a Chrome side panel. The database is the authority; this module exists
 * so the two UI surfaces reach the same answer without inventing their own rule.
 *
 * Everything here fails *closed*: a malformed timestamp, a missing status or a clock the caller
 * did not pass are all treated as "not active", never as "probably fine".
 */

import {
  MAX_ROAMING_DURATION_MINUTES,
  ROAMING_DURATION_OPTIONS,
  type RoamingDurationMinutes,
  type RoamingGrantStatus,
  TRUSTED_CENTRE_DURATION_MINUTES,
} from './types';

/** The fields of a grant this module needs. Anything wider is the caller's business. */
export type RoamingGrantLike = {
  status: RoamingGrantStatus | string;
  expiresAt: string | null;
  revokedAt?: string | null;
};

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Is this grant usable right now?
 *
 * Note the order: revoked and non-`active` are checked before the clock, so a grant that was
 * ended early never reads as live merely because its original window has not run out.
 */
export function isGrantActive(grant: RoamingGrantLike, now: Date = new Date()): boolean {
  if (grant.status !== 'active') return false;
  if (grant.revokedAt) return false;
  const expiry = timestampMs(grant.expiresAt);
  if (expiry === null) return false;
  return expiry > now.getTime();
}

/** Milliseconds left in the window; `0` once it has run out or the grant is not live. */
export function grantRemainingMs(grant: RoamingGrantLike, now: Date = new Date()): number {
  if (!isGrantActive(grant, now)) return 0;
  const expiry = timestampMs(grant.expiresAt);
  return expiry === null ? 0 : Math.max(0, expiry - now.getTime());
}

/**
 * "01h 48m", or "04m" in the last hour.
 *
 * Deliberately not seconds: a counter conversation does not need them, and a ticking second
 * hand invites an operator to watch the clock instead of the citizen. Rounds *down*, so the
 * banner never promises a minute that has already gone.
 */
export function formatGrantRemaining(remainingMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, remainingMs) / 60_000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  // A trusted centre's window runs for days (migration 0042); "719h 59m" helps nobody.
  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    return `${days}d ${pad(Math.floor((totalMinutes % (24 * 60)) / 60))}h`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${pad(hours)}h ${pad(minutes)}m` : `${pad(minutes)}m`;
}

/** Convenience for a banner: the live label, or null when there is nothing to count down. */
export function grantCountdownLabel(
  grant: RoamingGrantLike | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!grant) return null;
  const remaining = grantRemainingMs(grant, now);
  return remaining > 0 ? formatGrantRemaining(remaining) : null;
}

/**
 * The window a request may actually have.
 *
 * Anything outside the offered options falls back to the default rather than being clamped to
 * the nearest one: a request for 500 minutes is a client that is not speaking this protocol, and
 * quietly handing it the longest window we allow is the wrong way to be forgiving.
 */
export function resolveGrantDuration(minutes: number | null | undefined): RoamingDurationMinutes {
  const offered = ROAMING_DURATION_OPTIONS as readonly number[];
  if (typeof minutes === 'number' && offered.includes(minutes)) {
    return minutes as RoamingDurationMinutes;
  }
  return 120;
}

/**
 * When a grant starting now would end.
 *
 * The `MAX_ROAMING_DURATION_MINUTES` ceiling is applied here as well as by the check constraint
 * in 0024. Two places, on purpose: the constraint is what makes it true of the data, and this is
 * what makes a mistake a shorter session instead of a rejected insert in front of a citizen.
 */
export function grantExpiryFrom(grantedAt: Date, durationMinutes: number): Date {
  const capped = Math.min(Math.max(1, Math.floor(durationMinutes)), MAX_ROAMING_DURATION_MINUTES);
  return new Date(grantedAt.getTime() + capped * 60_000);
}

/**
 * When a trusted-centre grant starting now would end: exactly 30 days, never more. Separate from
 * `grantExpiryFrom` so its 12-hour cap keeps applying to every other kind of grant.
 */
export function trustedGrantExpiryFrom(grantedAt: Date): Date {
  return new Date(grantedAt.getTime() + TRUSTED_CENTRE_DURATION_MINUTES * 60_000);
}

/** True once a code has been superseded, spent or has run out of time or attempts. */
export function isChallengeUsable(
  challenge: { expiresAt: string; consumedAt?: string | null; attemptsLeft: number },
  now: Date = new Date(),
): boolean {
  if (challenge.consumedAt) return false;
  if (challenge.attemptsLeft <= 0) return false;
  const expiry = timestampMs(challenge.expiresAt);
  return expiry !== null && expiry > now.getTime();
}
