/**
 * Phone OTP sign-in against Supabase Auth (GoTrue), without the supabase-js client.
 * docs/VAULT_BRIDGE_DESIGN.md §2, §3.1.
 *
 * Three calls is all the citizen app needs — send a code, verify it, refresh the session — so
 * this is plain `fetch` with Zod-checked responses rather than a client library and the URL
 * polyfill it needs on React Native. Pure apart from the injected `fetch`, so it is tested in
 * Node.
 *
 * Nothing here logs. The phone number and the code go to Supabase over TLS and nowhere else.
 */

import { z } from 'zod';

import type { CloudConfig } from './config';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CloudSession = {
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch seconds. */
  readonly expiresAt: number;
};

export type AuthFailure =
  /** Too many codes or attempts; Supabase's own limits. */
  | 'rate_limited'
  /** Wrong or expired code. */
  | 'invalid_code'
  /** The number or request was refused (e.g. SMS not set up for this project). */
  | 'rejected'
  /** Refresh token no longer valid: sign in again. */
  | 'signed_out'
  | 'unavailable'
  | 'network';

export type AuthResult<T> = { ok: true; value: T } | { ok: false; reason: AuthFailure };

const sessionResponse = z.object({
  access_token: z.string().min(20),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  expires_at: z.number().int().positive().optional(),
  user: z.object({ id: z.string().uuid() }),
});

function headers(config: CloudConfig): Record<string, string> {
  return {
    apikey: config.supabaseAnonKey,
    'content-type': 'application/json',
  };
}

async function post(
  fetchImpl: FetchLike,
  url: string,
  config: CloudConfig,
  body: unknown,
): Promise<Response | null> {
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

function failureFor(status: number, fallback: AuthFailure): AuthFailure {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return fallback;
}

async function toSession(response: Response, now: () => number): Promise<CloudSession | null> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return null;
  }
  const parsed = sessionResponse.safeParse(json);
  if (!parsed.success) return null;
  const { access_token, refresh_token, expires_in, expires_at, user } = parsed.data;
  return {
    userId: user.id,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expires_at ?? Math.floor(now() / 1000) + expires_in,
  };
}

/** Sends a sign-in code to `+91XXXXXXXXXX`. Creates the account on first use. */
export async function requestPhoneOtp(
  config: CloudConfig,
  e164: string,
  fetchImpl: FetchLike = fetch,
): Promise<AuthResult<null>> {
  const response = await post(fetchImpl, `${config.supabaseUrl}/auth/v1/otp`, config, {
    phone: e164,
    create_user: true,
  });
  if (!response) return { ok: false, reason: 'network' };
  if (response.ok) return { ok: true, value: null };
  return { ok: false, reason: failureFor(response.status, 'rejected') };
}

export async function verifyPhoneOtp(
  config: CloudConfig,
  e164: string,
  code: string,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): Promise<AuthResult<CloudSession>> {
  const response = await post(fetchImpl, `${config.supabaseUrl}/auth/v1/verify`, config, {
    type: 'sms',
    phone: e164,
    token: code,
  });
  if (!response) return { ok: false, reason: 'network' };
  if (!response.ok) return { ok: false, reason: failureFor(response.status, 'invalid_code') };
  const session = await toSession(response, now);
  return session ? { ok: true, value: session } : { ok: false, reason: 'unavailable' };
}

export async function refreshCloudSession(
  config: CloudConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): Promise<AuthResult<CloudSession>> {
  const response = await post(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    config,
    { refresh_token: refreshToken },
  );
  if (!response) return { ok: false, reason: 'network' };
  if (!response.ok) return { ok: false, reason: failureFor(response.status, 'signed_out') };
  const session = await toSession(response, now);
  return session ? { ok: true, value: session } : { ok: false, reason: 'unavailable' };
}

/**
 * Revokes this session's refresh token on the server (`scope=local`: this phone only, so the
 * citizen's other phone stays signed in). Best effort — the caller forgets the session on the
 * phone whatever this returns, and an expired access token simply means nothing to revoke.
 */
export async function revokeCloudSession(
  config: CloudConfig,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { ...headers(config), authorization: `Bearer ${accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The 10 national digits of the number this session signed in with, read from the access
 * token's `phone` claim (GoTrue writes it as `91XXXXXXXXXX`). For display on Profile only: the
 * token is not verified here — the server does that on every call — so nothing trusts this.
 */
export function phoneFromAccessToken(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  let claims: unknown;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
  } catch {
    return null;
  }
  const phone = z.object({ phone: z.string() }).safeParse(claims);
  if (!phone.success) return null;
  const digits = phone.data.phone.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? national : null;
}

/** True when the access token has under a minute left (or the clock says it is gone). */
export function needsRefresh(session: CloudSession, nowMs: number): boolean {
  return session.expiresAt * 1000 - nowMs < 60_000;
}

/** Translation key for an auth failure, under `cloud.errors`. */
export function authFailureMessageKey(reason: AuthFailure): string {
  return `cloud.errors.${reason}`;
}
