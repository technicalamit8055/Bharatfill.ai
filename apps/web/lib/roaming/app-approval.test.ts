/**
 * Roaming consent by approval in the BharatDoc app (migration 0039), against an in-memory
 * stand-in for the service-role client. These are the rules RLS cannot test because the service
 * role bypasses it: the citizen picks the duration, a request reaches only the account whose
 * verified number is the customer's mobile, one approval mints one grant, and the operator's
 * view is the same whether or not the customer uses the app.
 * Fixture ids and made-up numbers only; no real citizen data.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAppError } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import {
  appApprovalStatus,
  approveProfileRequest,
  cancelAppApproval,
  denyProfileRequest,
  listProfileRequests,
  requestAppApproval,
  type CitizenApprovalContext,
  type OperatorApprovalContext,
} from './app-approval';

type Row = Record<string, unknown>;

const DEFAULTS: Record<string, Row> = {
  customer_access_requests: {
    status: 'pending',
    duration_minutes: null,
    grant_id: null,
    decided_at: null,
  },
  customer_access_grants: { status: 'active', revoked_at: null },
};

/** Just enough of supabase-js for the approval services. */
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

  return {
    from: builder,
    rpc: async (_name: string, args: { p_mobile: string }) => {
      const account = (tables.citizen_accounts ?? []).find(
        (row) => row.phone === `91${args.p_mobile}`,
      );
      return { data: account ? account.id : null, error: null };
    },
  } as unknown as AssistigoSupabaseClient;
}

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const NO_APP_CUSTOMER = '22222222-2222-4222-8222-222222222222';
const CENTRE = '33333333-3333-4333-8333-333333333333';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const OTHER_OPERATOR = '66666666-6666-4666-8666-666666666666';
const CITIZEN = '77777777-7777-4777-8777-777777777777';
const OTHER_CITIZEN = '88888888-8888-4888-8888-888888888888';

/** Made-up numbers in the 90000 0000x range. */
const MOBILE = '9000000001';
const NO_APP_MOBILE = '9000000002';

let clock: Date;
let tables: Record<string, Row[]>;
let audits: { action: string; metadata?: Record<string, unknown> }[];

function operator(overrides: Partial<OperatorApprovalContext> = {}): OperatorApprovalContext {
  return {
    db: fakeDb(tables, () => clock),
    organizationId: CENTRE,
    centreName: 'Demo Seva Kendra',
    operatorId: OPERATOR,
    now: () => clock,
    isLinked: async () => true,
    audit: async (entry) => {
      audits.push(entry);
    },
    ...overrides,
  };
}

function citizen(overrides: Partial<CitizenApprovalContext> = {}): CitizenApprovalContext {
  return {
    db: fakeDb(tables, () => clock),
    citizenId: CITIZEN,
    phone: `91${MOBILE}`,
    now: () => clock,
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, messageKey: string) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(isAppError(error)).toBe(true);
  expect((error as { messageKey: string }).messageKey).toBe(messageKey);
}

beforeEach(() => {
  clock = new Date('2026-11-22T10:00:00.000Z');
  audits = [];
  tables = {
    customers: [
      { id: CUSTOMER, mobile: MOBILE, deleted_at: null },
      { id: NO_APP_CUSTOMER, mobile: NO_APP_MOBILE, deleted_at: null },
    ],
    citizen_accounts: [
      { id: CITIZEN, phone: `91${MOBILE}` },
      { id: OTHER_CITIZEN, phone: '919000000003' },
    ],
    customer_roaming_links: [{ organization_id: CENTRE, customer_id: CUSTOMER }],
  };
});

describe('operator request', () => {
  it('reaches the citizen whose verified number is the customer mobile, with no duration', async () => {
    const { requestId, expiresAt } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });

    const row = tables.customer_access_requests?.find((r) => r.id === requestId);
    expect(row).toMatchObject({ citizen_id: CITIZEN, duration_minutes: null, status: 'pending' });
    expect(new Date(expiresAt).getTime() - clock.getTime()).toBe(10 * 60_000);
    expect(audits.map((a) => a.action)).toEqual(['customer.roaming_approval_requested']);
    expect(JSON.stringify(audits)).not.toContain(MOBILE);
  });

  it('gives the operator the same answer when the customer has no app', async () => {
    const result = await requestAppApproval(operator(), NO_APP_CUSTOMER, {
      purpose: 'form_filling',
    });
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'requestId']);
    const row = tables.customer_access_requests?.find((r) => r.id === result.requestId);
    expect(row?.citizen_id).toBeNull();
    expect(await appApprovalStatus(operator(), NO_APP_CUSTOMER, result.requestId)).toMatchObject({
      status: 'pending',
    });
  });

  it('refuses a customer this centre has not bookmarked', async () => {
    await expectAppError(
      requestAppApproval(operator({ isLinked: async () => false }), CUSTOMER, {
        purpose: 'form_filling',
      }),
      'errors.not_found',
    );
  });

  it('keeps only the newest request from a counter answerable', async () => {
    const first = await requestAppApproval(operator(), CUSTOMER, { purpose: 'form_filling' });
    await requestAppApproval(operator(), CUSTOMER, { purpose: 'form_filling' });
    expect(await appApprovalStatus(operator(), CUSTOMER, first.requestId)).toMatchObject({
      status: 'expired',
    });
    expect(await listProfileRequests(citizen())).toHaveLength(1);
  });

  it('rate-limits a counter to 3 requests per customer per 15 minutes', async () => {
    for (let i = 0; i < 3; i += 1) {
      await requestAppApproval(operator(), CUSTOMER, { purpose: 'form_filling' });
    }
    await expectAppError(
      requestAppApproval(operator(), CUSTOMER, { purpose: 'form_filling' }),
      'errors.roaming_app_request_rate_limited',
    );
  });

  it('hides a request from every other operator', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });
    await expectAppError(
      appApprovalStatus(operator({ operatorId: OTHER_OPERATOR }), CUSTOMER, requestId),
      'errors.roaming_request_missing',
    );
  });
});

describe('citizen decision', () => {
  it('lists the centre and purpose only', async () => {
    await requestAppApproval(operator(), CUSTOMER, { purpose: 'scheme_application' });
    const [request] = await listProfileRequests(citizen());
    expect(request).toBeDefined();
    expect(Object.keys(request ?? {}).sort()).toEqual([
      'centreName',
      'createdAt',
      'expiresAt',
      'id',
      'purpose',
    ]);
    expect(request).toMatchObject({
      centreName: 'Demo Seva Kendra',
      purpose: 'scheme_application',
    });
    expect(await listProfileRequests(citizen({ citizenId: OTHER_CITIZEN }))).toEqual([]);
  });

  it('approves for the duration the citizen picked and unlocks the operator', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });

    const approved = await approveProfileRequest(citizen(), requestId, { durationMinutes: 240 });
    expect(new Date(approved.expiresAt).getTime() - clock.getTime()).toBe(240 * 60_000);

    const grant = tables.customer_access_grants?.[0];
    expect(grant).toMatchObject({
      customer_id: CUSTOMER,
      organization_id: CENTRE,
      granted_to_user_id: OPERATOR,
      auth_method: 'app_approval',
    });
    expect(tables.consent_records?.[0]).toMatchObject({
      consent_subject: 'roaming_access',
      evidence_json: expect.objectContaining({ method: 'app_approval', durationMinutes: 240 }),
    });

    const view = await appApprovalStatus(operator(), CUSTOMER, requestId);
    expect(view).toMatchObject({
      status: 'approved',
      session: { authMethod: 'app_approval', expiresAt: approved.expiresAt },
    });
    expect(tables.audit_logs?.map((row) => row.action)).toEqual([
      'customer.roaming_access_granted',
    ]);
  });

  it('mints one grant from one request, however many taps', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });
    await approveProfileRequest(citizen(), requestId, { durationMinutes: 60 });
    await expectAppError(
      approveProfileRequest(citizen(), requestId, { durationMinutes: 240 }),
      'errors.roaming_request_missing',
    );
    expect(tables.customer_access_grants).toHaveLength(1);
  });

  it('refuses when the customer mobile no longer matches the signed-in number', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });
    const customer = tables.customers?.find((row) => row.id === CUSTOMER);
    if (customer) customer.mobile = '9000000004';
    await expectAppError(
      approveProfileRequest(citizen(), requestId, { durationMinutes: 120 }),
      'errors.roaming_request_missing',
    );
    expect(tables.customer_access_grants ?? []).toHaveLength(0);
  });

  it('refuses another citizen, an expired request and a cancelled one', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });
    await expectAppError(
      approveProfileRequest(citizen({ citizenId: OTHER_CITIZEN }), requestId, {
        durationMinutes: 120,
      }),
      'errors.roaming_request_missing',
    );

    clock = new Date(clock.getTime() + 11 * 60_000);
    await expectAppError(
      approveProfileRequest(citizen(), requestId, { durationMinutes: 120 }),
      'errors.roaming_request_missing',
    );

    clock = new Date(clock.getTime() + 60 * 60_000);
    const second = await requestAppApproval(operator(), CUSTOMER, { purpose: 'form_filling' });
    await cancelAppApproval(operator(), CUSTOMER, second.requestId);
    await expectAppError(
      approveProfileRequest(citizen(), second.requestId, { durationMinutes: 120 }),
      'errors.roaming_request_missing',
    );
    expect(tables.customer_access_grants ?? []).toHaveLength(0);
  });

  it('deny tells the operator and mints nothing', async () => {
    const { requestId } = await requestAppApproval(operator(), CUSTOMER, {
      purpose: 'form_filling',
    });
    await denyProfileRequest(citizen(), requestId);
    expect(await appApprovalStatus(operator(), CUSTOMER, requestId)).toMatchObject({
      status: 'denied',
    });
    expect(tables.customer_access_grants ?? []).toHaveLength(0);
    expect(tables.audit_logs?.map((row) => row.action)).toEqual([
      'customer.roaming_approval_denied',
    ]);
  });
});
