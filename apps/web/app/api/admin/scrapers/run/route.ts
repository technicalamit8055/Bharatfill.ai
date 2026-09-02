import { handler, ok } from '@/lib/api/response';
import { requireBearerSecret } from '@/lib/api/secret';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { runScraperSource } from '@/lib/admin/scraper/run';
import { httpFetchingEnabled } from '@/lib/admin/scraper/fetchers';
import { logger } from '@/lib/api/logger';
import type { ScraperSourceRow } from '@/lib/supabase/database.types';

/**
 * POST /api/admin/scrapers/run — poll every source that is due.
 *
 * The scheduled counterpart to the "Run now" button, called by a cron and never by a browser.
 * Authorised with `JOB_RUNNER_SECRET`, the same shared secret as `/api/jobs/run`, because it has
 * the same shape: it runs with the service-role client, so this check is the only gate and it
 * fails closed — with no secret configured the endpoint refuses everything.
 *
 * What it can do is bounded by what a run can do. Every candidate it produces goes to the review
 * queue; there is no path from this endpoint to the live catalogue (lib/admin/scraper/run.ts).
 *
 * `manual` sources are skipped: their input is a human pasting a notification, which a cron does
 * not have.
 */

/** Ceiling on sources per invocation, so one call cannot run for minutes on a serverless timeout. */
const MAX_SOURCES_PER_RUN = 10;

export const POST = handler('api.admin.scrapers.run', async (request) => {
  requireBearerSecret(request, serverEnv().JOB_RUNNER_SECRET);

  const supabase = createSupabaseAdminClient();
  const httpEnabled = httpFetchingEnabled();

  const { data, error } = await supabase
    .from('scraper_sources')
    .select('*')
    .eq('is_enabled', true)
    .neq('fetcher', 'manual')
    // Never-run sources first (`last_run_at` null), then the longest-waiting.
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(MAX_SOURCES_PER_RUN * 3);

  if (error) throw error;

  const now = Date.now();
  const due = ((data ?? []) as ScraperSourceRow[])
    .filter((source) => {
      if (source.fetcher === 'http' && !httpEnabled) return false;
      if (!source.last_run_at) return true;
      const elapsedMinutes = (now - new Date(source.last_run_at).getTime()) / 60_000;
      return elapsedMinutes >= source.interval_minutes;
    })
    .slice(0, MAX_SOURCES_PER_RUN);

  const results = [];
  for (const source of due) {
    try {
      const outcome = await runScraperSource(supabase, source, {
        triggeredBy: null,
        trigger: 'schedule',
      });
      results.push({
        source: source.slug,
        status: outcome.status,
        found: outcome.itemsFound,
        staged: outcome.itemsStaged,
        skipped: outcome.itemsSkipped,
      });
    } catch (runError) {
      // One broken source must not stop the rest of the sweep. `runScraperSource` already records
      // the failure against the run and the source's health.
      logger.error('scraper.scheduled_run_failed', {
        source: source.slug,
        reason: runError instanceof Error ? runError.name : 'unknown',
      });
      results.push({ source: source.slug, status: 'failed' as const, found: 0, staged: 0, skipped: 0 });
    }
  }

  return ok({
    ran: results.length,
    httpFetchingEnabled: httpEnabled,
    results,
  });
});
