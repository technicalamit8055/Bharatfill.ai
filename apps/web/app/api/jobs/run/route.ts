import { handler, ok } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { requireBearerSecret } from '@/lib/api/secret';
import { purgeExpiredDropSessions } from '@/lib/document-drop/purge';
import { runPendingJobs } from '@/lib/jobs/runner';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/jobs/run — drain the job queue.
 * Master spec §17.5; docs/ARCHITECTURE.md §7.
 *
 * Called by a scheduler (Vercel Cron or equivalent), never by a browser. It runs with the
 * service-role client, which bypasses RLS, so authorization here is the only gate — and it
 * fails closed: with no `JOB_RUNNER_SECRET` configured the endpoint refuses everything rather
 * than running unauthenticated work.
 */

export const POST = handler('api.jobs.run', async (request) => {
  requireBearerSecret(request, serverEnv().JOB_RUNNER_SECRET);

  const admin = createSupabaseAdminClient();

  const result = await runPendingJobs(admin, {
    workerId: `web-${process.env.VERCEL_REGION ?? 'local'}`,
  });

  /*
   * Walk-in drop sessions nobody claimed (§12.7).
   *
   * Rides this route rather than the `jobs` table because there is nothing to schedule per
   * tenant — it is one sweep over one index, and the scheduler already calls here. It runs
   * after the queue so a slow extraction batch never delays deleting a citizen's unclaimed
   * documents, and its failure is reported rather than allowed to fail the drain: losing a
   * sweep costs one cycle, losing the drain costs every tenant's uploads.
   */
  let drops = null;
  try {
    drops = await purgeExpiredDropSessions(admin);
  } catch (thrown) {
    logger.error('api.jobs.run.drop_purge_failed', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
  }

  return ok({ ...result, drops });
});
