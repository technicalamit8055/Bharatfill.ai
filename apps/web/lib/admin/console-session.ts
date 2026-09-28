/**
 * The console session: proof that this browser signed in through a console portal.
 *
 * A Supabase session says who somebody is. It does not say they came in through the console's
 * front door — an employee who is also a centre operator is signed in to the dashboard all day,
 * and without this the same cookie would open /admin too. The console instead requires a second,
 * short-lived token minted only by a successful sign-in at /admin/login or /staff/login:
 *
 *   - bound to one user id, so it is worthless beside anybody else's Supabase session;
 *   - bound to one portal, so a Super Admin session is never the product of the team page;
 *   - absolute 12-hour lifetime, so console access lapses on its own even while the Supabase
 *     refresh token lives on (the "sudo mode" pattern — re-prove it to keep holding it).
 *
 * HMAC-SHA256 over a small JSON payload. The key is derived from the service-role key with a
 * fixed label, so there is no new secret to provision and the derived key is useless for anything
 * else. Anybody holding the service-role key can already bypass the console entirely.
 *
 * Pure apart from `node:crypto`: this is part of the gate, so it is tested exhaustively.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isConsolePortal, type ConsolePortal } from '@assistigo/core';

export const CONSOLE_SESSION_COOKIE = 'bf_console';
export const CONSOLE_SESSION_TTL_SECONDS = 12 * 60 * 60;

const VERSION = 'v1';
const KEY_LABEL = 'assistigo.console-session.v1';
/** Tolerated clock drift between the server that minted a token and the one reading it. */
const MAX_FUTURE_SKEW_SECONDS = 60;

export type ConsoleSessionPayload = {
  /** auth.users id. */
  u: string;
  p: ConsolePortal;
  /** Issued at, unix seconds. */
  iat: number;
  /** Expires at, unix seconds. */
  exp: number;
};

export type ConsoleSessionCheck =
  | { valid: true; payload: ConsoleSessionPayload }
  | {
      valid: false;
      reason:
        | 'missing'
        | 'malformed'
        | 'bad_signature'
        | 'expired'
        | 'not_yet_valid'
        | 'user_mismatch'
        | 'portal_mismatch';
    };

export function deriveConsoleKey(serviceRoleKey: string): Buffer {
  if (!serviceRoleKey) throw new Error('A signing secret is required for console sessions.');
  return createHmac('sha256', serviceRoleKey).update(KEY_LABEL).digest();
}

function sign(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

export function mintConsoleSession(
  key: Buffer,
  input: { userId: string; portal: ConsolePortal; now?: Date; ttlSeconds?: number },
): { token: string; payload: ConsoleSessionPayload } {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload: ConsoleSessionPayload = {
    u: input.userId,
    p: input.portal,
    iat,
    exp: iat + (input.ttlSeconds ?? CONSOLE_SESSION_TTL_SECONDS),
  };
  const body = `${VERSION}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return { token: `${body}.${sign(key, body)}`, payload };
}

function parsePayload(encoded: string): ConsoleSessionPayload | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const { u, p, iat, exp } = value as Record<string, unknown>;
    if (typeof u !== 'string' || u.length === 0) return null;
    if (!isConsolePortal(p)) return null;
    if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
    return { u, p, iat: iat as number, exp: exp as number };
  } catch {
    return null;
  }
}

/**
 * Checks a token against the caller it is being presented by.
 *
 * The signature is compared before the payload is trusted for anything, in constant time.
 * `expected.portal` is the portal the caller's *current* role belongs to, so a role change since
 * sign-in (a Super Admin demoted to Content Manager, say) invalidates the session by itself.
 */
export function verifyConsoleSession(
  key: Buffer,
  token: string | null | undefined,
  expected: { userId: string; portal: ConsolePortal; now?: Date },
): ConsoleSessionCheck {
  if (!token) return { valid: false, reason: 'missing' };

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION || !parts[1] || !parts[2]) {
    return { valid: false, reason: 'malformed' };
  }

  const body = `${parts[0]}.${parts[1]}`;
  const expectedSignature = Buffer.from(sign(key, body));
  const presented = Buffer.from(parts[2]);
  if (
    presented.length !== expectedSignature.length ||
    !timingSafeEqual(presented, expectedSignature)
  ) {
    return { valid: false, reason: 'bad_signature' };
  }

  const payload = parsePayload(parts[1]);
  if (!payload) return { valid: false, reason: 'malformed' };

  const now = Math.floor((expected.now ?? new Date()).getTime() / 1000);
  if (payload.iat > now + MAX_FUTURE_SKEW_SECONDS) return { valid: false, reason: 'not_yet_valid' };
  if (payload.exp <= now) return { valid: false, reason: 'expired' };
  if (payload.u !== expected.userId) return { valid: false, reason: 'user_mismatch' };
  if (payload.p !== expected.portal) return { valid: false, reason: 'portal_mismatch' };

  return { valid: true, payload };
}

/** Reads one cookie out of a raw `Cookie` header, for route handlers that only have a Request. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}

/**
 * Where a console sign-in may send somebody afterwards: a path inside the console, else its home.
 * Anything else — another part of the site, another origin, a protocol-relative URL — is dropped,
 * so the sign-in page cannot be turned into an open redirect or a detour out of the console.
 */
export function safeConsoleNext(value: unknown): string {
  if (typeof value !== 'string') return '/admin';
  if (!value.startsWith('/admin') || value.startsWith('//') || value.includes('\\'))
    return '/admin';
  if (value.startsWith('/admin/login')) return '/admin';
  const rest = value.slice('/admin'.length);
  if (rest !== '' && !rest.startsWith('/') && !rest.startsWith('?')) return '/admin';
  return value;
}
