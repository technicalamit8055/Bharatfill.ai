import { handler, ok } from '@/lib/api/response';
import { requireBearerSecret } from '@/lib/api/secret';
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

  const result = await runPendingJobs(createSupabaseAdminClient(), {
    workerId: `web-${process.env.VERCEL_REGION ?? 'local'}`,
  });

  return ok(result);
});
