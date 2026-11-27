/**
 * Document sync service (apps/web/lib/citizen/documents.ts) against an in-memory stand-in for
 * the service-role client: the rules that RLS cannot test because the service role bypasses it —
 * the device proof, the sync-off switch, upload verification, and per-citizen scoping.
 * Fixture ids only; no real citizen data.
 */

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CITIZEN_DEVICE_HEADER, VAULT_FILE_OVERHEAD_BYTES, isAppError } from '@assistigo/core';
import type { CitizenContext } from './context';
import {
  confirmUpload,
  createUploadIntent,
  deleteVaultDocument,
  listVaultDocuments,
  touchDevice,
} from './documents';

type Row = Record<string, unknown>;

/** Just enough of supabase-js's query builder for documents.ts. */
function fakeAdmin(tables: Record<string, Row[]>, objects: Map<string, Buffer>) {
  function builder(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    const rows = () => (tables[table] ??= []);
    const matching = () => rows().filter((row) => filters.every((f) => f(row)));

    function run(): { data: Row[]; error: null } {
      if (op === 'insert') {
        const row = { created_at: 'now', updated_at: 'now', deleted_at: null, ...payload };
        rows().push(row);
        return { data: [row], error: null };
      }
      if (op === 'update') {
        const hit = matching();
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        const hit = matching();
        tables[table] = rows().filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      }
      return { data: matching(), error: null };
    }

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
      order: () => api,
      limit: () => api,
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
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.test/upload/${path}?token=t`, path, token: 't' },
          error: null,
        }),
        download: async (path: string) => {
          const bytes = objects.get(path);
          return bytes
            ? { data: new Blob([new Uint8Array(bytes)]), error: null }
            : { data: null, error: new Error('missing') };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) objects.delete(path);
          return { data: [], error: null };
        },
      }),
    },
  };
}

const CITIZEN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEVICE = '33333333-3333-4333-8333-333333333333';
const OTHER_DEVICE = '44444444-4444-4444-8444-444444444444';

let tables: Record<string, Row[]>;
let objects: Map<string, Buffer>;
let context: CitizenContext;

function request(device: string | null): Request {
  return new Request('https://app.test/api/citizen/documents', {
    headers: device ? { [CITIZEN_DEVICE_HEADER]: device } : {},
  });
}

async function messageKeyOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return isAppError(error) ? error.messageKey : 'not-an-app-error';
  }
}

const INTENT = {
  documentType: 'marksheet_10' as const,
  title: 'Demo marksheet',
  mimeType: 'application/pdf' as const,
  sizeBytes: 100,
  pageCount: 2,
};

beforeEach(() => {
  tables = {
    citizen_accounts: [{ id: CITIZEN, cloud_enabled: true, last_active_at: 'before' }],
    citizen_devices: [
      { id: DEVICE, citizen_id: CITIZEN, revoked_at: null, last_seen_at: 'before' },
      { id: OTHER_DEVICE, citizen_id: OTHER, revoked_at: null, last_seen_at: 'before' },
    ],
    citizen_vault_documents: [],
  };
  objects = new Map();
  const admin = fakeAdmin(tables, objects);
  context = {
    citizenId: CITIZEN,
    phone: null,
    supabase: admin as unknown as CitizenContext['supabase'],
    admin: admin as unknown as CitizenContext['admin'],
    ipAddress: null,
    userAgent: null,
  };
});

describe('touchDevice', () => {
  it('accepts this citizen’s own phone and records activity', async () => {
    expect(await touchDevice(context, request(DEVICE))).toBe(DEVICE);
    expect(tables.citizen_accounts?.[0]?.last_active_at).not.toBe('before');
  });

  it('refuses no header, another citizen’s phone, or a revoked phone — without counting activity', async () => {
    expect(await messageKeyOf(touchDevice(context, request(null)))).toBe(
      'errors.vault.device_unknown',
    );
    expect(await messageKeyOf(touchDevice(context, request(OTHER_DEVICE)))).toBe(
      'errors.vault.device_unknown',
    );
    tables.citizen_devices![0]!.revoked_at = 'yesterday';
    expect(await messageKeyOf(touchDevice(context, request(DEVICE)))).toBe(
      'errors.vault.device_unknown',
    );
    expect(tables.citizen_accounts?.[0]?.last_active_at).toBe('before');
  });
});

describe('upload', () => {
  it('creates a pending row in the citizen’s own folder and a signed upload URL', async () => {
    const intent = await createUploadIntent(context, INTENT);
    expect(intent.document.status).toBe('pending');
    expect(intent.document.category).toBe('academic');
    const row = tables.citizen_vault_documents?.[0];
    expect(row?.storage_path).toBe(`citizen/${CITIZEN}/${intent.document.id}`);
    expect(intent.uploadUrl).toContain(`citizen/${CITIZEN}/`);
  });

  it('refuses when the citizen turned cloud backup off', async () => {
    tables.citizen_accounts![0]!.cloud_enabled = false;
    expect(await messageKeyOf(createUploadIntent(context, INTENT))).toBe('errors.vault.sync_off');
    expect(tables.citizen_vault_documents).toHaveLength(0);
  });

  it('marks the document ready when length and SHA-256 match', async () => {
    const { document } = await createUploadIntent(context, INTENT);
    const sealed = Buffer.alloc(INTENT.sizeBytes + VAULT_FILE_OVERHEAD_BYTES, 7);
    objects.set(`citizen/${CITIZEN}/${document.id}`, sealed);
    const sha = createHash('sha256').update(sealed).digest('hex');

    const confirmed = await confirmUpload(context, document.id, sha);
    expect(confirmed.status).toBe('ready');
    expect(tables.citizen_vault_documents?.[0]?.sha256).toBe(sha);
  });

  it('tells the phone when no centre can use the file yet, and once one can', async () => {
    const { document } = await createUploadIntent(context, INTENT);
    expect(document.centreReady).toBe(false);
    const sealed = Buffer.alloc(INTENT.sizeBytes + VAULT_FILE_OVERHEAD_BYTES, 7);
    objects.set(`citizen/${CITIZEN}/${document.id}`, sealed);
    const sha = createHash('sha256').update(sealed).digest('hex');

    // This stand-in has no customer row to copy into, so the customer-side copy fails.
    const confirmed = await confirmUpload(context, document.id, sha);
    expect(confirmed.centreReady).toBe(false);
    expect((await listVaultDocuments(context))[0]?.centreReady).toBe(false);

    tables.citizen_vault_documents![0]!.mirror_document_id = '66666666-6666-4666-8666-666666666666';
    expect((await listVaultDocuments(context))[0]?.centreReady).toBe(true);
  });

  it('removes both row and bytes when the upload does not match', async () => {
    const { document } = await createUploadIntent(context, INTENT);
    const path = `citizen/${CITIZEN}/${document.id}`;
    objects.set(path, Buffer.alloc(10));

    expect(await messageKeyOf(confirmUpload(context, document.id, 'a'.repeat(64)))).toBe(
      'errors.vault.upload_mismatch',
    );
    expect(objects.has(path)).toBe(false);
    expect(tables.citizen_vault_documents).toHaveLength(0);
  });

  it('cannot confirm, list or delete another citizen’s document', async () => {
    tables.citizen_vault_documents!.push({
      id: '55555555-5555-4555-8555-555555555555',
      citizen_id: OTHER,
      storage_path: `citizen/${OTHER}/55555555-5555-4555-8555-555555555555`,
      size_bytes: 1,
      status: 'pending',
      deleted_at: null,
    });
    expect(await listVaultDocuments(context)).toHaveLength(0);
    expect(
      await messageKeyOf(
        confirmUpload(context, '55555555-5555-4555-8555-555555555555', 'a'.repeat(64)),
      ),
    ).toBe('errors.vault.document_missing');
    expect(
      await messageKeyOf(deleteVaultDocument(context, '55555555-5555-4555-8555-555555555555')),
    ).toBe('errors.vault.document_missing');
  });
});

describe('delete', () => {
  it('hides the row at once and removes the bytes', async () => {
    const { document } = await createUploadIntent(context, INTENT);
    const path = `citizen/${CITIZEN}/${document.id}`;
    objects.set(path, Buffer.alloc(1));
    await deleteVaultDocument(context, document.id);
    expect(objects.has(path)).toBe(false);
    expect(await listVaultDocuments(context)).toHaveLength(0);
  });
});
