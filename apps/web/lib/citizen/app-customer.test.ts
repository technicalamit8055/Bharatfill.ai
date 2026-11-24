/**
 * BharatDoc app accounts as ordinary customers (apps/web/lib/citizen/app-customer.ts; migration
 * 0041) against an in-memory stand-in for the service-role client: one customer row per account,
 * synced files mirrored into `customer-documents` and queued for reading, and the citizen's
 * deletes reaching the customer-side copies. Fixture ids and made-up numbers only.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIZEN_APP_ORGANIZATION_ID, DOCUMENT_BUCKET } from '@assistigo/core';

const { MASTER } = vi.hoisted(() => ({ MASTER: Buffer.alloc(32, 9).toString('base64') }));
vi.mock('../env', () => ({
  serverEnv: () => ({ VAULT_MASTER_KEY: MASTER, JOB_INLINE_RUNNER: 'off' }),
}));
vi.mock('../jobs/runner', () => ({ runDocumentJob: vi.fn(async () => ({ claimed: false })) }));

import {
  addCentreDocumentToVault,
  centreDocumentTitle,
  customerNameFrom,
  deleteAppCustomer,
  ensureAppCustomer,
  MirrorError,
  mirrorDocumentType,
  mirrorFailure,
  mirrorFilename,
  mirrorPendingDocuments,
  mirrorVaultDocument,
  mobileFromAuthPhone,
  removeMirror,
  syncAppCustomerName,
  updateMirror,
} from './app-customer';
import { newDocumentKey, unwrapDocumentKey, wrapDocumentKey } from './secrets';
import { openVaultFile, sealVaultFile } from './vault-file';

type Row = Record<string, unknown>;

/** Columns the fake database refuses on write, like a database that has not run their migration. */
let missingColumns = new Set<string>();

function fakeDb(tables: Record<string, Row[]>, objects: Map<string, Buffer>) {
  function builder(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    const rows = () => (tables[table] ??= []);
    const matching = () => rows().filter((row) => filters.every((f) => f(row)));

    function run(): { data: Row[]; error: { code: string } | null } {
      if (
        (op === 'insert' || op === 'update') &&
        Object.keys(payload).some((k) => missingColumns.has(k))
      ) {
        return { data: [], error: { code: 'PGRST204' } };
      }
      if (op === 'insert') {
        const row = { id: randomUUID(), deleted_at: null, ...payload };
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
      limit: () => api,
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => {
        const row = run().data[0];
        return row ? { data: row, error: null } : { data: null, error: new Error('no row') };
      },
      then: (resolve: (value: ReturnType<typeof run>) => unknown) => resolve(run()),
    };
    return api;
  }

  return {
    from: builder,
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          const bytes = objects.get(`${bucket}/${path}`);
          return bytes
            ? { data: new Blob([new Uint8Array(bytes)]), error: null }
            : { data: null, error: new Error('missing') };
        },
        upload: async (path: string, bytes: Buffer) => {
          objects.set(`${bucket}/${path}`, Buffer.from(bytes));
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) objects.delete(`${bucket}/${path}`);
          return { data: [], error: null };
        },
      }),
    },
  };
}

const CITIZEN = '11111111-1111-4111-8111-111111111111';
const VAULT_DOC = '33333333-3333-4333-8333-333333333333';
// Made-up demo number (the 900000000x test range), never a real person's.
const PHONE = '919000000001';
const PDF = Buffer.from('%PDF-1.4\n% DEMO ONLY - NOT A REAL DOCUMENT\n');

let tables: Record<string, Row[]>;
let objects: Map<string, Buffer>;
let db: ReturnType<typeof fakeDb>;

function seedVaultDocument(overrides: Row = {}): Row {
  const key = newDocumentKey();
  tables.citizen_vault_keys = [{ citizen_id: CITIZEN, wrapped_key: wrapDocumentKey(CITIZEN, key) }];
  const path = `citizen/${CITIZEN}/${VAULT_DOC}`;
  objects.set(`citizen-vault/${path}`, sealVaultFile(CITIZEN, VAULT_DOC, PDF, key));
  const row: Row = {
    id: VAULT_DOC,
    citizen_id: CITIZEN,
    document_type: 'income_certificate',
    title: 'Income Certificate',
    storage_path: path,
    mime_type: 'application/pdf',
    status: 'ready',
    deleted_at: null,
    mirror_document_id: null,
    ...overrides,
  };
  (tables.citizen_vault_documents ??= []).push(row);
  return row;
}

const asDb = () => db as never;

beforeEach(() => {
  missingColumns = new Set();
  objects = new Map();
  tables = {
    citizen_accounts: [{ id: CITIZEN, display_name: 'Demo Citizen', customer_id: null }],
  };
  db = fakeDb(tables, objects);
});

describe('pure helpers', () => {
  it('reads the 10-digit mobile from how Supabase Auth stores it', () => {
    expect(mobileFromAuthPhone('919000000001')).toBe('9000000001');
    expect(mobileFromAuthPhone('+91 90000 00001')).toBe('9000000001');
    expect(mobileFromAuthPhone('9000000001')).toBe('9000000001');
    expect(mobileFromAuthPhone('15550000001')).toBeNull();
    expect(mobileFromAuthPhone(null)).toBeNull();
  });

  it('gives customers.full_name its two-character minimum', () => {
    expect(customerNameFrom('  Demo Citizen ')).toBe('Demo Citizen');
    expect(customerNameFrom('D')).toBe('Customer');
  });

  it('builds a safe filename with the real extension', () => {
    expect(mirrorFilename('Income Certificate', 'application/pdf')).toBe('Income Certificate.pdf');
    expect(mirrorFilename('../../etc', 'image/jpeg')).toBe('.. .. etc.jpg');
    expect(mirrorFilename('   ', 'image/png')).toBe('Document.png');
  });

  it('keeps known document classes and maps anything else to unknown', () => {
    expect(mirrorDocumentType('marksheet_graduation')).toBe('marksheet_graduation');
    expect(mirrorDocumentType('library_card')).toBe('unknown');
  });
});

describe('ensureAppCustomer', () => {
  it('makes one customer in the BharatDoc app organization, with the verified mobile', async () => {
    const id = await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(id).toBeTruthy();
    expect(tables.customers).toHaveLength(1);
    expect(tables.customers?.[0]).toMatchObject({
      id,
      organization_id: CITIZEN_APP_ORGANIZATION_ID,
      full_name: 'Demo Citizen',
      mobile: '9000000001',
    });
    expect(tables.citizen_accounts?.[0]?.customer_id).toBe(id);
  });

  it('is idempotent: the second call returns the same customer and makes no other', async () => {
    const first = await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE });
    const second = await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(second).toBe(first);
    expect(tables.customers).toHaveLength(1);
  });

  it('makes nothing before sign-up has finished, or without a +91 number', async () => {
    expect(await ensureAppCustomer(asDb(), { citizenId: randomUUID(), phone: PHONE })).toBeNull();
    expect(await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: null })).toBeNull();
    expect(tables.customers ?? []).toHaveLength(0);
  });
});

describe('syncAppCustomerName', () => {
  it('follows the app until a centre has verified the profile', async () => {
    await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE });
    const customer = tables.customers?.[0] as Row;
    customer.verification_status = 'unverified';

    await syncAppCustomerName(asDb(), CITIZEN, 'Demo Citizen Kumar');
    expect(customer.full_name).toBe('Demo Citizen Kumar');

    customer.verification_status = 'operator_verified';
    await syncAppCustomerName(asDb(), CITIZEN, 'Changed Again');
    expect(customer.full_name).toBe('Demo Citizen Kumar');
  });
});

describe('mirrorVaultDocument', () => {
  it('decrypts the synced file into customer-documents and queues extraction', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument();

    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);

    const document = tables.documents?.find((row) => row.id === documentId) as Row;
    expect(document).toMatchObject({
      organization_id: CITIZEN_APP_ORGANIZATION_ID,
      customer_id: customerId,
      storage_bucket: DOCUMENT_BUCKET,
      mime_type: 'application/pdf',
      document_type: 'income_certificate',
      original_filename: 'Income Certificate.pdf',
      status: 'processing',
      size_bytes: PDF.length,
    });
    // Org- and customer-scoped like any upload, so 0024's storage policy covers grant holders.
    expect(String(document.storage_path)).toBe(
      `org/${CITIZEN_APP_ORGANIZATION_ID}/customer/${customerId}/${documentId}/Income_Certificate.pdf`,
    );
    // Plaintext for the pipeline, exactly what the phone encrypted.
    expect(objects.get(`${DOCUMENT_BUCKET}/${String(document.storage_path)}`)?.equals(PDF)).toBe(
      true,
    );
    expect(vault.mirror_document_id).toBe(documentId);
    expect(tables.jobs).toEqual([
      expect.objectContaining({
        organization_id: CITIZEN_APP_ORGANIZATION_ID,
        type: 'ocr.extract',
        payload: { documentId, extractionMode: 'auto' },
        idempotency_key: `ocr.extract:${documentId}`,
      }),
    ]);
  });

  it('keeps a photo or signature as it is: stored, never read', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ document_type: 'photo' });
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    expect(tables.documents?.find((row) => row.id === documentId)?.status).toBe('stored');
    expect(tables.jobs ?? []).toHaveLength(0);
  });

  it('refuses a file whose bytes are not what the phone declared', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ mime_type: 'image/jpeg' });
    await expect(
      mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never),
    ).rejects.toThrow();
    expect(tables.documents ?? []).toHaveLength(0);
    expect(vault.mirror_document_id).toBeNull();
  });

  it('never makes a second copy of a file already mirrored', async () => {
    await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE });
    seedVaultDocument();
    await mirrorPendingDocuments(asDb(), { citizenId: CITIZEN, phone: PHONE });
    await mirrorPendingDocuments(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(tables.documents).toHaveLength(1);
  });

  it('names the failing step, so a silent operator-side gap can be traced', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument();
    // The vault key was wrapped under a different VAULT_MASTER_KEY than this server's.
    tables.citizen_vault_keys = [
      {
        citizen_id: CITIZEN,
        wrapped_key: wrapDocumentKey(
          CITIZEN,
          newDocumentKey(),
          Buffer.alloc(32, 7).toString('base64'),
        ),
      },
    ];
    const thrown = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(MirrorError);
    expect(mirrorFailure(thrown)).toMatchObject({ reason: 'MirrorError', step: 'unwrap_key' });

    const mime = seedVaultDocument({ mime_type: 'image/jpeg' });
    const mimeThrown = await mirrorVaultDocument(asDb(), CITIZEN, customerId, mime as never).catch(
      (error: unknown) => error,
    );
    expect(mirrorFailure(mimeThrown)).toMatchObject({ step: 'mime_mismatch', code: null });
  });

  it('catches up an account made before 0041: customer first, then its files', async () => {
    seedVaultDocument();
    await mirrorPendingDocuments(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(tables.customers).toHaveLength(1);
    expect(tables.documents?.[0]?.customer_id).toBe(tables.customers?.[0]?.id);
  });
});

describe('folders reach the customer side (0043)', () => {
  it('files the copy in the folder the citizen picked on the phone', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ category: 'identity' });
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    expect(tables.documents?.find((row) => row.id === documentId)?.folder).toBe('identity');
  });

  it('leaves a copy in no folder when the citizen filed it in none, so it follows its type', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ category: 'other' });
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    expect(tables.documents?.find((row) => row.id === documentId)?.folder).toBeUndefined();
  });

  it('carries the folder of a file mirrored on catch-up', async () => {
    seedVaultDocument({ category: 'academic' });
    await mirrorPendingDocuments(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(tables.documents?.[0]?.folder).toBe('academic');
  });

  it('still mirrors the file on a database that has not run 0043, in the folder of its type', async () => {
    missingColumns = new Set(['folder']);
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ category: 'identity' });
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    const document = tables.documents?.find((row) => row.id === documentId);
    expect(document).toBeDefined();
    expect(document?.folder).toBeUndefined();
  });

  it('moves the copy when the citizen moves the document, and other clears it', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument({ category: 'identity' });
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    const copy = () => tables.documents?.find((row) => row.id === documentId);

    await updateMirror(asDb(), documentId, {
      category: 'certificate',
      mimeType: 'application/pdf',
    });
    expect(copy()?.folder).toBe('certificate');

    await updateMirror(asDb(), documentId, { category: 'other', mimeType: 'application/pdf' });
    expect(copy()?.folder).toBeNull();
  });

  it('still renames on a database without 0043, dropping only the move', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument();
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    missingColumns = new Set(['folder']);

    await updateMirror(asDb(), documentId, {
      title: 'Renamed',
      category: 'academic',
      mimeType: 'application/pdf',
    });
    const copy = tables.documents?.find((row) => row.id === documentId);
    expect(copy?.original_filename).toBe('Renamed.pdf');
    expect(copy?.folder).toBeUndefined();
  });
});

describe('deletes reach the customer side', () => {
  it('removes a mirrored document and its bytes', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    const vault = seedVaultDocument();
    const documentId = await mirrorVaultDocument(asDb(), CITIZEN, customerId, vault as never);
    const path = String(tables.documents?.[0]?.storage_path);

    await removeMirror(asDb(), documentId);
    expect(tables.documents).toHaveLength(0);
    expect(objects.has(`${DOCUMENT_BUCKET}/${path}`)).toBe(false);
  });

  it('account deletion removes every file and the customer row', async () => {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    await mirrorVaultDocument(asDb(), CITIZEN, customerId, seedVaultDocument() as never);
    // A visiting centre's walk-in drop for this customer (0025) goes too.
    tables.documents?.push({
      id: randomUUID(),
      organization_id: CITIZEN_APP_ORGANIZATION_ID,
      customer_id: customerId,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: 'org/x/customer/y/z/drop.pdf',
    });

    await deleteAppCustomer(asDb(), CITIZEN);
    expect(tables.documents).toHaveLength(0);
    expect(tables.customers).toHaveLength(0);
    expect([...objects.keys()].some((key) => key.startsWith(DOCUMENT_BUCKET))).toBe(false);
  });

  it('never touches a customer outside the app organization', async () => {
    tables.citizen_accounts![0]!.customer_id = 'centre-customer';
    tables.customers = [{ id: 'centre-customer', organization_id: 'some-centre' }];
    await deleteAppCustomer(asDb(), CITIZEN);
    expect(tables.customers).toHaveLength(1);
  });
});

describe('a centre adds a document for an app customer (0047)', () => {
  const CENTRE = '44444444-4444-4444-8444-444444444444';
  const OPERATOR = '55555555-5555-4555-8555-555555555555';
  const MIRROR = '66666666-6666-4666-8666-666666666666';

  async function setUp(cloudEnabled = true) {
    const customerId = (await ensureAppCustomer(asDb(), { citizenId: CITIZEN, phone: PHONE }))!;
    (tables.citizen_accounts![0] as Row).cloud_enabled = cloudEnabled;
    tables.citizen_vault_keys = [
      { citizen_id: CITIZEN, wrapped_key: wrapDocumentKey(CITIZEN, newDocumentKey()) },
    ];
    return customerId;
  }

  const input = (customerId: string) => ({
    documentId: MIRROR,
    customerId,
    bytes: PDF,
    mimeType: 'application/pdf',
    documentType: 'income_certificate',
    filename: 'Income certificate.pdf',
    centre: { organizationId: CENTRE, name: 'Demo Seva Kendra' },
    operatorId: OPERATOR,
  });

  it('seals it into the vault the phone can open, linked to the customer-side copy', async () => {
    const customerId = await setUp();
    const vaultId = (await addCentreDocumentToVault(asDb(), input(customerId)))!;

    const row = tables.citizen_vault_documents?.find((r) => r.id === vaultId) as Row;
    expect(row).toMatchObject({
      citizen_id: CITIZEN,
      status: 'ready',
      category: 'certificate',
      title: 'Income certificate',
      mirror_document_id: MIRROR,
      added_by_organization_id: CENTRE,
      added_by_centre_name: 'Demo Seva Kendra',
      size_bytes: PDF.length,
    });
    const key = unwrapDocumentKey(CITIZEN, String(tables.citizen_vault_keys![0]!.wrapped_key));
    const sealed = objects.get(`citizen-vault/${String(row.storage_path)}`)!;
    expect(openVaultFile(CITIZEN, vaultId, sealed, key).equals(PDF)).toBe(true);
    expect(tables.vault_access_events).toEqual([
      expect.objectContaining({ action: 'added', organization_id: CENTRE, document_id: vaultId }),
    ]);

    // Already linked: the catch-up mirror never copies it back to the customer side.
    await mirrorPendingDocuments(asDb(), { citizenId: CITIZEN, phone: PHONE });
    expect(tables.documents ?? []).toHaveLength(0);
  });

  it('adds nothing when the citizen has turned cloud backup off', async () => {
    const customerId = await setUp(false);
    expect(await addCentreDocumentToVault(asDb(), input(customerId))).toBeNull();
    expect(tables.citizen_vault_documents ?? []).toHaveLength(0);
  });

  it('files an untyped upload as Other and titles it from the filename', async () => {
    const customerId = await setUp();
    const vaultId = await addCentreDocumentToVault(asDb(), {
      ...input(customerId),
      documentType: 'unknown',
      filename: 'scan_0001.JPG',
    });
    const row = tables.citizen_vault_documents?.find((r) => r.id === vaultId) as Row;
    expect(row).toMatchObject({ document_type: 'generic', category: 'other' });
    expect(centreDocumentTitle('scan_0001.JPG')).toBe('scan_0001');
  });
});
