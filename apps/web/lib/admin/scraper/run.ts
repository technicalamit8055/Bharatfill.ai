import 'server-only';

import {
  candidateContentHash,
  diffScheme,
  scrapedCandidateSchema,
  type ScrapedCandidate,
  type SchemeDefinition,
} from '@assistigo/core';
import { logger } from '../../api/logger';
import { loadEffectiveGlobalSchemes } from '../catalog';
import type { AssistigoSupabaseClient } from '../../supabase/server';
import type { Json, ScraperRunRow, ScraperSourceRow } from '../../supabase/database.types';
import { getFetcher, ScraperDisabledError } from './fetchers';

/**
 * One scraper run, start to finish.
 *
 * The shape of this function is the safety argument for the whole feature, so it is worth stating
 * plainly: it fetches candidates, works out what each one would change, and writes rows to
 * `scraped_schemes_queue`. It never writes to `schemes_catalog`. There is no branch, no
 * confidence value and no source configuration that causes a run to publish something — publishing
 * lives in ./publish.ts and is reachable only from a review action taken by a person.
 *
 * Everything is idempotent by content hash: a source polled hourly that keeps finding the same
 * notification stages one queue row, not twenty-four.
 */

const MAX_ERROR_LENGTH = 500;

export type RunOutcome = {
  runId: string;
  status: ScraperRunRow['status'];
  itemsFound: number;
  itemsStaged: number;
  itemsSkipped: number;
  warnings: string[];
};

/**
 * Failure text, sanitised.
 *
 * A fetch error can carry a chunk of the page that caused it, and a government page can contain a
 * name or a roll number in a results table. Truncated, whitespace-collapsed and stripped of
 * anything that looks like a URL query string — the error column is for "why did this break", not
 * for a copy of what broke (docs/DEVELOPMENT_RULES.md §5).
 */
export function sanitiseRunError(error: unknown): string {
  const raw =
    error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError: run failed';
  return raw
    .replace(/\?[^\s]*/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_ERROR_LENGTH);
}

export type StageDecision =
  | { stage: true; candidate: ScrapedCandidate; hash: string }
  | { stage: false; reason: 'invalid' | 'no_change' | 'duplicate' };

/**
 * Whether a candidate is worth a reviewer's attention.
 *
 * Pure, and separated from the database work so the three reasons to skip can be tested directly.
 * `no_change` is the important one: a poll that re-reads the same page must not fill the inbox
 * with rows that say nothing changed, because an inbox full of noise stops being read and that is
 * how a real deadline change gets approved without being looked at.
 */
export function decideStaging(
  raw: unknown,
  live: SchemeDefinition | null,
  seenHashes: ReadonlySet<string>,
): StageDecision {
  const parsed = scrapedCandidateSchema.safeParse(raw);
  if (!parsed.success) return { stage: false, reason: 'invalid' };

  const hash = candidateContentHash(parsed.data.scheme);
  if (seenHashes.has(hash)) return { stage: false, reason: 'duplicate' };

  const diff = diffScheme(live, parsed.data.scheme);
  if (diff.changeKind === 'no_change') return { stage: false, reason: 'no_change' };

  return { stage: true, candidate: parsed.data, hash };
}

/**
 * Runs one source.
 *
 * `input` is passed through to the fetcher — it is the pasted notification for a `manual` source
 * and ignored by the others.
 */
export async function runScraperSource(
  supabase: AssistigoSupabaseClient,
  source: ScraperSourceRow,
  options: { triggeredBy: string | null; trigger: 'manual' | 'schedule'; input?: unknown },
): Promise<RunOutcome> {
  const { data: runRow, error: runError } = await supabase
    .from('scraper_runs')
    .insert({
      source_id: source.id,
      status: 'running',
      trigger: options.trigger,
      triggered_by: options.triggeredBy,
    })
    .select('id')
    .single();

  if (runError || !runRow) throw runError ?? new Error('Could not open a scraper run');
  const runId = (runRow as { id: string }).id;

  let outcome: RunOutcome = {
    runId,
    status: 'succeeded',
    itemsFound: 0,
    itemsStaged: 0,
    itemsSkipped: 0,
    warnings: [],
  };

  try {
    const effective = await loadEffectiveGlobalSchemes(supabase);
    const fetcher = getFetcher(source.fetcher);

    const result = await fetcher.fetch({
      source,
      input: options.input,
      lookupScheme: (slug) => effective.get(slug) ?? null,
    });

    outcome.itemsFound = result.candidates.length;
    outcome.warnings = result.warnings;

    // Hashes already sitting in the inbox for this source's slugs. Loaded once, then extended as
    // this run stages rows, so a fetcher that emits the same candidate twice in one batch also
    // deduplicates. The unique index on (content_hash) where status='pending' is the real
    // guarantee; this just avoids a round trip that would fail.
    const seen = await loadPendingHashes(supabase);

    for (const raw of result.candidates) {
      const slug = (raw as ScrapedCandidate).scheme?.slug;
      const live = typeof slug === 'string' ? (effective.get(slug) ?? null) : null;
      const decision = decideStaging(raw, live, seen);

      if (!decision.stage) {
        outcome.itemsSkipped += 1;
        if (decision.reason === 'invalid') outcome.warnings.push('candidate-invalid');
        continue;
      }

      const staged = await stageCandidate(supabase, {
        source,
        runId,
        candidate: decision.candidate,
        hash: decision.hash,
        live,
      });

      if (staged) {
        outcome.itemsStaged += 1;
        seen.add(decision.hash);
      } else {
        outcome.itemsSkipped += 1;
      }
    }

    // Some candidates arrived but none could be staged, and something went wrong rather than
    // nothing having changed: worth distinguishing from a clean run on the health badge.
    if (outcome.warnings.length > 0 && outcome.itemsStaged === 0 && outcome.itemsFound > 0) {
      outcome.status = 'partial';
    }
  } catch (error) {
    // A disabled HTTP fetcher is a configuration state, not an incident. It still fails the run —
    // the source produced nothing — but it must not count towards the unhealthy-source badge, or
    // a deployment that has simply not enabled outbound fetching looks like it is on fire.
    const disabled = error instanceof ScraperDisabledError;
    logger.warn('scraper.run_failed', {
      source: source.slug,
      fetcher: source.fetcher,
      disabled,
    });
    outcome = {
      ...outcome,
      status: 'failed',
      warnings: [...outcome.warnings, disabled ? 'http-fetching-disabled' : 'run-failed'],
    };
    await closeRun(supabase, runId, outcome, sanitiseRunError(error));
    await updateSourceHealth(supabase, source, 'failed', { countFailure: !disabled });
    return outcome;
  }

  await closeRun(supabase, runId, outcome, null);
  await updateSourceHealth(supabase, source, outcome.status, { countFailure: false });
  return outcome;
}

async function loadPendingHashes(supabase: AssistigoSupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('scraped_schemes_queue')
    .select('content_hash')
    .eq('status', 'pending');

  if (error) {
    logger.warn('scraper.pending_hashes_failed', { code: error.code });
    return new Set();
  }
  return new Set((data ?? []).map((row) => (row as { content_hash: string }).content_hash));
}

/**
 * Writes one candidate to the inbox.
 *
 * Returns false when the row was rejected as a duplicate by the unique index — the expected
 * outcome when two runs overlap, and not an error.
 */
async function stageCandidate(
  supabase: AssistigoSupabaseClient,
  input: {
    source: ScraperSourceRow;
    runId: string;
    candidate: ScrapedCandidate;
    hash: string;
    live: SchemeDefinition | null;
  },
): Promise<boolean> {
  const { candidate, live } = input;
  const diff = diffScheme(live, candidate.scheme);

  // An earlier pending row for the same scheme is stale the moment a newer candidate lands: two
  // open proposals for one scheme means a reviewer can approve the older one by accident.
  await supersedePending(supabase, candidate.scheme.slug);

  const { error } = await supabase.from('scraped_schemes_queue').insert({
    source_id: input.source.id,
    run_id: input.runId,
    slug: candidate.scheme.slug,
    category: candidate.scheme.category,
    target_scheme_id: null,
    payload: candidate.scheme as unknown as Json,
    proposed_changes: diff.changes as unknown as Json,
    change_kind: diff.changeKind,
    status: 'pending',
    confidence: candidate.confidence,
    source_url: candidate.sourceUrl,
    content_hash: input.hash,
    fetcher_note: candidate.note ?? null,
  });

  if (error) {
    // 23505 is the unique violation on the pending-hash index.
    if (error.code === '23505') return false;
    logger.error('scraper.stage_failed', { code: error.code, slug: candidate.scheme.slug });
    return false;
  }
  return true;
}

async function supersedePending(
  supabase: AssistigoSupabaseClient,
  slug: string,
): Promise<void> {
  const { error } = await supabase
    .from('scraped_schemes_queue')
    .update({ status: 'superseded' })
    .eq('slug', slug)
    .eq('status', 'pending');

  if (error) logger.warn('scraper.supersede_failed', { code: error.code, slug });
}

async function closeRun(
  supabase: AssistigoSupabaseClient,
  runId: string,
  outcome: RunOutcome,
  errorText: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('scraper_runs')
    .update({
      status: outcome.status,
      items_found: outcome.itemsFound,
      items_staged: outcome.itemsStaged,
      items_skipped: outcome.itemsSkipped,
      error_text: errorText,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) logger.error('scraper.close_run_failed', { code: error.code });
}

async function updateSourceHealth(
  supabase: AssistigoSupabaseClient,
  source: ScraperSourceRow,
  status: ScraperRunRow['status'],
  options: { countFailure: boolean },
): Promise<void> {
  /*
   * Three cases, and conflating any two of them makes the health badge lie:
   *
   *   a real failure    increments the streak
   *   a blocked run     leaves it alone — outbound fetching being switched off is a deployment
   *                     fact, and neither proves the source healthy nor that it is broken
   *   a completed run   resets it
   */
  const failures = options.countFailure
    ? source.consecutive_failures + 1
    : status === 'failed'
      ? source.consecutive_failures
      : 0;

  const { error } = await supabase
    .from('scraper_sources')
    .update({
      last_run_at: new Date().toISOString(),
      last_status: status,
      consecutive_failures: failures,
    })
    .eq('id', source.id);

  if (error) logger.warn('scraper.health_update_failed', { code: error.code });
}
