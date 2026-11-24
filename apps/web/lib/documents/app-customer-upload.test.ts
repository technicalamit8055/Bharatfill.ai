/**
 * Who may upload for a BharatDoc app customer, and what processing does (migration 0047).
 * The gate is the database's answer to the operator's own JWT. Fixture ids only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIZEN_APP_ORGANIZATION_ID } from '@assistigo/core';

const { addCopy, queue, route } = vi.hoisted(() => ({
  addCopy: vi.fn(),
  queue: vi.fn(),
  route: { context: null as unknown, admin: null as unknown },
}));
vi.mock('../citizen/app-customer', () => ({
  addCentreDocumentToVault: addCopy,
  queueExtraction: queue,
  mirrorFailure: () => ({ reason: 'MirrorError', step: 'unwrap_key', code: null }),
}));
vi.mock('@/lib/api/context', () => ({
  resolveContext: async () => route.context,
  requirePermission: () => undefined,
}));
vi.mock('@/lib/api/audit', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseAdminClient: () => route.admin }));

// The route's other imports are the real modules; unit tests have no `@/` alias.
vi.mock('@/lib/api/response', () => vi.importActual('../api/response'));
vi.mock('@/lib/documents/schema', () => vi.importActual('./schema'));
vi.mock('@/lib/documents/storage', () => vi.importActual('./storage'));
vi.mock('@/lib/documents/app-customer-upload', () => vi.importActual('./app-customer-upload'));
vi.mock('@/lib/billing/entitlements', () => ({ loadEntitlementContext: vi.fn() }));

import { POST as reserveRoute } from '../../app/api/documents/upload-intent/route';
import {
  canUploadForAppCustomer,
  loadOwnAppCustomerUpload,
  processAppCustomerUpload,
} from './app-customer-upload';

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const COLLEAGUE = '22222222-2222-4222-8222-222222222222';
const CENTRE = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const DOCUMENT = '55555555-5555-4555-8555-555555555555';
const PDF = Buffer.from('%PDF-1.4\n% DEMO ONLY - NOT A REAL DOCUMENT\n');

type Row = Record<string, unknown>;

function fakeAdmin(rows: Row[], bytes: Buffer | null = PDF) {
  const removed: string[] = [];
  const from = () => {
    const filters: [string, unknown][] = [];
    let patch: Row | null = null;
    const run = () => {
      const hits = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      if (patch) for (const row of hits) Object.assign(row, patch);
      return hits;
    };
    const query = {
      select: () => query,
      insert: async (row: Row) => {
        rows.push(row);
        return { error: null };
      },
      update: (values: Row) => {
        patch = values;
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      is: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: run(), error: null }),
    };
    return query;
  };
  const storage = {
    from: () => ({
      download: async () =>
        bytes
          ? { data: new Blob([new Uint8Array(bytes)]), error: null }
          : { data: null, error: new Error('missing') },
      remove: async (paths: string[]) => {
        removed.push(...paths);
        return { error: null };
      },
      createSignedUploadUrl: async () => ({
        data: { signedUrl: 'https://storage.test/put', token: 'token' },
        error: null,
      }),
    }),
  };
  return { client: { from, storage } as never, removed };
}

function caller(granted: boolean, userId = OPERATOR) {
  const rpc = vi.fn(async () => ({ data: granted, error: null as unknown }));
  // Not one of the centre's own customers.
  const none: Record<string, unknown> = {
    select: () => none,
    eq: () => none,
    is: () => none,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const supabase = { rpc, from: () => none } as never;
  const context = {
    supabase,
    userId,
    organization: { id: CENTRE, name: 'Demo Seva Kendra' },
  } as never;
  return { context, supabase, rpc };
}

function upload(overrides: Row = {}): Row {
  return {
    id: DOCUMENT,
    organization_id: CITIZEN_APP_ORGANIZATION_ID,
    customer_id: CUSTOMER,
    storage_bucket: 'customer-documents',
    storage_path: 'org/demo/file.pdf',
    mime_type: 'application/pdf',
    status: 'uploaded',
    document_type: 'income_certificate',
    original_filename: 'Demo.pdf',
    uploaded_by: OPERATOR,
    deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  addCopy.mockReset().mockResolvedValue('vault-id');
  queue.mockReset();
});

describe('reserving an upload (route)', () => {
  const reserve = async (granted: boolean) => {
    const rows: Row[] = [];
    route.context = caller(granted).context;
    route.admin = fakeAdmin(rows).client;
    const response = await reserveRoute(
      new Request('http://localhost/api/documents/upload-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'Demo.pdf',
          mimeType: 'application/pdf',
          sizeBytes: PDF.length,
          customerId: CUSTOMER,
        }),
      }) as never,
    );
    return { rows, status: response.status };
  };

  it('is a 404 that writes nothing without a live grant', async () => {
    expect(await reserve(false)).toEqual({ rows: [], status: 404 });
  });

  it('writes one app-organization row in the operator’s name with a grant', async () => {
    const { rows, status } = await reserve(true);
    expect(status).toBe(201);
    expect(rows).toEqual([
      expect.objectContaining({
        organization_id: CITIZEN_APP_ORGANIZATION_ID,
        customer_id: CUSTOMER,
        uploaded_by: OPERATOR,
        status: 'uploaded',
      }),
    ]);
  });
});

describe('the gate', () => {
  it('asks the database with the operator’s own client, about this customer', async () => {
    const { supabase, rpc } = caller(true);
    expect(await canUploadForAppCustomer(supabase, CUSTOMER)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_review_app_customer', { p_customer_id: CUSTOMER });
  });

  it('fails closed when the check errors', async () => {
    const { supabase, rpc } = caller(true);
    rpc.mockResolvedValueOnce({ data: true, error: new Error('down') });
    await expect(canUploadForAppCustomer(supabase, CUSTOMER)).rejects.toThrow('down');
  });

  it.each([
    ['the grant has ended since reserving', false, OPERATOR, {}],
    ['a colleague reserved it', true, COLLEAGUE, {}],
    ['it belongs to another centre', true, OPERATOR, { organization_id: CENTRE }],
    ['it has no customer', true, OPERATOR, { customer_id: null }],
    ['it was deleted', true, OPERATOR, { deleted_at: '2026-11-24T00:00:00Z' }],
  ])('refuses to process when %s', async (_why, granted, userId, overrides) => {
    const { client } = fakeAdmin([upload(overrides)]);
    const { context } = caller(granted, userId);
    expect(await loadOwnAppCustomerUpload(context, client, DOCUMENT)).toBeNull();
  });

  it('lets the operator who reserved it process it while the grant is live', async () => {
    const { client } = fakeAdmin([upload()]);
    const { context } = caller(true);
    expect((await loadOwnAppCustomerUpload(context, client, DOCUMENT))?.id).toBe(DOCUMENT);
  });
});

describe('processing', () => {
  const run = (row: Row, bytes: Buffer | null = PDF, options = {}) => {
    const admin = fakeAdmin([row], bytes);
    const result = processAppCustomerUpload(
      caller(true).context,
      admin.client,
      { ...row } as never,
      options,
    );
    return { result, admin };
  };

  it('says the app got a copy', async () => {
    expect(await run(upload()).result).toMatchObject({ appCopy: 'added', queued: true });
    expect(queue).toHaveBeenCalledOnce();
  });

  it('answers the same for backup off and a failed copy, and still reads the file', async () => {
    addCopy.mockResolvedValueOnce(null);
    const off = await run(upload()).result;
    addCopy.mockRejectedValueOnce(new Error('wrong key'));
    const failed = await run(upload()).result;
    expect(off).toEqual(failed);
    expect(failed).toMatchObject({ appCopy: 'not_added', queued: true });
    expect(queue).toHaveBeenCalledTimes(2);
  });

  it('two presses at once seal one copy', async () => {
    const row = upload();
    const { client } = fakeAdmin([row]);
    const snapshot = { ...row } as never;
    const press = () => processAppCustomerUpload(caller(true).context, client, snapshot, {});
    await Promise.all([press(), press()]);
    expect(addCopy).toHaveBeenCalledOnce();
    expect(queue).toHaveBeenCalledOnce();
  });

  it('deletes a file that is not what it claimed, and sends nothing to the app', async () => {
    const row = upload();
    const { result, admin } = run(row, Buffer.from('<html>not a pdf</html>'));
    await expect(result).rejects.toMatchObject({ messageKey: 'errors.file_type_mismatch' });
    expect(row.status).toBe('failed');
    expect(admin.removed).toEqual(['org/demo/file.pdf']);
    expect(addCopy).not.toHaveBeenCalled();
  });

  it('refuses an upload whose bytes never arrived', async () => {
    await expect(run(upload(), null).result).rejects.toMatchObject({
      messageKey: 'errors.upload_incomplete',
    });
    expect(addCopy).not.toHaveBeenCalled();
  });

  it('keeps a file unread when asked', async () => {
    expect(await run(upload(), PDF, { storeOnly: true }).result).toMatchObject({
      status: 'stored',
      appCopy: 'added',
    });
    expect(queue).not.toHaveBeenCalled();
  });
});
