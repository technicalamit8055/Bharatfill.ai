import 'server-only';

import {
  canTransitionQueueItem,
  conflict,
  notFound,
  scrapedCandidateSchema,
  validationFailed,
  type CandidateScheme,
  type QueueItemStatus,
} from '@assistigo/core';
import { toSchemeCatalogWrite } from '../scheme-write';
import type { AssistigoSupabaseClient } from '../../supabase/server';
import type { ScrapedSchemeQueueRow } from '../../supabase/database.types';

/**
 * Approving or rejecting a staged candidate.
 *
 * This is the only path from the scraper to the live catalogue, and it is reachable only from a
 * review action taken by a person holding `platform.queue.review`. Everything upstream — sources,
 * runs, staging, diffing — is deliberately incapable of reaching this function.
 *
 * The candidate is re-validated here rather than trusted from the queue row. It was validated
 * when staged, but between then and now it has been sitting in a jsonb column, and a claim about
 * a government rule that is about to be read aloud at ten thousand counters gets checked twice.
 */

export type ReviewOutcome = {
  itemId: string;
  status: QueueItemStatus;
  publishedSchemeId: string | null;
  slug: string;
};

function parsePayload(row: ScrapedSchemeQueueRow): CandidateScheme {
  const parsed = scrapedCandidateSchema.shape.scheme.safeParse(row.payload);
  if (!parsed.success) {
    throw validationFailed({
      fields: { payload: 'admin.queue.payloadInvalid' },
      // Paths only: enough to find the bad field, no values echoed back.
      paths: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  return parsed.data;
}

async function loadItem(
  supabase: AssistigoSupabaseClient,
  itemId: string,
): Promise<ScrapedSchemeQueueRow> {
  const { data, error } = await supabase
    .from('scraped_schemes_queue')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('admin.queue.notFound');
  return data as ScrapedSchemeQueueRow;
}

/**
 * Publishes a staged candidate into `schemes_catalog` as a global row and closes the queue item.
 *
 * The upsert targets `(slug) where organization_id is null` — the partial unique index from 0020
 * — so approving an update to a scheme that already has a global row replaces it rather than
 * creating a second one that would violate the index.
 *
 * `is_published` is carried from the row being replaced, defaulting to true for a scheme the
 * catalogue has never seen. Approving a *date change* on a scheme somebody deliberately
 * unpublished must not quietly republish it.
 */
export async function approveQueueItem(
  supabase: AssistigoSupabaseClient,
  input: { itemId: string; reviewerId: string; note?: string | null },
): Promise<ReviewOutcome> {
  const item = await loadItem(supabase, input.itemId);

  if (!canTransitionQueueItem(item.status, 'approved')) {
    throw conflict('admin.queue.alreadyReviewed', { status: item.status });
  }

  const scheme = parsePayload(item);

  const { data: existing, error: existingError } = await supabase
    .from('schemes_catalog')
    .select('id, is_published')
    .is('organization_id', null)
    .eq('slug', scheme.slug)
    .maybeSingle();

  if (existingError) throw existingError;
  const previous = existing as { id: string; is_published: boolean } | null;

  const { data: written, error: writeError } = await supabase
    .from('schemes_catalog')
    .upsert(
      {
        ...(previous ? { id: previous.id } : {}),
        organization_id: null,
        ...toSchemeCatalogWrite(scheme),
        source: 'sync',
        source_url: item.source_url,
        last_synced_at: new Date().toISOString(),
        // A human read the diff and approved it, which is exactly what verification means here.
        verified_at: new Date().toISOString(),
        verified_by: input.reviewerId,
        is_published: previous?.is_published ?? true,
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();

  if (writeError || !written) throw writeError ?? new Error('Could not publish the scheme');
  const publishedId = (written as { id: string }).id;

  const { error: closeError } = await supabase
    .from('scraped_schemes_queue')
    .update({
      status: 'approved',
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note ?? null,
      published_scheme_id: publishedId,
      target_scheme_id: previous?.id ?? publishedId,
    })
    .eq('id', item.id)
    // Only if it is still pending: two reviewers clicking approve at the same moment must not
    // both succeed and publish twice.
    .eq('status', 'pending');

  if (closeError) throw closeError;

  return {
    itemId: item.id,
    status: 'approved',
    publishedSchemeId: publishedId,
    slug: scheme.slug,
  };
}

export async function rejectQueueItem(
  supabase: AssistigoSupabaseClient,
  input: { itemId: string; reviewerId: string; note?: string | null },
): Promise<ReviewOutcome> {
  const item = await loadItem(supabase, input.itemId);

  if (!canTransitionQueueItem(item.status, 'rejected')) {
    throw conflict('admin.queue.alreadyReviewed', { status: item.status });
  }

  const { error } = await supabase
    .from('scraped_schemes_queue')
    .update({
      status: 'rejected',
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note ?? null,
    })
    .eq('id', item.id)
    .eq('status', 'pending');

  if (error) throw error;

  return { itemId: item.id, status: 'rejected', publishedSchemeId: null, slug: item.slug };
}
