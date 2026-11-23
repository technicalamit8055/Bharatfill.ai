/**
 * Centre access screen (migration 0042): which centres can use the citizen's saved details now,
 * which ones they trust for 30 days, and what ended recently. The rules the screen follows, kept
 * free of React Native so they are tested in Node.
 *
 * Shows the centre's name, the purpose and the times — never the operator, a document or the
 * customer record a centre keeps.
 */

import { MAX_TRUSTED_CENTRES } from '@assistigo/core';

import type { CentreAccess } from '../cloud/citizen-api';

export { MAX_TRUSTED_CENTRES };

/** A trusted centre is offered "Renew" once it has this little time left. */
export const RENEW_WINDOW_DAYS = 7;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type CentreAccessGroups = {
  readonly live: readonly CentreAccess[];
  readonly ended: readonly CentreAccess[];
};

/** A session counts as live only while the clock agrees, even before the next refresh. */
export function isLive(session: Pick<CentreAccess, 'state' | 'expiresAt'>, now: Date): boolean {
  return session.state === 'live' && Date.parse(session.expiresAt) > now.getTime();
}

/** Live first (trusted, then soonest to end), the rest newest first. */
export function groupCentreAccess(
  sessions: readonly CentreAccess[],
  now: Date,
): CentreAccessGroups {
  const live = sessions
    .filter((session) => isLive(session, now))
    .sort((a, b) =>
      a.trusted !== b.trusted
        ? a.trusted
          ? -1
          : 1
        : Date.parse(a.expiresAt) - Date.parse(b.expiresAt),
    );
  const ended = sessions
    .filter((session) => !isLive(session, now))
    .sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt));
  return { live, ended };
}

/** How many trusted centres are live, for the "2 of 3" line and the Trust button. */
export function liveTrustedCount(sessions: readonly CentreAccess[], now: Date): number {
  return sessions.filter((session) => session.trusted && isLive(session, now)).length;
}

export type TimeLeft =
  | { readonly unit: 'days'; readonly value: number }
  | { readonly unit: 'hours'; readonly hours: number; readonly minutes: number }
  | { readonly unit: 'minutes'; readonly value: number }
  | { readonly unit: 'none' };

/** Rounded down, so the screen never promises time that has gone; at least 1 minute while live. */
export function timeLeft(expiresAt: string, now: Date): TimeLeft {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return { unit: 'none' };
  if (ms >= DAY) return { unit: 'days', value: Math.floor(ms / DAY) };
  if (ms >= HOUR) {
    return {
      unit: 'hours',
      hours: Math.floor(ms / HOUR),
      minutes: Math.floor((ms % HOUR) / MINUTE),
    };
  }
  return { unit: 'minutes', value: Math.max(1, Math.floor(ms / MINUTE)) };
}

/** Translation key and values for a `timeLeft` result. */
export function timeLeftCopy(left: TimeLeft): {
  readonly key: string;
  readonly values: Record<string, number>;
} {
  switch (left.unit) {
    case 'days':
      return { key: 'centreAccess.left.days', values: { days: left.value } };
    case 'hours':
      return {
        key: 'centreAccess.left.hours',
        values: { hours: left.hours, minutes: left.minutes },
      };
    case 'minutes':
      return { key: 'centreAccess.left.minutes', values: { minutes: left.value } };
    case 'none':
      return { key: 'centreAccess.left.none', values: {} };
  }
}

export type TrustAction = 'trust' | 'renew' | null;

/**
 * What the trust button on a live session does: make a short session a trusted centre (when a
 * slot is free), renew a trusted one in its last week, or nothing.
 */
export function trustActionFor(session: CentreAccess, trustedLive: number, now: Date): TrustAction {
  if (!isLive(session, now)) return null;
  if (session.trusted) {
    return Date.parse(session.expiresAt) - now.getTime() <= RENEW_WINDOW_DAYS * DAY
      ? 'renew'
      : null;
  }
  return trustedLive < MAX_TRUSTED_CENTRES ? 'trust' : null;
}

/** Translation key for how an ended session ended. */
export function endedKey(session: Pick<CentreAccess, 'state'>): string {
  switch (session.state) {
    case 'ended_by_you':
      return 'centreAccess.endedByYou';
    case 'ended_by_centre':
      return 'centreAccess.endedByCentre';
    default:
      return 'centreAccess.expired';
  }
}
