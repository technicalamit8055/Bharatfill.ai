/**
 * "Centres that saved your profile" (migration 0046), against an in-memory stand-in for the
 * service-role client: the citizen sees and locks only the records at real centres whose mobile
 * is their verified number; a lock ends that centre's live grant; unlock removes it; every change
 * is audited to the centre with ids only. Fixture ids and made-up numbers only.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CITIZEN_APP_ORGANIZATION_ID, isAppError } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { listCentreProfiles, lockCentreProfile, unlockCentreProfile } from './citizen-locks';
import type { CitizenSessionsContext } from './citizen-sessions';

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'upsert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    let ignoreDuplicates = false;
    let cap = Infinity;
    const rows = () => (tables[table] ??= []);

    function run() {
      if (op === 'upsert') {
        const exists = rows().some((row) => row.customer_id === payload.customer_id);
        if (!exists) rows().push({ ...payload });
        else if (!ignoreDuplicates)
          Object.assign(
            rows().find((r) => r.customer_id === payload.customer_id)!,
            payload,
          );
        return { data: null, error: null };
      }
      const hit = rows().filter((row) => filters.every((f) => f(row)));
      if (op === 'update') {
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        tables[table] = rows().filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      }
      return { data: hit.slice(0, cap), error: null };
    }

    const api = {
      select: () => api,
      upsert: (row: Row, options?: { ignoreDuplicates?: boolean }) => (
        (op = 'upsert'),
        (payload = row),
        (ignoreDuplicates = Boolean(options?.ignoreDuplicates)),
        api
      ),
      update: (row: Row) => ((op = 'update'), (payload = row), api),
      delete: () => ((op = 'delete'), api),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), api),
      neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), api),
      is: (column: string, value: unknown) => (
        filters.push((row) => (row[column] ?? null) === value),
        api
      ),
      in: (column: string, values: unknown[]) => (
        filters.push((row) => values.includes(row[column])),
        api
      ),
      limit: (n: number) => ((cap = n), api),
      then: (resolve: (value: ReturnType<typeof run>) => unknown) => resolve(run()),
    };
    return api;
  }
  return {
    from: (table: string) => {
      if (table === 'audit_logs') {
        return {
          insert: async (row: Row) => {
            (tables.audit_logs ??= []).push({ id: randomUUID(), ...row });
            return { data: null, error: null };
          },
        };
      }
      return builder(table);
    },
  } as unknown as AssistigoSupabaseClient;
}

const CITIZEN = '77777777-7777-4777-8777-777777777777';
const CENTRE_A = '33333333-3333-4333-8333-333333333333';
const CENTRE_B = '44444444-4444-4444-8444-444444444444';
const MINE_AT_A = '11111111-1111-4111-8111-111111111111';
const MINE_AT_B = '12121212-1212-4121-8121-121212121212';
const MINE_IN_APP = '13131313-1313-4131-8131-131313131313';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';
const MOBILE = '9000000001';

let tables: Record<string, Row[]>;
const clock = new Date('2026-11-23T10:00:00.000Z');

function ctx(overrides: Partial<CitizenSessionsContext> = {}): CitizenSessionsContext {
  return {
    db: fakeDb(tables),
    citizenId: CITIZEN,
    phone: `91${MOBILE}`,
    now: () => clock,
    ...overrides,
  };
}

async function messageKeyOf(promise: Promise<unknown>): Promise<string | null> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  return isAppError(thrown) ? (thrown as { messageKey: string }).messageKey : null;
}

beforeEach(() => {
  tables = {
    customers: [
      { id: MINE_AT_A, organization_id: CENTRE_A, mobile_normalized: MOBILE, deleted_at: null },
      { id: MINE_AT_B, organization_id: CENTRE_B, mobile_normalized: MOBILE, deleted_at: null },
      {
        id: MINE_IN_APP,
        organization_id: CITIZEN_APP_ORGANIZATION_ID,
        mobile_normalized: MOBILE,
        deleted_at: null,
      },
      {
        id: SOMEONE_ELSE,
        organization_id: CENTRE_A,
        mobile_normalized: '9000000002',
        deleted_at: null,
      },
    ],
    organizations: [
      { id: CENTRE_A, name: 'Alpha Seva Kendra' },
      { id: CENTRE_B, name: 'Beta Cyber Cafe' },
    ],
    customer_citizen_locks: [],
    customer_access_grants: [
      {
        id: 'g-1',
        customer_id: MINE_AT_A,
        organization_id: CENTRE_A,
        status: 'active',
        revoked_at: null,
      },
    ],
  };
});

describe('listCentreProfiles', () => {
  it('lists the centres that created a profile for this number, not the app record', async () => {
    expect(await listCentreProfiles(ctx())).toEqual([
      { customerId: MINE_AT_A, centreName: 'Alpha Seva Kendra', locked: false, lockedAt: null },
      { customerId: MINE_AT_B, centreName: 'Beta Cyber Cafe', locked: false, lockedAt: null },
    ]);
  });

  it('lists nothing without a verified Indian number', async () => {
    expect(await listCentreProfiles(ctx({ phone: null }))).toEqual([]);
  });
});

describe('lock and unlock', () => {
  it('locks the centre, ends its live grant and audits to that centre with ids only', async () => {
    await lockCentreProfile(ctx(), MINE_AT_A);

    expect(tables.customer_citizen_locks).toEqual([
      {
        customer_id: MINE_AT_A,
        organization_id: CENTRE_A,
        citizen_id: CITIZEN,
        locked_at: clock.toISOString(),
      },
    ]);
    expect(tables.customer_access_grants?.[0]).toMatchObject({
      status: 'revoked',
      revoked_by: CITIZEN,
    });
    expect(tables.audit_logs?.[0]).toMatchObject({
      organization_id: CENTRE_A,
      action: 'customer.citizen_locked',
      entity_id: MINE_AT_A,
    });
    expect(JSON.stringify(tables.audit_logs)).not.toContain(MOBILE);

    const [first] = await listCentreProfiles(ctx());
    expect(first).toMatchObject({ customerId: MINE_AT_A, locked: true });
  });

  it('locking twice keeps one lock', async () => {
    await lockCentreProfile(ctx(), MINE_AT_A);
    await lockCentreProfile(ctx(), MINE_AT_A);
    expect(tables.customer_citizen_locks).toHaveLength(1);
  });

  it('unlock removes the lock and is audited', async () => {
    await lockCentreProfile(ctx(), MINE_AT_A);
    await unlockCentreProfile(ctx(), MINE_AT_A);
    expect(tables.customer_citizen_locks).toEqual([]);
    expect(tables.audit_logs?.map((row) => row.action)).toEqual([
      'customer.citizen_locked',
      'customer.citizen_unlocked',
    ]);
  });

  it("refuses someone else's record and the app record alike", async () => {
    expect(await messageKeyOf(lockCentreProfile(ctx(), SOMEONE_ELSE))).toBe('errors.not_found');
    expect(await messageKeyOf(lockCentreProfile(ctx(), MINE_IN_APP))).toBe('errors.not_found');
    expect(await messageKeyOf(unlockCentreProfile(ctx(), SOMEONE_ELSE))).toBe('errors.not_found');
    expect(tables.customer_citizen_locks).toEqual([]);
  });
});
