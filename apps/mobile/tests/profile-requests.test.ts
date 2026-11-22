/**
 * Centre requests to use the citizen's saved profile (migration 0039): which request the sheet
 * shows, the countdown, the API calls it makes, and that every string it renders exists in
 * both catalogues. Made-up ids only.
 */

import { ROAMING_PURPOSES } from '@assistigo/core';
import { describe, expect, it, vi } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import {
  DEFAULT_PROFILE_ACCESS_MINUTES,
  durationKey,
  nextProfileRequest,
  PROFILE_ACCESS_OPTIONS,
  requestMinutesLeft,
} from '../lib/access/profile-requests';
import { createCitizenApi, type ProfileRequest } from '../lib/cloud/citizen-api';

const NOW = new Date('2026-11-22T10:00:00.000Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

function request(id: string, createdMinutesAgo: number, expiresInMinutes: number): ProfileRequest {
  return {
    id,
    centreName: 'Demo Seva Kendra',
    purpose: 'form_filling',
    createdAt: minutesFromNow(-createdMinutesAgo),
    expiresAt: minutesFromNow(expiresInMinutes),
  };
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('nextProfileRequest', () => {
  it('shows the newest open request', () => {
    const chosen = nextProfileRequest([request(A, 5, 5), request(B, 1, 9)], new Set(), NOW);
    expect(chosen?.id).toBe(B);
  });

  it('skips requests already answered on this phone and ones that ran out', () => {
    expect(nextProfileRequest([request(A, 5, 5), request(B, 1, 9)], new Set([B]), NOW)?.id).toBe(A);
    expect(nextProfileRequest([request(A, 12, -2)], new Set(), NOW)).toBeNull();
  });
});

describe('durations', () => {
  it('offers 1, 2 and 4 hours, 2 by default', () => {
    expect(PROFILE_ACCESS_OPTIONS).toEqual([60, 120, 240]);
    expect(DEFAULT_PROFILE_ACCESS_MINUTES).toBe(120);
  });

  it('counts down in whole minutes, never 0 while open', () => {
    expect(requestMinutesLeft(minutesFromNow(9.5), NOW)).toBe(10);
    expect(requestMinutesLeft(minutesFromNow(0.1), NOW)).toBe(1);
    expect(requestMinutesLeft(minutesFromNow(-1), NOW)).toBe(0);
    expect(requestMinutesLeft('not a date', NOW)).toBe(0);
  });
});

describe('citizen API', () => {
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

  it('lists requests', async () => {
    const { client, fetch } = api({ data: { requests: [request(A, 1, 9)] } });
    const result = await client.listProfileRequests();
    expect(result).toMatchObject({ ok: true, value: [{ id: A, centreName: 'Demo Seva Kendra' }] });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.test/api/citizen/profile-requests');
  });

  it('approves with the duration the citizen picked', async () => {
    const { client, fetch } = api({
      data: { approved: { centreName: 'Demo Seva Kendra', expiresAt: minutesFromNow(240) } },
    });
    const result = await client.approveProfileRequest(A, 240);
    expect(result.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.example.test/api/citizen/profile-requests/${A}/approve`);
    expect(JSON.parse(String(init.body))).toEqual({ durationMinutes: 240 });
  });

  it('denies', async () => {
    const { client, fetch } = api(null, 204);
    expect((await client.denyProfileRequest(A)).ok).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/citizen/profile-requests/${A}/deny`,
    );
  });
});

describe('copy', () => {
  const KEYS = [
    'profileRequest.title',
    'profileRequest.body',
    'profileRequest.purposeLabel',
    ...ROAMING_PURPOSES.map((purpose) => `profileRequest.purposes.${purpose}`),
    'profileRequest.durationLabel',
    ...PROFILE_ACCESS_OPTIONS.map(durationKey),
    'profileRequest.warning',
    'profileRequest.expiresIn',
    'profileRequest.approve',
    'profileRequest.deny',
    'profileRequest.approvedTitle',
    'profileRequest.approvedBody',
    'profileRequest.deniedTitle',
    'profileRequest.deniedBody',
    'errors.roaming_request_missing',
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

  it('never names a document on the request sheet', () => {
    const sheet = JSON.stringify(en.profileRequest);
    for (const word of ['Aadhaar', 'caste', 'income', 'marksheet']) {
      expect(sheet.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
