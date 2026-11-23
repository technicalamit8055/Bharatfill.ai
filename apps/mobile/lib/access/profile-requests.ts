/**
 * Centre requests to use the citizen's saved profile (migration 0039): the rules the approval
 * sheet follows, kept free of React Native so they are tested in Node.
 *
 * The citizen — not the operator — chooses how long a centre may use their details: 1, 2 or 4
 * hours, 2 by default (the length of a counter queue plus a form), or 30 days to trust a centre
 * they visit often (migration 0042).
 */

import { TRUSTED_CENTRE_DURATION_MINUTES } from '@assistigo/core';

import type { ProfileAccessMinutes, ProfileRequest } from '../cloud/citizen-api';

/** 30 days: a trusted centre. */
export const TRUSTED_ACCESS_MINUTES = TRUSTED_CENTRE_DURATION_MINUTES;

export const PROFILE_ACCESS_OPTIONS: readonly ProfileAccessMinutes[] = [
  60,
  120,
  240,
  TRUSTED_ACCESS_MINUTES,
];
export const DEFAULT_PROFILE_ACCESS_MINUTES: ProfileAccessMinutes = 120;

/** How often the open app asks for new requests. */
export const PROFILE_REQUEST_POLL_MS = 6_000;

/**
 * The request to show: the newest one still open that the citizen has not already answered on
 * this phone. Expired requests are skipped even before the next poll removes them.
 */
export function nextProfileRequest<
  T extends Pick<ProfileRequest, 'id' | 'expiresAt' | 'createdAt'>,
>(requests: readonly T[], answered: ReadonlySet<string>, now: Date): T | null {
  const open = requests
    .filter((request) => !answered.has(request.id))
    .filter((request) => Date.parse(request.expiresAt) > now.getTime())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return open[0] ?? null;
}

/** Whole minutes left on a request, at least 1 while it is open; 0 once it has run out. */
export function requestMinutesLeft(expiresAt: string, now: Date): number {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60_000));
}

/** Translation key for a duration choice ("2 hours"). */
export function durationKey(minutes: ProfileAccessMinutes): string {
  return `profileRequest.durations.m${minutes}`;
}
