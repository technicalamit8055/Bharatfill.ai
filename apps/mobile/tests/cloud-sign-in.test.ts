/**
 * Cloud sign-in plumbing (docs/VAULT_BRIDGE_DESIGN.md §3): config parsing, the Supabase phone
 * OTP client, the citizen API client and the flow decisions. Network calls are faked; numbers
 * use the 99000 test range. No real citizen data.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  needsRefresh,
  refreshCloudSession,
  requestPhoneOtp,
  verifyPhoneOtp,
} from '../lib/cloud/auth-client';
import { createCitizenApi } from '../lib/cloud/citizen-api';
import { parseCloudConfig, type CloudConfig } from '../lib/cloud/config';
import {
  nextStepAfterSignIn,
  normalisePinInput,
  serverMessageKey,
  vaultPinFormError,
} from '../lib/cloud/sign-in-flow';
import { toSignupProfile } from '../lib/profile/profile';

const CONFIG: CloudConfig = {
  supabaseUrl: 'https://demo.supabase.test',
  supabaseAnonKey: 'anon-demo-key',
  apiUrl: 'https://app.bharatfill.test',
};
const USER = '11111111-1111-4111-8111-111111111111';
const PHONE = '+919900012345';
const NOW = 1_800_000_000_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SESSION_BODY = {
  access_token: 'a'.repeat(40),
  refresh_token: 'r-1',
  expires_in: 3600,
  user: { id: USER },
};

describe('parseCloudConfig', () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://demo.supabase.test/',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon-demo-key ',
    EXPO_PUBLIC_BHARATFILL_API_URL: 'https://app.bharatfill.test/some/path',
  };

  it('reduces each URL to its origin', () => {
    expect(parseCloudConfig(env, false)).toEqual(CONFIG);
  });

  it('is offline unless all three values are set', () => {
    expect(parseCloudConfig({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }, false)).toBeNull();
    expect(
      parseCloudConfig({ ...env, EXPO_PUBLIC_BHARATFILL_API_URL: undefined }, false),
    ).toBeNull();
  });

  it('refuses plain http except to a LAN dev server in development', () => {
    const lan = { ...env, EXPO_PUBLIC_BHARATFILL_API_URL: 'http://192.168.1.20:3000' };
    expect(parseCloudConfig(lan, false)).toBeNull();
    expect(parseCloudConfig(lan, true)?.apiUrl).toBe('http://192.168.1.20:3000');
    const remote = { ...env, EXPO_PUBLIC_BHARATFILL_API_URL: 'http://evil.example.com' };
    expect(parseCloudConfig(remote, true)).toBeNull();
  });

  it('refuses credentials in a URL', () => {
    expect(
      parseCloudConfig(
        { ...env, EXPO_PUBLIC_SUPABASE_URL: 'https://u:p@demo.supabase.test' },
        false,
      ),
    ).toBeNull();
  });
});

describe('Supabase phone OTP', () => {
  it('asks for a code with the anon key and the number', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    expect(await requestPhoneOtp(CONFIG, PHONE, fetchImpl)).toEqual({ ok: true, value: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.test/auth/v1/otp');
    expect((init.headers as Record<string, string>).apikey).toBe('anon-demo-key');
    expect(JSON.parse(String(init.body))).toEqual({ phone: PHONE, create_user: true });
  });

  it('maps failures to reasons the citizen can act on', async () => {
    expect(await requestPhoneOtp(CONFIG, PHONE, async () => json(429, {}))).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(await requestPhoneOtp(CONFIG, PHONE, async () => json(400, {}))).toEqual({
      ok: false,
      reason: 'rejected',
    });
    expect(
      await requestPhoneOtp(CONFIG, PHONE, async () => {
        throw new Error('offline');
      }),
    ).toEqual({ ok: false, reason: 'network' });
  });

  it('turns a verified code into a session', async () => {
    const result = await verifyPhoneOtp(
      CONFIG,
      PHONE,
      '123456',
      async () => json(200, SESSION_BODY),
      () => NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        userId: USER,
        accessToken: SESSION_BODY.access_token,
        refreshToken: 'r-1',
        expiresAt: NOW / 1000 + 3600,
      },
    });
  });

  it('calls a refused code an invalid code, and a malformed reply unavailable', async () => {
    expect(await verifyPhoneOtp(CONFIG, PHONE, '000000', async () => json(403, {}))).toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect(
      await verifyPhoneOtp(CONFIG, PHONE, '123456', async () => json(200, { nope: 1 })),
    ).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('treats a refused refresh as signed out', async () => {
    expect(await refreshCloudSession(CONFIG, 'r-1', async () => json(400, {}))).toEqual({
      ok: false,
      reason: 'signed_out',
    });
  });

  it('refreshes a minute before expiry', () => {
    const session = {
      userId: USER,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: NOW / 1000 + 120,
    };
    expect(needsRefresh(session, NOW)).toBe(false);
    expect(needsRefresh(session, NOW + 61_000)).toBe(true);
  });
});

describe('citizen API client', () => {
  const ACCOUNT = {
    id: USER,
    displayName: 'Demo Citizen',
    preferredLocale: 'hi',
    cloudEnabled: true,
    createdAt: '2026-11-17T10:00:00.000Z',
  };

  it('sends the bearer token and reads { data }', async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: { account: ACCOUNT } }));
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'token-1',
      refresh: async () => null,
      fetch: fetchImpl,
    });
    expect(await api.getAccount()).toEqual({ ok: true, value: ACCOUNT });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.bharatfill.test/api/citizen/account');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('reads a not-yet-finished sign-up as a null account', async () => {
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 't',
      refresh: async () => null,
      fetch: async () => json(200, { data: { account: null } }),
    });
    expect(await api.getAccount()).toEqual({ ok: true, value: null });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).authorization ?? '';
      seen.push(auth);
      return auth === 'Bearer fresh' ? json(200, { data: { account: ACCOUNT } }) : json(401, {});
    });
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'stale',
      refresh: async () => 'fresh',
      fetch: fetchImpl,
    });
    expect((await api.getAccount()).ok).toBe(true);
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('reports signed out when the refresh fails', async () => {
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'stale',
      refresh: async () => null,
      fetch: async () => json(401, {}),
    });
    const result = await api.getAccount();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SIGNED_OUT');
  });

  it('passes the server error key and details through', async () => {
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 't',
      refresh: async () => null,
      fetch: async () =>
        json(403, {
          error: {
            code: 'PERMISSION_DENIED',
            messageKey: 'errors.vault.pin_wrong',
            traceId: 'tr-1',
            details: { attemptsBeforeLock: 3 },
          },
        }),
    });
    const result = await api.restoreWithPin('4826', { platform: 'android' });
    expect(result).toEqual({
      ok: false,
      error: {
        status: 403,
        code: 'PERMISSION_DENIED',
        messageKey: 'errors.vault.pin_wrong',
        details: { attemptsBeforeLock: 3 },
      },
    });
  });

  it('refuses an unlock reply whose key is not 32 bytes of base64', async () => {
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 't',
      refresh: async () => null,
      fetch: async () =>
        json(200, {
          data: { account: ACCOUNT, documentKey: 'short', deviceId: USER },
        }),
    });
    const result = await api.restoreWithPin('4826', { platform: 'android' });
    expect(result.ok).toBe(false);
  });
});

describe('sign-in flow decisions', () => {
  it('routes by account and key', () => {
    expect(nextStepAfterSignIn(false, false)).toBe('profile');
    expect(nextStepAfterSignIn(true, true)).toBe('done');
    expect(nextStepAfterSignIn(true, false)).toBe('restore');
  });

  it('explains what is wrong with a PIN entry', () => {
    expect(vaultPinFormError('48', '48')).toBe('incomplete');
    expect(vaultPinFormError('1234', '1234')).toBe('weak');
    expect(vaultPinFormError('4826', '4862')).toBe('mismatch');
    expect(vaultPinFormError('4826', '4826')).toBeNull();
  });

  it('keeps only four digits of a PIN', () => {
    expect(normalisePinInput('48-26 9')).toBe('4826');
  });

  it('never shows a raw key for an unknown server message', () => {
    const known = (key: string) => key === 'errors.vault.pin_wrong';
    expect(serverMessageKey('errors.vault.pin_wrong', known)).toBe('errors.vault.pin_wrong');
    expect(serverMessageKey('errors.something_new', known)).toBe('cloud.errors.unavailable');
  });
});

describe('sign-up profile (name and language only)', () => {
  it('normalises the name', () => {
    expect(toSignupProfile('  Sample   Citizen ', 'hi')).toEqual({
      ok: true,
      profile: { fullName: 'Sample Citizen', language: 'hi' },
    });
  });

  it('reports the name error', () => {
    expect(toSignupProfile('', 'en')).toEqual({ ok: false, error: 'missing' });
  });
});
