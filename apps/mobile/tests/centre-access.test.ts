/**
 * Centre access screen (migration 0042): grouping and countdowns, when Trust / Renew is offered,
 * the API calls it makes, and that every string it renders exists in both catalogues with the
 * same placeholders. Made-up ids and centre names only.
 */

import { describe, expect, it, vi } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import {
  endedKey,
  groupCentreAccess,
  liveTrustedCount,
  MAX_TRUSTED_CENTRES,
  RENEW_WINDOW_DAYS,
  timeLeft,
  timeLeftCopy,
  trustActionFor,
} from '../lib/access/centre-access';
import { type CentreAccess, createCitizenApi } from '../lib/cloud/citizen-api';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

let counter = 0;
function session(overrides: Partial<CentreAccess> = {}): CentreAccess {
  counter += 1;
  return {
    grantId: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    centreName: 'Demo Seva Kendra',
    purpose: 'form_filling',
    targetSchemeSlug: null,
    trusted: false,
    grantedAt: at(-HOUR),
    expiresAt: at(HOUR),
    state: 'live',
    endedAt: null,
    ...overrides,
  };
}

describe('grouping', () => {
  it('puts trusted centres first, then the soonest to end; ended ones newest first', () => {
    const soon = session({ expiresAt: at(10 * MINUTE) });
    const later = session({ expiresAt: at(3 * HOUR) });
    const trusted = session({ trusted: true, expiresAt: at(20 * DAY) });
    const old = session({ state: 'expired', grantedAt: at(-3 * DAY), expiresAt: at(-3 * DAY) });
    const recent = session({ state: 'ended_by_you', grantedAt: at(-DAY), expiresAt: at(-DAY) });

    const { live, ended } = groupCentreAccess([later, old, soon, recent, trusted], NOW);
    expect(live).toEqual([trusted, soon, later]);
    expect(ended).toEqual([recent, old]);
  });

  it('treats a session whose time ran out as ended before the next refresh', () => {
    const lapsed = session({ expiresAt: at(-1) });
    expect(groupCentreAccess([lapsed], NOW).live).toEqual([]);
    expect(liveTrustedCount([{ ...lapsed, trusted: true }], NOW)).toBe(0);
  });
});

describe('time left', () => {
  it('counts down in days, hours or minutes, rounding down', () => {
    expect(timeLeft(at(29 * DAY + 23 * HOUR), NOW)).toEqual({ unit: 'days', value: 29 });
    expect(timeLeft(at(HOUR + 48 * MINUTE + 30_000), NOW)).toEqual({
      unit: 'hours',
      hours: 1,
      minutes: 48,
    });
    expect(timeLeft(at(10_000), NOW)).toEqual({ unit: 'minutes', value: 1 });
    expect(timeLeft(at(-1), NOW)).toEqual({ unit: 'none' });
    expect(timeLeft('not a date', NOW)).toEqual({ unit: 'none' });
  });
});

describe('trust and renew', () => {
  it('offers Trust on a short session while a slot is free', () => {
    expect(trustActionFor(session(), 0, NOW)).toBe('trust');
    expect(trustActionFor(session(), MAX_TRUSTED_CENTRES - 1, NOW)).toBe('trust');
    expect(trustActionFor(session(), MAX_TRUSTED_CENTRES, NOW)).toBeNull();
  });

  it("offers Renew only in a trusted centre's last week", () => {
    const fresh = session({ trusted: true, expiresAt: at(20 * DAY) });
    const ending = session({ trusted: true, expiresAt: at(RENEW_WINDOW_DAYS * DAY) });
    expect(trustActionFor(fresh, 3, NOW)).toBeNull();
    expect(trustActionFor(ending, 3, NOW)).toBe('renew');
  });

  it('offers nothing on an ended session', () => {
    expect(trustActionFor(session({ state: 'ended_by_centre' }), 0, NOW)).toBeNull();
  });

  it('allows three trusted centres', () => {
    expect(MAX_TRUSTED_CENTRES).toBe(3);
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

  it('lists sessions', async () => {
    const one = session({ trusted: true });
    const { client, fetch } = api({ data: { sessions: [one] } });
    expect(await client.listCentreAccess()).toEqual({ ok: true, value: [one] });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.test/api/citizen/centre-access');
  });

  it('reads the centres that saved the profile with the sessions (migration 0046)', async () => {
    const one = session();
    const centre = {
      customerId: '11111111-1111-4111-8111-111111111111',
      centreName: 'Demo Seva Kendra',
      locked: true,
      lockedAt: at(-DAY),
    };
    const { client } = api({ data: { sessions: [one], centres: [centre] } });
    expect(await client.getCentreAccessOverview()).toEqual({
      ok: true,
      value: { sessions: [one], centres: [centre] },
    });

    // A server before 0046 sends no centres: the screen just shows none.
    const older = api({ data: { sessions: [one] } });
    expect(await older.client.getCentreAccessOverview()).toEqual({
      ok: true,
      value: { sessions: [one], centres: [] },
    });
  });

  it('locks with POST and unlocks with DELETE on the same path', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const lock = api(null, 204);
    expect((await lock.client.lockCentreProfile(id)).ok).toBe(true);
    expect(lock.fetch.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/citizen/centre-profiles/${id}/lock`,
    );
    expect(lock.fetch.mock.calls[0]?.[1]?.method).toBe('POST');

    const unlock = api(null, 204);
    expect((await unlock.client.unlockCentreProfile(id)).ok).toBe(true);
    expect(unlock.fetch.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/citizen/centre-profiles/${id}/lock`,
    );
    expect(unlock.fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('rejects a session the server describes in a way the app does not know', async () => {
    const { client } = api({ data: { sessions: [{ ...session(), state: 'paused' }] } });
    expect((await client.listCentreAccess()).ok).toBe(false);
  });

  it('stops and trusts by grant id', async () => {
    const id = session().grantId;
    const stop = api(null, 204);
    expect((await stop.client.stopCentreAccess(id)).ok).toBe(true);
    expect(stop.fetch.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/citizen/centre-access/${id}/stop`,
    );

    const trust = api({ data: { trusted: { grantId: id, expiresAt: at(30 * DAY) } } });
    expect(await trust.client.trustCentreAccess(id)).toMatchObject({ ok: true });
    expect(trust.fetch.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/citizen/centre-access/${id}/trust`,
    );
  });
});

describe('copy', () => {
  const KEYS = [
    'profile.menu.centres.title',
    'profile.menu.centres.subtitle',
    'profile.unavailable.centres',
    'profileRequest.durations.m43200',
    ...[
      'title',
      'lead',
      'trustedCount',
      'liveHeading',
      'noneLive',
      'endedHeading',
      'trustedBadge',
      'until',
      'stop',
      'stopLabel',
      'trust',
      'renew',
      'trustNote',
      'unknownCentre',
      'signedOut',
      'stopConfirmTitle',
      'stopConfirmBody',
      'stoppedTitle',
      'stoppedBody',
      'trustConfirmTitle',
      'renewConfirmTitle',
      'trustConfirmBody',
      'trustedTitle',
      'trustedBody',
    ].map((key) => `centreAccess.${key}`),
    ...(['days', 'hours', 'minutes', 'none'] as const).map(
      (unit) =>
        timeLeftCopy(
          unit === 'days'
            ? { unit, value: 2 }
            : unit === 'hours'
              ? { unit, hours: 1, minutes: 2 }
              : unit === 'minutes'
                ? { unit, value: 3 }
                : { unit },
        ).key,
    ),
    ...(['ended_by_you', 'ended_by_centre', 'expired'] as const).map((state) =>
      endedKey({ state }),
    ),
    'errors.roaming_grant_missing',
    'errors.roaming_trusted_limit',
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

  it('never names a document on the Centre access screen', () => {
    const screen = JSON.stringify(en.centreAccess).toLowerCase();
    for (const word of ['aadhaar', 'caste', 'income', 'marksheet']) {
      expect(screen).not.toContain(word);
    }
  });
});
