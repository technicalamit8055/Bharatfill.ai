import 'server-only';

import { logger } from '../api/logger';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { JobRow } from '../supabase/database.types';
import { handleOcrExtract } from './handlers/ocr-extract';
import type { JobType } from './queue';

/**
 * The job worker.
 * Master spec §17.5; docs/ARCHITECTURE.md §7.
 *
 * Two entry points, one execution path:
 *
 *   - `runPendingJobs` is the scheduler's. It claims a batch under a lease (`claim_jobs`) in
 *     run order, across organizations.
 *   - `runDocumentJob` is a request's. It claims only the extraction job for the document being
 *     processed (`claim_document_job`), so an operator's upload never waits on someone else's
 *     work. This is what makes a document stop saying "Reading" without a scheduler configured
 *     (docs/AI_PIPELINE.md §10).
 *
 * Both report the outcome back through `complete_job`, which applies the retry/backoff policy in
 * SQL. A crashed worker's jobs come back on their own when the lease expires — no external
 * queue, no orphan locks.
 *
 * Runs with the service-role client, which is a permitted caller (docs/SECURITY.md §2).
 */

type JobHandler = (
  supabase: AssistigoSupabaseClient,
  payload: unknown,
) => Promise<{ ok: true } | { ok: false; error: string }>;

const HANDLERS: Partial<Record<JobType, JobHandler>> = {
  'ocr.extract': handleOcrExtract,
};

export type RunJobsResult = {
  claimed: number;
  completed: number;
  failed: number;
};

/**
 * Runs one already-claimed job and reports it complete.
 *
 * Never throws: a handler that blows up is a failed job, not a failed worker, and the next job
 * in the batch still deserves to run.
 */
async function runClaimedJob(
  supabase: AssistigoSupabaseClient,
  job: JobRow,
): Promise<{ ok: boolean }> {
  const handler = HANDLERS[job.type as JobType];

  if (!handler) {
    // An unroutable job would otherwise retry until it exhausted its attempts, quietly.
    await supabase.rpc('complete_job', {
      job_id: job.id,
      ok: false,
      error_text: `no handler for type ${job.type}`,
    });
    return { ok: false };
  }

  try {
    const result = await handler(supabase, job.payload);
    await supabase.rpc('complete_job', {
      job_id: job.id,
      ok: result.ok,
      error_text: result.ok ? null : result.error,
    });
    return { ok: result.ok };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : 'unknown';
    await supabase.rpc('complete_job', { job_id: job.id, ok: false, error_text: message });
    logger.error('jobs.handler_threw', { jobId: job.id, type: job.type, reason: message });
    return { ok: false };
  }
}

export async function runPendingJobs(
  supabase: AssistigoSupabaseClient,
  options: { workerId: string; batchSize?: number; leaseSeconds?: number },
): Promise<RunJobsResult> {
  const { data, error } = await supabase.rpc('claim_jobs', {
    worker_id: options.workerId,
    batch_size: options.batchSize ?? 5,
    lease_seconds: options.leaseSeconds ?? 120,
  });

  if (error) throw error;

  const jobs = (data ?? []) as JobRow[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await runClaimedJob(supabase, job);
    if (result.ok) completed += 1;
    else failed += 1;
  }

  return { claimed: jobs.length, completed, failed };
}

/** No claimable `ocr.extract` job for this document — already done, or already running. */
type JobNotClaimed = { claimed: false };

export type RunDocumentJobResult = JobNotClaimed | { claimed: true; ok: boolean };

/**
 * Claims and runs the extraction job for one document, in the caller's request.
 *
 * Returns `{ claimed: false }` rather than throwing when there is nothing to claim: another
 * worker holding the lease, or a job that already completed, are both ordinary. The caller
 * treats this as "leave it to the queue".
 */
export async function runDocumentJob(
  supabase: AssistigoSupabaseClient,
  options: {
    documentId: string;
    workerId: string;
    leaseSeconds?: number;
    /**
     * Overwrites the queued job's reading method as part of the claim. Pass it only when the
     * operator explicitly chose one, so a plain "Read again" cannot silently downgrade a job
     * that was queued as `ai` back to `auto`.
     */
    extractionMode?: string;
  },
): Promise<RunDocumentJobResult> {
  const { data, error } = await supabase.rpc('claim_document_job', {
    p_document_id: options.documentId,
    p_worker_id: options.workerId,
    p_lease_seconds: options.leaseSeconds ?? 120,
    p_extraction_mode: options.extractionMode ?? null,
  });

  if (error) throw error;

  const job = ((data ?? []) as JobRow[])[0];
  if (job === undefined) return { claimed: false };

  const result = await runClaimedJob(supabase, job);
  return { claimed: true, ok: result.ok };
}
