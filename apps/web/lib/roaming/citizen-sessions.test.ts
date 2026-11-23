/**
 * The citizen's Centre access screen and trusted centres (migration 0042), against an in-memory
 * stand-in for the service-role client. The rules RLS cannot test because the service role
 * bypasses it: a citizen sees and stops only grants over records with their verified number,
 * trusting needs a live grant and a free slot (3 at most), the replaced grant is not shown twice,
 * and a 30-day approval comes only from the app.
 * Fixture ids and made-up numbers only; no real citizen data.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAppError, TRUSTED_CENTRE_DURATION_MINUTES } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { approveProfileRequest } from './app-approval';
import {
  listCentreAccess,
  nationalMobile,
  stopCentreAccess,
  trustCentreAccess,
  type CitizenSessionsContext,
} from './citizen-sessions';

type Row = Record<string, unknown>;

const DEFAULTS: Record<string, Row> = {
  customer_access_grants: { status: 'active', revoked_at: null, revoked_by: null },
  consent_records: { status: 'granted', withdrawn_at: null },
};

/** Just enough of supabase-js for these services. */
function fakeDb(tables: Record<string, Row[]>, clock: () => Date) {
  function builder(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    let cap = Infinity;
    const rows = () => (tables[table] ??= []);

    function run(): { data: Row[]; error: null } {
      if (op === 'insert') {
        const row = {
          id: randomUUID(),
          created_at: clock().toISOString(),
          ...DEFAULTS[table],
          ...payload,
        };
        rows().push(row);
        return { data: [row], error: null };
      }
      const hit = rows().filter((row) => filters.every((f) => f(row)));
      if (op === 'update') {
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      return { data: hit.slice(0, cap), error: null };
    }

    const api = {
      select: () => api,
      insert: (row: Row) => ((op = 'insert'), (payload = row), api),
      update: (row: Row) => ((op = 'update'), (payload = row), api),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), api),
      is: (column: string, value: unknown) => (
        filters.push((row) => (row[column] ?? null) === value),
        api
      ),
      in: (column: string, values: unknown[]) => (
        filters.push((row) => values.includes(row[column])),
        api
      ),
      gt: (column: string, value: unknown) => (
        filters.push((row) => row[column] != null && String(row[column]) > String(value)),
        api
      ),
      gte: (column: string, value: unknown) => (
        filters.push((row) => row[column] != null && String(row[column]) >= String(value)),
        api
      ),
      order: () => api,
      limit: (n: number) => ((cap = n), api),
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => {
        const row = run().data[0];
        return row ? { data: row, error: null } : { data: null, error: new Error('no row') };
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve(run()),
    };
    return api;
  }
  return { from: builder } as unknown as AssistigoSupabaseClient;
}

const CITIZEN = '77777777-7777-4777-8777-777777777777';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const MY_RECORD = '11111111-1111-4111-8111-111111111111';
const MY_RECORD_ELSEWHERE = '11111111-1111-4111-8111-111111111112';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';
const CENTRE_A = '33333333-3333-4333-8333-33333333333a';
const CENTRE_B = '33333333-3333-4333-8333-33333333333b';

/** Made-up numbers in the 90000 0000x range. */
const MOBILE = '9000000001';
const OTHER_MOBILE = '9000000002';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

let clock: Date;
let tables: Record<string, Row[]>;

function citizen(overrides: Partial<CitizenSessionsContext> = {}): CitizenSessionsContext {
  return {
    db: fakeDb(tables, () => clock),
    citizenId: CITIZEN,
    phone: `91${MOBILE}`,
    now: () => clock,
    ...overrides,
  };
}

function grant(overrides: Row = {}): Row {
  const row: Row = {
    id: randomUUID(),
    customer_id: MY_RECORD,
    organization_id: CENTRE_A,
    granted_to_user_id: OPERATOR,
    purpose: 'form_filling',
    target_scheme_slug: null,
    status: 'active',
    auth_method: 'app_approval',
    granted_at: new Date(clock.getTime() - HOUR).toISOString(),
    expires_at: new Date(clock.getTime() + HOUR).toISOString(),
    revoked_at: null,
    revoked_by: null,
    consent_record_id: null,
    ...overrides,
  };
  tables.customer_access_grants!.push(row);
  return row;
}

async function expectAppError(promise: Promise<unknown>, key: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected an AppError');
  } catch (error) {
    expect(isAppError(error)).toBe(true);
    expect((error as { messageKey: string }).messageKey).toBe(key);
  }
}

beforeEach(() => {
  clock = new Date('2026-11-23T10:00:00.000Z');
  tables = {
    customers: [
      { id: MY_RECORD, mobile: MOBILE, mobile_normalized: MOBILE, deleted_at: null },
      { id: MY_RECORD_ELSEWHERE, mobile: MOBILE, mobile_normalized: MOBILE, deleted_at: null },
      { id: SOMEONE_ELSE, mobile: OTHER_MOBILE, mobile_normalized: OTHER_MOBILE, deleted_at: null },
    ],
    organizations: [
      { id: CENTRE_A, name: 'Test Centre A' },
      { id: CENTRE_B, name: 'Test Centre B' },
    ],
    customer_access_grants: [],
    consent_records: [],
    customer_access_requests: [],
    customer_roaming_links: [],
    audit_logs: [],
  };
});

describe('nationalMobile', () => {
  it('reads only a verified Indian number', () => {
    expect(nationalMobile(`91${MOBILE}`)).toBe(MOBILE);
    expect(nationalMobile(MOBILE)).toBeNull();
    expect(nationalMobile('915000000001')).toBeNull();
    expect(nationalMobile(null)).toBeNull();
  });
});

describe('listCentreAccess', () => {
  it("shows grants over every record with the citizen's number, and nobody else's", async () => {
    grant({ organization_id: CENTRE_A });
    grant({ customer_id: MY_RECORD_ELSEWHERE, organization_id: CENTRE_B });
    grant({ customer_id: SOMEONE_ELSE });

    const sessions = await listCentreAccess(citizen());
    expect(sessions.map((s) => s.centreName).sort()).toEqual(['Test Centre A', 'Test Centre B']);
    expect(sessions.every((s) => s.state === 'live')).toBe(true);
  });

  it('shows nothing without a verified number', async () => {
    grant();
    expect(await listCentreAccess(citizen({ phone: null }))).toEqual([]);
  });

  it('says how each ended, and hides a grant replaced by a trusted one', async () => {
    grant({ expires_at: new Date(clock.getTime() - 1).toISOString() });
    grant({ status: 'revoked', revoked_at: clock.toISOString(), revoked_by: CITIZEN });
    grant({ status: 'revoked', revoked_at: clock.toISOString(), revoked_by: OPERATOR });
    grant({ status: 'revoked', revoked_at: clock.toISOString(), revoked_by: null });

    const states = (await listCentreAccess(citizen())).map((s) => s.state).sort();
    expect(states).toEqual(['ended_by_centre', 'ended_by_you', 'expired']);
  });

  it('carries no operator id, customer id or consent id', async () => {
    grant({ auth_method: 'app_trusted' });
    const [session] = await listCentreAccess(citizen());
    expect(session?.trusted).toBe(true);
    expect(Object.keys(session ?? {}).sort()).toEqual([
      'centreName',
      'endedAt',
      'expiresAt',
      'grantId',
      'grantedAt',
      'purpose',
      'state',
      'targetSchemeSlug',
      'trusted',
    ]);
  });
});

describe('stopCentreAccess', () => {
  it('ends the grant at once, withdraws its consent and tells the centre', async () => {
    tables.consent_records!.push({ id: 'consent-1', status: 'granted', withdrawn_at: null });
    const live = grant({ consent_record_id: 'consent-1' });

    await stopCentreAccess(citizen(), live.id as string);
    expect(live.status).toBe('revoked');
    expect(live.revoked_by).toBe(CITIZEN);
    expect(tables.consent_records![0]!.status).toBe('withdrawn');
    expect(tables.audit_logs!.map((row) => row.action)).toEqual([
      'customer.roaming_access_revoked',
    ]);
  });

  it("is the same 404 for someone else's grant, an ended one or a made-up id", async () => {
    const theirs = grant({ customer_id: SOMEONE_ELSE });
    const ended = grant({ expires_at: new Date(clock.getTime() - 1).toISOString() });

    for (const id of [theirs.id as string, ended.id as string, randomUUID()]) {
      await expectAppError(stopCentreAccess(citizen(), id), 'errors.roaming_grant_missing');
    }
    expect(theirs.status).toBe('active');
  });
});

describe('trustCentreAccess', () => {
  it('replaces a live session with a 30-day grant for the same operator and centre', async () => {
    const live = grant();
    const trusted = await trustCentreAccess(citizen(), live.id as string);

    expect(Date.parse(trusted.expiresAt) - clock.getTime()).toBe(30 * DAY);
    const minted = tables.customer_access_grants!.find((row) => row.id === trusted.grantId)!;
    expect(minted).toMatchObject({
      auth_method: 'app_trusted',
      granted_to_user_id: OPERATOR,
      organization_id: CENTRE_A,
      customer_id: MY_RECORD,
    });
    expect(live.status).toBe('revoked');
    expect(live.revoked_by).toBeNull();

    const sessions = await listCentreAccess(citizen());
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ grantId: trusted.grantId, trusted: true, state: 'live' });
  });

  it('allows at most three trusted centres, but a renewal does not need a free slot', async () => {
    const trusted = [0, 1, 2].map(() =>
      grant({
        auth_method: 'app_trusted',
        expires_at: new Date(clock.getTime() + DAY).toISOString(),
      }),
    );
    const short = grant();

    await expectAppError(
      trustCentreAccess(citizen(), short.id as string),
      'errors.roaming_trusted_limit',
    );
    expect(short.status).toBe('active');

    const renewed = await trustCentreAccess(citizen(), trusted[0]!.id as string);
    expect(Date.parse(renewed.expiresAt) - clock.getTime()).toBe(30 * DAY);
  });

  it('needs a live grant of the citizen', async () => {
    const ended = grant({ expires_at: new Date(clock.getTime() - 1).toISOString() });
    const theirs = grant({ customer_id: SOMEONE_ELSE });
    for (const id of [ended.id as string, theirs.id as string]) {
      await expectAppError(trustCentreAccess(citizen(), id), 'errors.roaming_grant_missing');
    }
  });

  it('mints one grant from two quick taps', async () => {
    const live = grant();
    await trustCentreAccess(citizen(), live.id as string);
    await expectAppError(
      trustCentreAccess(citizen(), live.id as string),
      'errors.roaming_grant_missing',
    );
    expect(
      tables.customer_access_grants!.filter((row) => row.auth_method === 'app_trusted'),
    ).toHaveLength(1);
  });
});

describe('approving a request for 30 days', () => {
  function pendingRequest(): Row {
    const row: Row = {
      id: randomUUID(),
      customer_id: MY_RECORD,
      organization_id: CENTRE_A,
      centre_name: 'Test Centre A',
      requested_by: OPERATOR,
      citizen_id: CITIZEN,
      purpose: 'form_filling',
      target_scheme_slug: null,
      status: 'pending',
      duration_minutes: null,
      grant_id: null,
      expires_at: new Date(clock.getTime() + 10 * 60_000).toISOString(),
      decided_at: null,
      created_at: clock.toISOString(),
    };
    tables.customer_access_requests!.push(row);
    return row;
  }

  it('mints a trusted grant', async () => {
    const request = pendingRequest();
    const approved = await approveProfileRequest(citizen(), request.id as string, {
      durationMinutes: TRUSTED_CENTRE_DURATION_MINUTES,
    });
    expect(Date.parse(approved.expiresAt) - clock.getTime()).toBe(30 * DAY);
    expect(tables.customer_access_grants![0]).toMatchObject({ auth_method: 'app_trusted' });
    expect(tables.consent_records![0]).toMatchObject({
      consent_text_version: 'roaming-trusted-v1',
    });
  });

  it('is refused once three centres are trusted, and the request stays answerable', async () => {
    for (let i = 0; i < 3; i += 1) grant({ auth_method: 'app_trusted' });
    const request = pendingRequest();
    await expectAppError(
      approveProfileRequest(citizen(), request.id as string, {
        durationMinutes: TRUSTED_CENTRE_DURATION_MINUTES,
      }),
      'errors.roaming_trusted_limit',
    );
    expect(request.status).toBe('pending');

    await approveProfileRequest(citizen(), request.id as string, { durationMinutes: 120 });
    expect(request.status).toBe('approved');
  });
});
