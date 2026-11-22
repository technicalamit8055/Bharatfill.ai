/**
 * Centres asking for the citizen's vault (design §4.2): the API calls the request sheet and the
 * Share with centre screen make, how the counter code is shown, and that every string they
 * render exists in both catalogues. Made-up ids only.
 */

import { CITIZEN_DEVICE_HEADER } from '@assistigo/core';
import { describe, expect, it, vi } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { nextProfileRequest } from '../lib/access/profile-requests';
import { formatCountdown, formatShareCode, shareCodeSecondsLeft } from '../lib/access/share-code';
import { createCitizenApi, type VaultRequest } from '../lib/cloud/citizen-api';

const NOW = new Date('2026-11-22T10:00:00.000Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
const A = '00000000-0000-4000-8000-00000000000a';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';

const GRANT = {
  id: '00000000-0000-4000-8000-0000000000b1',
  centreName: 'Demo Seva Kendra',
  method: 'approval',
  allowCopy: false,
  grantedAt: minutesFromNow(0),
  expiresAt: minutesFromNow(120),
  endedAt: null,
  endedBy: null,
  live: true,
  minutesLeft: 120,
};

function api(response: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(response), { status }),
  );
  const client = createCitizenApi({
    apiUrl: 'https://api.example.test',
    accessToken: async () => 'token',
    refresh: async () => null,
    fetch,
  });
  return { client, fetch };
}

describe('vault requests', () => {
  it('picks the newest open request, as for profile requests', () => {
    const older: VaultRequest = {
      id: A,
      centreName: 'Demo Seva Kendra',
      createdAt: minutesFromNow(-3),
      expiresAt: minutesFromNow(7),
    };
    const ran_out = {
      ...older,
      id: GRANT.id,
      createdAt: minutesFromNow(-1),
      expiresAt: minutesFromNow(-1),
    };
    expect(nextProfileRequest([older, ran_out], new Set(), NOW)?.id).toBe(A);
    expect(nextProfileRequest([older], new Set([A]), NOW)).toBeNull();
  });
});

describe('citizen API', () => {
  it('reads pending requests and grants from the access overview', async () => {
    const { client, fetch } = api({
      data: {
        requests: [
          {
            id: A,
            centreName: 'Demo Seva Kendra',
            expiresAt: minutesFromNow(9),
            createdAt: minutesFromNow(-1),
          },
        ],
        grants: [GRANT],
        events: [],
      },
    });
    const result = await client.getVaultAccess();
    expect(result).toMatchObject({
      ok: true,
      value: { requests: [{ id: A }], grants: [{ live: true }] },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.test/api/citizen/access');
  });

  it('approves with the citizen’s choice and this phone’s device id', async () => {
    const { client, fetch } = api({ data: { grant: GRANT } });
    const result = await client.approveVaultRequest(A, DEVICE, {
      durationMinutes: 30,
      allowCopy: false,
    });
    expect(result).toMatchObject({ ok: true, value: { centreName: 'Demo Seva Kendra' } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.example.test/api/citizen/requests/${A}/approve`);
    expect(JSON.parse(String(init.body))).toEqual({ durationMinutes: 30, allowCopy: false });
    expect((init.headers as Record<string, string>)[CITIZEN_DEVICE_HEADER]).toBe(DEVICE);
  });

  it('denies and stops', async () => {
    const { client, fetch } = api(null, 204);
    expect((await client.denyVaultRequest(A)).ok).toBe(true);
    expect((await client.revokeVaultGrant(GRANT.id)).ok).toBe(true);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `https://api.example.test/api/citizen/requests/${A}/deny`,
      `https://api.example.test/api/citizen/grants/${GRANT.id}/revoke`,
    ]);
  });

  it('issues a counter code for this phone, and refuses anything but 6 digits back', async () => {
    const { client, fetch } = api({ data: { code: '849201', expiresAt: minutesFromNow(5) } });
    const result = await client.issueShareCode(DEVICE, { durationMinutes: 120, allowCopy: true });
    expect(result).toMatchObject({ ok: true, value: { code: '849201' } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/citizen/share-code');
    expect((init.headers as Record<string, string>)[CITIZEN_DEVICE_HEADER]).toBe(DEVICE);

    const bad = api({ data: { code: '84920', expiresAt: minutesFromNow(5) } });
    expect(
      (await bad.client.issueShareCode(DEVICE, { durationMinutes: 120, allowCopy: false })).ok,
    ).toBe(false);
  });
});

describe('counter code', () => {
  it('reads in two halves', () => {
    expect(formatShareCode('849201')).toBe('849 201');
  });

  it('counts down to 0 and never below', () => {
    expect(shareCodeSecondsLeft(minutesFromNow(5), NOW)).toBe(300);
    expect(shareCodeSecondsLeft(minutesFromNow(-1), NOW)).toBe(0);
    expect(formatCountdown(272)).toBe('4:32');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('copy', () => {
  const KEYS = [
    ...[
      'title',
      'body',
      'durationLabel',
      'duration.30',
      'duration.120',
      'copyTitle',
      'copyBody',
      'warning',
      'approve',
      'deny',
      'approvedTitle',
      'approvedBody',
      'deniedTitle',
      'deniedBody',
      'stop',
      'stoppedTitle',
      'stoppedBody',
    ].map((k) => `vaultRequest.${k}`),
    ...[
      'title',
      'subtitle',
      'show',
      'newCode',
      'codeLabel',
      'expiresIn',
      'expired',
      'warning',
      'openNow',
      'minutesLeft',
      'signInFirst',
    ].map((k) => `shareCode.${k}`),
    'errors.vault.device_unknown',
    'errors.vault.request_missing',
  ];

  const lookup = (catalogue: unknown, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        catalogue,
      );

  it.each(KEYS)('%s exists in English and Hindi with the same placeholders', (key) => {
    const english = lookup(en, key);
    const hindi = lookup(hi, key);
    expect(typeof english).toBe('string');
    expect(typeof hindi).toBe('string');
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    expect(placeholders(hindi as string)).toEqual(placeholders(english as string));
  });

  it('never names a document on the request sheet or the code screen', () => {
    const text = JSON.stringify([en.vaultRequest, en.shareCode]).toLowerCase();
    for (const word of ['aadhaar', 'caste', 'income', 'marksheet']) {
      expect(text).not.toContain(word);
    }
  });
});
