import 'server-only';

import type { ExtractionMode } from '@assistigo/ai';
import {
  checkUsageEntitlement,
  conflict,
  entitlementExceeded,
  isDocumentType,
  notFound,
  type AllowedUploadMimeType,
} from '@assistigo/core';
import type { RequestContext } from '../api/context';
import { logger } from '../api/logger';
import { loadEntitlementContext } from '../billing/entitlements';
import { serverEnv } from '../env';
import { enqueueJob } from '../jobs/queue';
import { runDocumentJob } from '../jobs/runner';
import { createSupabaseAdminClient } from '../supabase/server';
import type { DocumentRow } from '../supabase/database.types';
import {
  SNIFF_BYTE_COUNT,
  assertDeclaredTypeMatchesBytes,
  downloadObject,
  removeObject,
} from './storage';

export type ProcessDocumentOptions = {
  /**
   * Absent means "do not change how this document is read"; `auto` is a choice, and a choice may
   * overwrite the method already queued (see `claim_document_job`).
   */
  extractionMode?: ExtractionMode | undefined;
  /**
   * Keep the file without reading it: a photo or signature (the upload forms always ask), or any
   * document the operator ticked "Just save — don't read" for. The document must carry a real
   * type — detecting one is itself a read — and a reading method sent alongside is ignored.
   * "Read again" on the document page can still read it later.
   */
  storeOnly?: boolean | undefined;
};

export type ProcessDocumentResult = { documentId: string; status: string; queued: boolean };

type ProcessableRow = Pick<
  DocumentRow,
  | 'id'
  | 'storage_bucket'
  | 'storage_path'
  | 'mime_type'
  | 'status'
  | 'customer_id'
  | 'document_type'
>;

/**
 * Confirms an upload, then either queues extraction and — unless a scheduler owns the queue —
 * runs it (§17.4; docs/AI_PIPELINE.md §10), or, for a document the operator asked to keep as it
 * is, files it as `stored` without any reader seeing it (§12.4).
 *
 * This is where the server stops trusting the client. The bytes were uploaded directly to
 * storage, so this is the first moment anything server-side has seen them: the magic bytes are
 * checked against the declared MIME type, and a file that lied about what it is gets deleted
 * rather than processed (docs/SECURITY.md §4). A store-only upload goes through that check like
 * any other; skipping the read is not skipping the verification.
 */
export async function processDocument(
  context: RequestContext,
  documentId: string,
  options: ProcessDocumentOptions = {},
): Promise<ProcessDocumentResult> {
  const { data, error } = await context.supabase
    .from('documents')
    .select('id, storage_bucket, storage_path, mime_type, status, customer_id, document_type')
    .eq('id', documentId)
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('errors.not_found');

  const row = data as ProcessableRow;
  const storeOnly = options.storeOnly === true;

  // Refused before a byte is downloaded. An untyped file kept unread would sit under "Other"
  // with nothing saying what it is, so the type is the one thing a kept file must carry. Its
  // status ("Saved") and the document page say it was never read; "Read again" is one click.
  if (storeOnly && (!isDocumentType(row.document_type) || row.document_type === 'unknown')) {
    throw conflict('documents.errors.storeOnlyType');
  }

  // A file that is never read uses no extraction, so it needs none of the quota; its storage was
  // already checked when the upload was reserved.
  if (!storeOnly) {
    const entitlements = await loadEntitlementContext(context);
    const extraction = checkUsageEntitlement(entitlements, 'ai_extraction');
    if (!extraction.allowed) throw entitlementExceeded(extraction.reason);
  }

  await assertUploadIsWhatItClaims(context, row);

  if (storeOnly) {
    return { documentId, status: await markStored(context, documentId), queued: false };
  }

  // Queue before flipping the status. The other order leaves a document stuck in `processing`
  // with no job behind it if the enqueue fails, and nothing would ever move it on.
  // Idempotent by document id: pressing Process twice does not queue two extractions.
  const job = await enqueueJob(context.supabase, {
    type: 'ocr.extract',
    organizationId: context.organization.id,
    payload: { documentId, extractionMode: options.extractionMode ?? 'auto' },
    idempotencyKey: `ocr.extract:${documentId}`,
  });

  const { error: statusError } = await context.supabase
    .from('documents')
    .update({ status: 'processing' })
    .eq('id', documentId)
    .eq('organization_id', context.organization.id);

  if (statusError) throw statusError;

  const status = (await runInline(documentId, options.extractionMode)) ?? 'processing';

  return { documentId, status, queued: !job.deduplicated };
}

async function assertUploadIsWhatItClaims(
  context: RequestContext,
  row: ProcessableRow,
): Promise<void> {
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
      .eq('id', row.id)
      .eq('organization_id', context.organization.id);
    throw mismatch;
  }
}

/**
 * Files the document as `stored` and returns the status actually written.
 *
 * A database that has not run 0034 refuses that status (`23514`). The file is then kept unread
 * under `extracted`, the nearest status the old check admits, rather than handing the operator
 * an error for an upload that worked — the same tolerance `ocr-extract` has for 0019.
 */
async function markStored(context: RequestContext, documentId: string): Promise<string> {
  const setStatus = (status: 'stored' | 'extracted') =>
    context.supabase
      .from('documents')
      .update({ status })
      .eq('id', documentId)
      .eq('organization_id', context.organization.id);

  const { error } = await setStatus('stored');
  if (!error) return 'stored';
  if (error.code !== '23514') throw error;

  logger.warn('api.documents.process.stored_status_constraint_fallback', { documentId });
  const { error: fallbackError } = await setStatus('extracted');
  if (fallbackError) throw fallbackError;
  return 'extracted';
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
async function runInline(
  documentId: string,
  extractionMode?: ExtractionMode,
): Promise<string | null> {
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
