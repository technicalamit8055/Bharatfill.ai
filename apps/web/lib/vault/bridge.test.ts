/**
 * Citizen Vault bridge services (docs/VAULT_BRIDGE_DESIGN.md §4, §6, §7) — operator side
 * (`operator.ts`) and citizen side (`../citizen/access.ts`) — against an in-memory stand-in for
 * the service-role client. These are the rules RLS cannot test, because the service role
 * bypasses it: uniform lookups, rate limits, one-use codes, identical 404s, per-operator and
 * per-citizen scoping, and the access event written before any byte is read.
 * Fixture ids and made-up numbers only; no real citizen data.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError, LOOKUP_LIMITS, WRONG_CODE_LIMITS } from '@assistigo/core';

const { MASTER } = vi.hoisted(() => ({
  MASTER: Buffer.alloc(32, 7).toString('base64'),
}));
vi.mock('../env', () => ({ serverEnv: () => ({ VAULT_MASTER_KEY: MASTER }) }));

import {
  approveRequest,
  denyRequest,
  issueShareCode,
  listAccess,
  revokeGrant,
} from '../citizen/access';
import { mobileHmac, newDocumentKey, shareCodeHmac, wrapDocumentKey } from '../citizen/secrets';
import { sealVaultFile } from '../citizen/vault-file';
import {
  endGrant,
  listGrantDocuments,
  lookupVault,
  openGrantDocument,
  requestStatus,
  unlockWithCode,
  type OperatorVaultContext,
} from './operator';
import type { VaultDb } from './grants';

type Row = Record<string, unknown>;
type Step = string;

/** Column defaults the migrations set (0038), which inserts rely on. */
const DEFAULTS: Record<string, Row> = {
  vault_access_requests: { status: 'pending', grant_id: null, decided_at: null },
  vault_access_challenges: { attempts_left: 3, consumed_at: null },
  vault_access_grants: { ended_at: null, ended_by: null, opened_notified_at: null },
};

/** Just enough of supabase-js for the bridge services, logging every step in order. */
function fakeDb(
  tables: Record<string, Row[]>,
  objects: Map<string, Buffer>,
  log: Step[],
  clock: () => Date,
) {
  function builder(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    let sort: { column: string; ascending: boolean } | null = null;
    let cap = Infinity;
    const rows = () => (tables[table] ??= []);

    function run(): { data: Row[]; error: null } {
      log.push(`${op}:${table}`);
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
      let hit = rows().filter((row) => filters.every((f) => f(row)));
      if (op === 'update') {
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        tables[table] = rows().filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      }
      if (sort) {
        const { column, ascending } = sort;
        hit = [...hit].sort(
          (a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1),
        );
      }
      return { data: hit.slice(0, cap), error: null };
    }

    const compare = (
      column: string,
      test: (a: string | number, b: string | number) => boolean,
      value: unknown,
    ) => filters.push((row) => row[column] != null && test(row[column] as string, value as string));

    const api = {
      select: () => api,
      insert: (row: Row) => ((op = 'insert'), (payload = row), api),
      update: (row: Row) => ((op = 'update'), (payload = row), api),
      delete: () => ((op = 'delete'), api),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), api),
      is: (column: string, value: unknown) => (
        filters.push((row) => (row[column] ?? null) === value),
        api
      ),
      gt: (column: string, value: unknown) => (compare(column, (a, b) => a > b, value), api),
      gte: (column: string, value: unknown) => (compare(column, (a, b) => a >= b, value), api),
      order: (column: string, options?: { ascending?: boolean }) => (
        (sort = { column, ascending: options?.ascending ?? true }),
        api
      ),
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
    rpc: async (name: string, args: { p_mobile: string }) => {
      log.push(`rpc:${name}`);
      const account = (tables.citizen_accounts ?? []).find((row) => row.mobile === args.p_mobile);
      return { data: account ? account.id : null, error: null };
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          log.push('download');
          const bytes = objects.get(path);
          return bytes
            ? { data: new Blob([new Uint8Array(bytes)]), error: null }
            : { data: null, error: new Error('missing') };
        },
      }),
    },
  };
}

const CITIZEN = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN = '22222222-2222-4222-8222-222222222222';
const CENTRE = '33333333-3333-4333-8333-333333333333';
const OTHER_CENTRE = '44444444-4444-4444-8444-444444444444';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const OTHER_OPERATOR = '66666666-6666-4666-8666-666666666666';
const DOCUMENT = '77777777-7777-4777-8777-777777777777';

/** Made-up numbers in the 90000 0000x range. */
const MOBILE = '9000000001';
const NO_CLOUD_MOBILE = '9000000002';
const UNKNOWN_MOBILE = '9000000009';

const PLAINTEXT = Buffer.from('%PDF-1.7 demo marksheet');

let clock: Date;
let tables: Record<string, Row[]>;
let objects: Map<string, Buffer>;
let log: Step[];
let audits: { action: string; metadata?: Record<string, unknown> }[];
let db: VaultDb;

function operator(overrides: Partial<OperatorVaultContext> = {}): OperatorVaultContext {
  return {
    db,
    organizationId: CENTRE,
    centreName: 'Demo Seva Kendra',
    operatorId: OPERATOR,
    now: () => clock,
    audit: async (entry) => {
      audits.push({ action: entry.action, metadata: entry.metadata });
    },
    ...overrides,
  };
}

const citizen = (citizenId = CITIZEN) => ({ db, citizenId, now: () => clock });

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function messageKeyOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return isAppError(error) ? error.messageKey : `not-an-app-error: ${String(error)}`;
  }
}

beforeEach(() => {
  clock = new Date('2026-11-22T10:00:00.000Z');
  log = [];
  audits = [];
  objects = new Map();
  const key = newDocumentKey();
  const storagePath = `${CITIZEN}/${DOCUMENT}.bin`;
  objects.set(storagePath, sealVaultFile(CITIZEN, DOCUMENT, PLAINTEXT, key));
  tables = {
    citizen_accounts: [
      { id: CITIZEN, mobile: MOBILE, cloud_enabled: true },
      { id: OTHER_CITIZEN, mobile: NO_CLOUD_MOBILE, cloud_enabled: false },
    ],
    citizen_vault_keys: [
      { citizen_id: CITIZEN, wrapped_key: wrapDocumentKey(CITIZEN, key, MASTER) },
    ],
    citizen_vault_documents: [
      {
        id: DOCUMENT,
        citizen_id: CITIZEN,
        document_type: 'marksheet_10',
        category: 'education',
        title: 'Demo marksheet',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        size_bytes: 100,
        page_count: 1,
        status: 'ready',
        deleted_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ],
    vault_access_requests: [],
    vault_access_challenges: [],
    vault_unlock_attempts: [],
    vault_access_grants: [],
    vault_access_events: [],
    citizen_consent_records: [],
    audit_logs: [],
  };
  db = fakeDb(tables, objects, log, () => clock) as unknown as VaultDb;
});

/** A grant via the share-code path, as the counter would get one. */
async function grantByCode(allowCopy = false) {
  const { code } = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy });
  return unlockWithCode(operator(), MOBILE, code);
}

describe('lookup', () => {
  it('answers the same for a vault, a vault without cloud, and no vault at all', async () => {
    const results = [
      await lookupVault(operator(), MOBILE),
      await lookupVault(operator(), NO_CLOUD_MOBILE),
      await lookupVault(operator(), UNKNOWN_MOBILE),
    ];
    for (const result of results)
      expect(Object.keys(result).sort()).toEqual(['expiresAt', 'requestId']);

    const requests = tables.vault_access_requests!;
    expect(requests.map((row) => row.citizen_id)).toEqual([CITIZEN, null, null]);
    // The number itself is never stored — only its HMAC.
    expect(JSON.stringify(requests)).not.toContain(MOBILE);
    expect(requests[0]!.mobile_hmac).toBe(mobileHmac(MOBILE));
  });

  it('keeps answering past the per-number cap, but stops reaching the phone', async () => {
    for (let i = 0; i < LOOKUP_LIMITS.perNumberPer15Minutes; i++) {
      await lookupVault(
        operator({ operatorId: randomUUID(), organizationId: randomUUID() }),
        MOBILE,
      );
    }
    const result = await lookupVault(operator(), MOBILE);
    expect(result.requestId).toBeTruthy();
    expect(tables.vault_access_requests!.at(-1)!.citizen_id).toBeNull();

    advance(16);
    await lookupVault(operator(), MOBILE);
    expect(tables.vault_access_requests!.at(-1)!.citizen_id).toBe(CITIZEN);
  });

  it('limits one operator, then one centre', async () => {
    for (let i = 0; i < LOOKUP_LIMITS.perOperatorPer15Minutes; i++) {
      await lookupVault(operator(), UNKNOWN_MOBILE);
    }
    expect(await messageKeyOf(lookupVault(operator(), UNKNOWN_MOBILE))).toBe(
      'errors.vault.lookup_limited',
    );

    advance(16);
    const others = LOOKUP_LIMITS.perCentrePerHour - LOOKUP_LIMITS.perOperatorPer15Minutes;
    for (let i = 0; i < others; i++) {
      await lookupVault(operator({ operatorId: randomUUID() }), UNKNOWN_MOBILE);
    }
    expect(
      await messageKeyOf(lookupVault(operator({ operatorId: randomUUID() }), UNKNOWN_MOBILE)),
    ).toBe('errors.vault.lookup_limited');
    // Another centre is unaffected.
    expect(
      await messageKeyOf(lookupVault(operator({ organizationId: OTHER_CENTRE }), UNKNOWN_MOBILE)),
    ).toBeNull();
  });

  it('audits the lookup without the number', async () => {
    await lookupVault(operator(), MOBILE);
    expect(audits.map((entry) => entry.action)).toEqual(['vault.lookup']);
    expect(JSON.stringify(audits)).not.toContain(MOBILE);
  });
});

describe('request status', () => {
  it('is visible only to the operator who asked, at their centre', async () => {
    const { requestId } = await lookupVault(operator(), MOBILE);
    expect(await requestStatus(operator(), requestId)).toMatchObject({ status: 'pending' });
    expect(
      await messageKeyOf(requestStatus(operator({ operatorId: OTHER_OPERATOR }), requestId)),
    ).toBe('errors.vault.request_missing');
    expect(
      await messageKeyOf(requestStatus(operator({ organizationId: OTHER_CENTRE }), requestId)),
    ).toBe('errors.vault.request_missing');
  });

  it('follows the citizen’s decision, and expires', async () => {
    const approved = await lookupVault(operator(), MOBILE);
    await approveRequest(citizen(), approved.requestId, { durationMinutes: 30, allowCopy: false });
    expect(await requestStatus(operator(), approved.requestId)).toMatchObject({
      status: 'approved',
      grant: { live: true, method: 'approval' },
    });

    const denied = await lookupVault(operator(), MOBILE);
    await denyRequest(citizen(), denied.requestId);
    expect(await requestStatus(operator(), denied.requestId)).toEqual({ status: 'denied' });

    const ignored = await lookupVault(operator(), MOBILE);
    advance(11);
    expect(await requestStatus(operator(), ignored.requestId)).toEqual({ status: 'expired' });
    // The approved grant ran out too (30 min) only later; 11 min in it is still live.
    expect(await requestStatus(operator(), approved.requestId)).toMatchObject({
      status: 'approved',
    });
    advance(20);
    expect(await requestStatus(operator(), approved.requestId)).toEqual({ status: 'expired' });
  });
});

describe('share code', () => {
  it('is stored only as a salted HMAC, and a new code retires the old one', async () => {
    const first = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy: false });
    expect(first.code).toMatch(/^\d{6}$/);
    const second = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy: false });

    const challenges = tables.vault_access_challenges!;
    expect(JSON.stringify(challenges)).not.toContain(`"${first.code}"`);
    expect(challenges[1]!.code_hmac).toBe(
      shareCodeHmac(second.code, challenges[1]!.code_salt as string),
    );
    expect(challenges[0]!.consumed_at).not.toBeNull();

    if (first.code !== second.code) {
      expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, first.code))).toBe(
        'errors.vault.code_wrong',
      );
    }
    expect(await unlockWithCode(operator(), MOBILE, second.code)).toMatchObject({
      live: true,
      method: 'code',
    });
  });

  it('works once', async () => {
    const { code } = await issueShareCode(citizen(), { durationMinutes: 120, allowCopy: true });
    const grant = await unlockWithCode(operator(), MOBILE, code);
    expect(grant).toMatchObject({ live: true, allowCopy: true, minutesLeft: 120 });
    expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, code))).toBe(
      'errors.vault.code_wrong',
    );
    // Copy consent names this grant (design D14).
    expect(tables.citizen_consent_records).toEqual([
      expect.objectContaining({ citizen_id: CITIZEN, subject: 'centre_copy', grant_id: grant.id }),
    ]);
  });

  it('expires after 5 minutes', async () => {
    const { code } = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy: false });
    advance(6);
    expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, code))).toBe(
      'errors.vault.code_wrong',
    );
  });

  it('allows 3 tries, then the right code no longer works', async () => {
    const { code } = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy: false });
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) {
      expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, wrong))).toBe(
        'errors.vault.code_wrong',
      );
    }
    expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, code))).toBe(
      'errors.vault.code_wrong',
    );
  });

  it('fails the same way for no vault, no cloud and no code', async () => {
    const keys = [
      await messageKeyOf(unlockWithCode(operator(), UNKNOWN_MOBILE, '123456')),
      await messageKeyOf(unlockWithCode(operator(), NO_CLOUD_MOBILE, '123456')),
      await messageKeyOf(unlockWithCode(operator(), MOBILE, '123456')),
    ];
    expect(keys).toEqual([
      'errors.vault.code_wrong',
      'errors.vault.code_wrong',
      'errors.vault.code_wrong',
    ]);
    expect(tables.vault_unlock_attempts).toHaveLength(3);
    expect(JSON.stringify(audits)).not.toContain('123456');
  });

  it('pauses code entry for a number after too many wrong codes', async () => {
    for (let i = 0; i < WRONG_CODE_LIMITS.perNumberPerDay; i++) {
      await unlockWithCode(operator({ organizationId: randomUUID() }), MOBILE, '123456').catch(
        () => null,
      );
    }
    const { code } = await issueShareCode(citizen(), { durationMinutes: 30, allowCopy: false });
    expect(await messageKeyOf(unlockWithCode(operator(), MOBILE, code))).toBe(
      'errors.vault.code_paused',
    );
  });
});

describe('documents under a grant', () => {
  it('lists ready documents and records that they were listed', async () => {
    const grant = await grantByCode();
    const { documents } = await listGrantDocuments(operator(), grant.id);
    expect(documents.map((row) => row.id)).toEqual([DOCUMENT]);
    expect(tables.vault_access_events!.map((row) => row.action)).toEqual(['granted', 'listed']);
  });

  it('writes the access event before reading the key or any byte', async () => {
    const grant = await grantByCode();
    log.length = 0;
    const opened = await openGrantDocument(operator(), grant.id, DOCUMENT, 'viewed');
    expect(opened.bytes.equals(PLAINTEXT)).toBe(true);
    expect(opened).toMatchObject({ mimeType: 'application/pdf', documentType: 'marksheet_10' });

    const event = log.indexOf('insert:vault_access_events');
    expect(event).toBeGreaterThanOrEqual(0);
    expect(event).toBeLessThan(log.indexOf('select:citizen_vault_keys'));
    expect(event).toBeLessThan(log.indexOf('download'));
    expect(tables.vault_access_events!.at(-1)).toMatchObject({
      action: 'viewed',
      document_id: DOCUMENT,
      document_type: 'marksheet_10',
      operator_id: OPERATOR,
    });
    // The citizen sees the type, the centre's log never sees the title.
    expect(JSON.stringify(audits)).not.toContain('Demo marksheet');
  });

  it('gives the same 404 to every operator, centre or time that does not hold the grant', async () => {
    const grant = await grantByCode();
    const attempts = [
      openGrantDocument(operator({ operatorId: OTHER_OPERATOR }), grant.id, DOCUMENT, 'viewed'),
      openGrantDocument(operator({ organizationId: OTHER_CENTRE }), grant.id, DOCUMENT, 'viewed'),
      openGrantDocument(operator(), randomUUID(), DOCUMENT, 'viewed'),
      openGrantDocument(operator(), grant.id, randomUUID(), 'viewed'),
      listGrantDocuments(operator({ operatorId: OTHER_OPERATOR }), grant.id),
    ];
    for (const attempt of attempts)
      expect(await messageKeyOf(attempt)).toBe('errors.vault.grant_missing');

    advance(31);
    expect(await messageKeyOf(openGrantDocument(operator(), grant.id, DOCUMENT, 'viewed'))).toBe(
      'errors.vault.grant_missing',
    );
    expect(log).not.toContain('download');
  });

  it('does not open a document the citizen deleted', async () => {
    const grant = await grantByCode();
    tables.citizen_vault_documents![0]!.deleted_at = clock.toISOString();
    expect(await messageKeyOf(openGrantDocument(operator(), grant.id, DOCUMENT, 'viewed'))).toBe(
      'errors.vault.grant_missing',
    );
  });

  it('ends when the operator taps End, or the citizen taps Stop', async () => {
    const first = await grantByCode();
    await endGrant(operator(), first.id);
    expect(await messageKeyOf(listGrantDocuments(operator(), first.id))).toBe(
      'errors.vault.grant_missing',
    );

    const second = await grantByCode();
    await revokeGrant(citizen(), second.id);
    expect(await messageKeyOf(openGrantDocument(operator(), second.id, DOCUMENT, 'viewed'))).toBe(
      'errors.vault.grant_missing',
    );
    expect(tables.vault_access_grants!.map((row) => row.ended_by)).toEqual(['operator', 'citizen']);
  });
});

describe('the citizen’s side', () => {
  it('approves once, for the operator who asked', async () => {
    const { requestId } = await lookupVault(operator(), MOBILE);
    const grant = await approveRequest(citizen(), requestId, {
      durationMinutes: 30,
      allowCopy: false,
    });
    expect(tables.vault_access_grants![0]).toMatchObject({
      granted_to_user_id: OPERATOR,
      organization_id: CENTRE,
      method: 'approval',
    });
    expect(tables.vault_access_requests![0]).toMatchObject({
      status: 'approved',
      grant_id: grant.id,
    });
    expect(tables.audit_logs![0]).toMatchObject({ organization_id: CENTRE, actor_type: 'system' });

    expect(
      await messageKeyOf(
        approveRequest(citizen(), requestId, { durationMinutes: 30, allowCopy: false }),
      ),
    ).toBe('errors.vault.request_missing');
    expect(tables.vault_access_grants).toHaveLength(1);
  });

  it('cannot decide another citizen’s request, or one that expired', async () => {
    const { requestId } = await lookupVault(operator(), MOBILE);
    expect(
      await messageKeyOf(
        approveRequest(citizen(OTHER_CITIZEN), requestId, {
          durationMinutes: 30,
          allowCopy: false,
        }),
      ),
    ).toBe('errors.vault.request_missing');
    expect(await messageKeyOf(denyRequest(citizen(OTHER_CITIZEN), requestId))).toBe(
      'errors.vault.request_missing',
    );

    advance(11);
    expect(
      await messageKeyOf(
        approveRequest(citizen(), requestId, { durationMinutes: 30, allowCopy: false }),
      ),
    ).toBe('errors.vault.request_missing');
  });

  it('cannot stop another citizen’s grant', async () => {
    const grant = await grantByCode();
    expect(await messageKeyOf(revokeGrant(citizen(OTHER_CITIZEN), grant.id))).toBe(
      'errors.vault.grant_missing',
    );
    expect(tables.vault_access_grants![0]!.ended_at ?? null).toBeNull();
  });

  it('sees only their own grants, requests and history', async () => {
    const grant = await grantByCode();
    await listGrantDocuments(operator(), grant.id);
    await lookupVault(operator(), MOBILE);

    const mine = await listAccess(citizen());
    expect(mine.grants.map((row) => row.id)).toEqual([grant.id]);
    expect(mine.requests).toHaveLength(1);
    expect(mine.events.map((row) => row.action).sort()).toEqual(['granted', 'listed']);

    const theirs = await listAccess(citizen(OTHER_CITIZEN));
    expect(theirs).toEqual({ grants: [], requests: [], events: [] });
  });
});
