import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONSOLE_SESSION_TTL_SECONDS,
  deriveConsoleKey,
  mintConsoleSession,
  readCookie,
  safeConsoleNext,
  verifyConsoleSession,
} from './console-session';

const key = deriveConsoleKey('test-service-role-key');
const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-28T10:00:00Z');

describe('console session tokens', () => {
  it('round-trips a token for the same user and portal', () => {
    const { token, payload } = mintConsoleSession(key, { userId, portal: 'super_admin', now });
    const check = verifyConsoleSession(key, token, { userId, portal: 'super_admin', now });
    expect(check).toEqual({ valid: true, payload });
    expect(payload.exp - payload.iat).toBe(CONSOLE_SESSION_TTL_SECONDS);
  });

  it('reports a missing token as missing', () => {
    expect(verifyConsoleSession(key, undefined, { userId, portal: 'team', now })).toEqual({
      valid: false,
      reason: 'missing',
    });
    expect(verifyConsoleSession(key, '', { userId, portal: 'team', now }).valid).toBe(false);
  });

  /** Bound to one account: another user's Supabase session cannot borrow it. */
  it('refuses a token minted for a different user', () => {
    const { token } = mintConsoleSession(key, { userId, portal: 'team', now });
    expect(
      verifyConsoleSession(key, token, {
        userId: '22222222-2222-4222-8222-222222222222',
        portal: 'team',
        now,
      }),
    ).toEqual({ valid: false, reason: 'user_mismatch' });
  });

  /**
   * Bound to one portal: a session from the team page never satisfies a check for the Super Admin
   * portal — which is also what happens when the holder's role changes after sign-in.
   */
  it('refuses a token minted at the other portal', () => {
    const { token } = mintConsoleSession(key, { userId, portal: 'team', now });
    expect(verifyConsoleSession(key, token, { userId, portal: 'super_admin', now })).toEqual({
      valid: false,
      reason: 'portal_mismatch',
    });
  });

  it('expires after its lifetime', () => {
    const { token } = mintConsoleSession(key, { userId, portal: 'team', now });
    const later = new Date(now.getTime() + CONSOLE_SESSION_TTL_SECONDS * 1000);
    expect(verifyConsoleSession(key, token, { userId, portal: 'team', now: later })).toEqual({
      valid: false,
      reason: 'expired',
    });
    const justBefore = new Date(later.getTime() - 1000);
    expect(
      verifyConsoleSession(key, token, { userId, portal: 'team', now: justBefore }).valid,
    ).toBe(true);
  });

  it('refuses a token issued in the future beyond clock skew', () => {
    const future = new Date(now.getTime() + 10 * 60 * 1000);
    const { token } = mintConsoleSession(key, { userId, portal: 'team', now: future });
    expect(verifyConsoleSession(key, token, { userId, portal: 'team', now })).toEqual({
      valid: false,
      reason: 'not_yet_valid',
    });
  });

  it('refuses a token signed with another key', () => {
    const { token } = mintConsoleSession(deriveConsoleKey('some-other-deployment'), {
      userId,
      portal: 'super_admin',
      now,
    });
    expect(verifyConsoleSession(key, token, { userId, portal: 'super_admin', now })).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  /**
   * The attack the signature exists for: keep a valid team token's signature, rewrite the payload
   * to claim the Super Admin portal and a later expiry.
   */
  it('refuses a payload edited after signing', () => {
    const { token } = mintConsoleSession(key, { userId, portal: 'team', now });
    const [version, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: userId, p: 'super_admin', iat: 0, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(
      verifyConsoleSession(key, `${version}.${forged}.${signature}`, {
        userId,
        portal: 'super_admin',
        now,
      }),
    ).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('refuses malformed tokens without throwing', () => {
    for (const token of ['nonsense', 'v1.abc', 'v2.abc.def', 'v1..sig', '...', 'v1.abc.']) {
      const check = verifyConsoleSession(key, token, { userId, portal: 'team', now });
      expect(check.valid).toBe(false);
    }
  });

  it('refuses a correctly signed payload with an unknown portal', () => {
    // Sign an arbitrary body the same way the module does, to prove the payload is still checked
    // after the signature passes.
    const body = `v1.${Buffer.from(JSON.stringify({ u: userId, p: 'root', iat: 1, exp: 2 })).toString('base64url')}`;
    const signature = createHmac('sha256', key).update(body).digest('base64url');
    expect(
      verifyConsoleSession(key, `${body}.${signature}`, { userId, portal: 'team', now }),
    ).toEqual({ valid: false, reason: 'malformed' });
  });

  it('needs a secret to derive a key from', () => {
    expect(() => deriveConsoleKey('')).toThrow();
  });
});

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    expect(readCookie('a=1; bf_console=v1.x.y; b=2', 'bf_console')).toBe('v1.x.y');
  });

  it('does not match a cookie whose name merely contains the one asked for', () => {
    expect(readCookie('xbf_console=nope', 'bf_console')).toBeNull();
  });

  it('returns null for an absent header or cookie', () => {
    expect(readCookie(null, 'bf_console')).toBeNull();
    expect(readCookie('a=1', 'bf_console')).toBeNull();
  });
});

describe('safeConsoleNext', () => {
  it('keeps paths inside the console', () => {
    expect(safeConsoleNext('/admin')).toBe('/admin');
    expect(safeConsoleNext('/admin/tenants?q=a')).toBe('/admin/tenants?q=a');
    expect(safeConsoleNext('/admin?tab=1')).toBe('/admin?tab=1');
  });

  it('drops anything outside the console', () => {
    for (const value of [
      '/dashboard',
      'https://evil.example/admin',
      '//evil.example/admin',
      '/administrator',
      '/admin\\..\\dashboard',
      '/admin/login',
      undefined,
      42,
    ]) {
      expect(safeConsoleNext(value)).toBe('/admin');
    }
  });
});
