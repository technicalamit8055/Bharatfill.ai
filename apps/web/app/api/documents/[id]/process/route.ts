import { z } from 'zod';
import { extractionModeSchema } from '@assistigo/ai';
import {
  checkUsageEntitlement,
  entitlementExceeded,
  notFound,
  type AllowedUploadMimeType,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { logger } from '@/lib/api/logger';
import { handler, ok } from '@/lib/api/response';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import { serverEnv } from '@/lib/env';
import { enqueueJob } from '@/lib/jobs/queue';
import { runDocumentJob } from '@/lib/jobs/runner';
import {
  SNIFF_BYTE_COUNT,
  assertDeclaredTypeMatchesBytes,
  downloadObject,
  removeObject,
} from '@/lib/documents/storage';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { DocumentRow } from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();

/**
 * The body is optional: three callers post to this route, and "read it however you normally
 * would" is a legitimate thing for any of them to say.
 *
 * `extractionMode` stays `optional` rather than defaulting, because absent and `auto` are not
 * the same instruction. Absent means "do not change how this document is read"; `auto` is a
 * choice, and a choice may overwrite the method already queued (see `claim_document_job`).
 */
const bodySchema = z.object({ extractionMode: extractionModeSchema.optional() });

/**
 * POST /api/documents/:id/process
 *
 * Confirms an upload, queues extraction, and — unless a scheduler owns the queue — runs it
 * (§17.4; docs/AI_PIPELINE.md §10).
 *
 * This is where the server stops trusting the client. The bytes were uploaded directly to
 * storage, so this is the first moment anything server-side has seen them: the magic bytes are
 * checked against the declared MIME type, and a file that lied about what it is gets deleted
 * rather than processed (docs/SECURITY.md §4).
 */
export const POST = handler(
  'api.documents.process',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.upload');

    const id = idSchema.parse((await ctx.params).id);
    const { extractionMode } = bodySchema.parse(await readBody(request));

    const { data, error } = await context.supabase
      .from('documents')
      .select('id, storage_bucket, storage_path, mime_type, status, customer_id')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('errors.not_found');

    const row = data as Pick<
      DocumentRow,
      'id' | 'storage_bucket' | 'storage_path' | 'mime_type' | 'status' | 'customer_id'
    >;

    const entitlements = await loadEntitlementContext(context);
    const extraction = checkUsageEntitlement(entitlements, 'ai_extraction');
    if (!extraction.allowed) throw entitlementExceeded(extraction.reason);

    let bytes: Uint8Array;
    try {
      bytes = await downloadObject(context.supabase, row.storage_path, row.storage_bucket);
    } catch {
      // No object at the reserved path: the browser upload never completed.
      throw notFound('errors.upload_incomplete');
    }

    try {
      assertDeclaredTypeMatchesBytes(
        bytes.subarray(0, SNIFF_BYTE_COUNT),
        row.mime_type as AllowedUploadMimeType,
      );
    } catch (mismatch) {
      // A file that is not what it claimed has no business sitting in a private bucket.
      await removeObject(context.supabase, row.storage_path, row.storage_bucket).catch(() => {
        // Best effort — the row is marked failed either way.
      });
      await context.supabase
        .from('documents')
        .update({ status: 'failed' })
        .eq('id', id)
        .eq('organization_id', context.organization.id);
      throw mismatch;
    }

    // Queue before flipping the status. The other order leaves a document stuck in `processing`
    // with no job behind it if the enqueue fails, and nothing would ever move it on.
    // Idempotent by document id: pressing Process twice does not queue two extractions.
    const job = await enqueueJob(context.supabase, {
      type: 'ocr.extract',
      organizationId: context.organization.id,
      payload: { documentId: id, extractionMode: extractionMode ?? 'auto' },
      idempotencyKey: `ocr.extract:${id}`,
    });

    const { error: statusError } = await context.supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('organization_id', context.organization.id);

    if (statusError) throw statusError;

    const status = (await runInline(id, extractionMode)) ?? 'processing';

    return ok({ documentId: id, status, queued: !job.deduplicated });
  },
);

/** An absent, empty or non-JSON body means "no options", not a bad request. */
async function readBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Runs this document's extraction job in-request and returns the status it settled on.
 *
 * Returns `null` when the job was left for the queue — either because a scheduler owns it
 * (`JOB_INLINE_RUNNER=off`), or because another worker already holds the lease.
 *
 * Nothing in here is allowed to fail the request. The job row is the source of truth: if the
 * inline attempt breaks — a missing migration, a provider outage, a lease race — the work is
 * still queued, `complete_job` still applies the backoff, and the operator still gets a document
 * that says "Reading" rather than an error on an upload that actually succeeded.
 */
async function runInline(documentId: string, extractionMode?: string): Promise<string | null> {
  if (serverEnv().JOB_INLINE_RUNNER === 'off') return null;

  const admin = createSupabaseAdminClient();

  try {
    const result = await runDocumentJob(admin, {
      documentId,
      workerId: `inline-${process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? 'local'}`,
      ...(extractionMode === undefined ? {} : { extractionMode }),
    });
    if (!result.claimed) return null;
  } catch (thrown) {
    logger.error('api.documents.process.inline_failed', {
      documentId,
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return null;
  }

  // The handler has just written the outcome; read it back so the client can route straight to
  // review instead of polling a status it already knows changed.
  const { data } = await admin
    .from('documents')
    .select('status')
    .eq('id', documentId)
    .maybeSingle();

  const status = (data as Pick<DocumentRow, 'status'> | null)?.status;
  return typeof status === 'string' ? status : null;
}
