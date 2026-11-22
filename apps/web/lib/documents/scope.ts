import 'server-only';

import { isCitizenAppOrganization, notFound } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * Which documents a centre may review (docs/AI_PIPELINE.md §6; migration 0041).
 *
 *   own    the document belongs to the caller's centre — the original rule. Reads and writes use
 *          the caller's own client, so RLS checks every step.
 *   app    the document belongs to a BharatDoc app customer and the caller holds a live roaming
 *          grant over that customer (`can_review_app_customer`, checked with the caller's JWT).
 *          The app organization has no members to review its extractions, so the operator with
 *          the citizen at the counter does. RLS lets them READ the extraction (0041); the review
 *          WRITES go through `writer`, the service-role client, because no grant holder has a
 *          write policy on another organization's profile. This function is that write's gate.
 *
 * Anything else — another centre's document, even one a roaming grant lets the caller read — is
 * a 404, exactly as before.
 */

export type DocumentScope = {
  /** The organization that owns the document; every later query filters on it. */
  organizationId: string;
  kind: 'own' | 'app';
  /** Client for review writes: the caller's own (own) or the service role (app). */
  writer: AssistigoSupabaseClient;
};

export async function resolveDocumentScope(input: {
  supabase: AssistigoSupabaseClient;
  callerOrganizationId: string;
  document: { organization_id: string; customer_id: string | null };
  admin: () => AssistigoSupabaseClient;
}): Promise<DocumentScope> {
  const { supabase, callerOrganizationId, document } = input;

  if (document.organization_id === callerOrganizationId) {
    return { organizationId: callerOrganizationId, kind: 'own', writer: supabase };
  }

  if (isCitizenAppOrganization(document.organization_id) && document.customer_id) {
    const { data, error } = await supabase.rpc('can_review_app_customer', {
      p_customer_id: document.customer_id,
    });
    if (error) throw error;
    if (data === true) {
      return { organizationId: document.organization_id, kind: 'app', writer: input.admin() };
    }
  }

  throw notFound('errors.not_found');
}
