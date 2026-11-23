/**
 * Tests for confirming an upload (`POST /api/documents/:id/process`).
 *
 * The property worth pinning down is the store-only path (§12.4): a document the operator asked
 * to keep as it is — always a photo or signature, and any typed document when they tick "Just
 * save — don't read" — must reach no reader at all — no job queued, no inline run, no extraction
 * quota — while still getting the same magic-byte check as every other upload. And it has to stay
 * the operator's choice: a document that merely *says* `photo` (the classifier calls every
 * textless image that) must still be read when someone asks for it.
 *
 * The Supabase stub answers only the calls `processDocument` makes; a general-purpose fake would
 * be a second implementation to keep in sync.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, type EntitlementContext } from '@assistigo/core';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
// On, so the read-path tests prove the inline runner is reachable and its absence on the
// store-only path means something.
process.env.JOB_INLINE_RUNNER = 'on';

const enqueueJob = vi.fn(async (..._args: unknown[]) => ({ deduplicated: false }));
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: unknown[]) => enqueueJob(...args),
}));

const runDocumentJob = vi.fn(async (..._args: unknown[]) => ({ claimed: true }));
vi.mock('../jobs/runner', () => ({
  runDocumentJob: (...args: unknown[]) => runDocumentJob(...args),
}));

const FREE_PLAN_WITH_QUOTA: EntitlementContext = {
  planCode: 'free',
  subscriptionStatus: null,
  usage: {},
  seatsInUse: 1,
  customerCount: 0,
  storageUsedMb: 0,
};
// The free plan includes ten AI extractions a period.
const FREE_PLAN_EXHAUSTED: EntitlementContext = {
  ...FREE_PLAN_WITH_QUOTA,
  usage: { ai_extraction: 10 },
};

const loadEntitlementContext = vi.fn(async (..._args: unknown[]) => FREE_PLAN_WITH_QUOTA);
vi.mock('../billing/entitlements', () => ({
  loadEntitlementContext: (...args: unknown[]) => loadEntitlementContext(...args),
}));

// What the inline runner's admin client reads back once the job has run.
vi.mock('../supabase/server', () => ({
  createSupabaseAdminClient: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: { status: 'review_required' }, error: null }),
    };
    return { from: () => chain };
  },
}));

const { processDocument } = await import('./process');

const ORG = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(28).fill(0)]);
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n'.padEnd(32, ' '));

type Capture = { updates: Record<string, unknown>[]; downloads: string[]; removals: string[] };

type UpdateResult = { error: { code: string } | null };
type UpdateStep = Promise<UpdateResult> & { eq: () => UpdateStep };

function stubContext(
  document: { document_type: string; mime_type?: string },
  bytes = JPEG_BYTES,
  /** Statuses the database's check constraint does not admit yet. */
  refusedStatuses: string[] = [],
) {
  const capture: Capture = { updates: [], downloads: [], removals: [] };
  const row = {
    id: DOCUMENT,
    storage_bucket: 'customer-documents',
    storage_path: `org/${ORG}/customer/c/${DOCUMENT}/upload.jpg`,
    mime_type: document.mime_type ?? 'image/jpeg',
    status: 'uploaded',
    customer_id: null,
    document_type: document.document_type,
  };

  const supabase = {
    from() {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        update(payload: Record<string, unknown>) {
          capture.updates.push(payload);
          const result: UpdateResult = refusedStatuses.includes(String(payload.status))
            ? { error: { code: '23514' } }
            : { error: null };
          const step: UpdateStep = Object.assign(Promise.resolve(result), {
            eq: (): UpdateStep => step,
          });
          return step;
        },
      };
      return chain;
    },
    storage: {
      from: () => ({
        download: (path: string) => {
          capture.downloads.push(path);
          return Promise.resolve({
            data: { arrayBuffer: () => Promise.resolve(bytes.slice().buffer) },
            error: null,
          });
        },
        remove: (paths: string[]) => {
          capture.removals.push(...paths);
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };

  const context = { supabase, organization: { id: ORG }, userId: 'user-1' };
  return { context: context as unknown as Parameters<typeof processDocument>[0], capture };
}

beforeEach(() => {
  enqueueJob.mockClear();
  runDocumentJob.mockClear();
  loadEntitlementContext.mockClear();
  loadEntitlementContext.mockImplementation(async () => FREE_PLAN_WITH_QUOTA);
});

describe('processDocument — store only', () => {
  it.each(['photo', 'signature'])('keeps a %s without any reader seeing it', async (type) => {
    const { context, capture } = stubContext({ document_type: type });

    const result = await processDocument(context, DOCUMENT, { storeOnly: true });

    expect(result).toEqual({ documentId: DOCUMENT, status: 'stored', queued: false });
    expect(capture.updates).toEqual([{ status: 'stored' }]);
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(runDocumentJob).not.toHaveBeenCalled();
  });

  it('ignores a reading method sent alongside it — there is nothing to read', async () => {
    const { context, capture } = stubContext({ document_type: 'photo' });

    await processDocument(context, DOCUMENT, { storeOnly: true, extractionMode: 'ai' });

    expect(capture.updates).toEqual([{ status: 'stored' }]);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('needs no extraction quota, so a workspace that has run out can still save a photo', async () => {
    loadEntitlementContext.mockImplementation(async () => FREE_PLAN_EXHAUSTED);
    const { context } = stubContext({ document_type: 'signature' });

    await expect(processDocument(context, DOCUMENT, { storeOnly: true })).resolves.toMatchObject({
      status: 'stored',
    });
  });

  it('still keeps the file unread on a database that has not run 0034', async () => {
    const { context, capture } = stubContext({ document_type: 'photo' }, JPEG_BYTES, ['stored']);

    const result = await processDocument(context, DOCUMENT, { storeOnly: true });

    expect(capture.updates).toEqual([{ status: 'stored' }, { status: 'extracted' }]);
    expect(result).toEqual({ documentId: DOCUMENT, status: 'extracted', queued: false });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(runDocumentJob).not.toHaveBeenCalled();
  });

  it('still checks the bytes, and deletes a file that lied about what it is', async () => {
    // Declared a JPEG, but the bytes are a PDF.
    const { context, capture } = stubContext({ document_type: 'photo' }, PDF_BYTES);

    await expect(processDocument(context, DOCUMENT, { storeOnly: true })).rejects.toMatchObject({
      messageKey: 'errors.file_type_mismatch',
    });
    expect(capture.removals).toHaveLength(1);
    expect(capture.updates).toEqual([{ status: 'failed' }]);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  // "Just save — don't read" (product owner, 2026-11-23): any typed document the operator only
  // needs to keep — a passport copy, an old receipt — is saved unread when they ask for it.
  it.each(['aadhaar_like', 'marksheet_10', 'receipt', 'generic'])(
    'keeps a %s unread when the operator asks, with no reader and no quota',
    async (type) => {
      loadEntitlementContext.mockImplementation(async () => FREE_PLAN_EXHAUSTED);
      const { context, capture } = stubContext({ document_type: type });

      const result = await processDocument(context, DOCUMENT, { storeOnly: true });

      expect(result).toEqual({ documentId: DOCUMENT, status: 'stored', queued: false });
      expect(capture.downloads).toHaveLength(1);
      expect(capture.updates).toEqual([{ status: 'stored' }]);
      expect(enqueueJob).not.toHaveBeenCalled();
      expect(runDocumentJob).not.toHaveBeenCalled();
    },
  );

  it.each(['unknown', ''])(
    'refuses to file an untyped document (%j) unread, before downloading anything',
    async (type) => {
      // Detecting the type is itself a read; a file kept unread must say what it is.
      const { context, capture } = stubContext({ document_type: type });

      const attempt = processDocument(context, DOCUMENT, { storeOnly: true });

      await expect(attempt).rejects.toBeInstanceOf(AppError);
      await expect(attempt).rejects.toMatchObject({
        code: 'CONFLICT',
        messageKey: 'documents.errors.storeOnlyType',
      });
      expect(capture.downloads).toHaveLength(0);
      expect(capture.updates).toHaveLength(0);
      expect(enqueueJob).not.toHaveBeenCalled();
    },
  );
});

describe('processDocument — reading', () => {
  it('reads a document whose type says photo when nobody asked to store it', async () => {
    // The classifier labels every textless image `photo`, so "Read again" on one must still read.
    const { context, capture } = stubContext({ document_type: 'photo' });

    const result = await processDocument(context, DOCUMENT, { extractionMode: 'ai' });

    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob.mock.calls[0]?.[1]).toMatchObject({
      type: 'ocr.extract',
      payload: { documentId: DOCUMENT, extractionMode: 'ai' },
    });
    expect(runDocumentJob).toHaveBeenCalledTimes(1);
    expect(capture.updates).toEqual([{ status: 'processing' }]);
    expect(result).toEqual({ documentId: DOCUMENT, status: 'review_required', queued: true });
  });

  it('still needs extraction quota to read', async () => {
    loadEntitlementContext.mockImplementation(async () => FREE_PLAN_EXHAUSTED);
    const { context } = stubContext({ document_type: 'aadhaar_like' });

    await expect(processDocument(context, DOCUMENT, {})).rejects.toMatchObject({
      messageKey: 'billing.limit.ai_extractions',
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
