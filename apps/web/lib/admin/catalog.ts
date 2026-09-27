import 'server-only';

import {
  BUILT_IN_SCHEMES,
  mergeSchemes,
  resolveSchemeLifecycle,
  type SchemeDefinition,
  type SchemeLifecycleStatus,
} from '@assistigo/core';
import { schemeFromRow, type CatalogRow } from '../schemes/service';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { SchemesCatalogRow } from '../supabase/database.types';
import { logger } from '../api/logger';

/**
 * The *platform* view of the scheme catalogue: global rows only.
 *
 * Different from lib/schemes/service.ts on purpose. That module answers "what should this centre
 * see?" and folds in the centre's own overrides; this one answers "what are we publishing to
 * everybody?" and must never mix a tenant's private row into an admin screen. An employee editing
 * `ssc-gd-constable` here is editing the row every centre in the country reads.
 */

const ADMIN_COLUMNS =
  'id, organization_id, slug, category, title, short_description, benefits_summary, benefit_highlight, portal_name, portal_url, adapter_slug, official_notification_url, application_start_date, application_end_date, is_always_open, exam_date, estimated_operator_fee, eligibility, pitch_template, upcoming_pitch_template, is_published, logo_path, banner_path, illustration_path, source, source_url, last_synced_at, verified_at, verified_by, created_by, created_at, updated_at';

export type AdminCatalogRow = CatalogRow &
  Pick<
    SchemesCatalogRow,
    | 'source'
    | 'source_url'
    | 'last_synced_at'
    | 'verified_at'
    | 'verified_by'
    | 'created_by'
    | 'created_at'
    | 'updated_at'
  >;

export type AdminSchemeListing = {
  row: AdminCatalogRow;
  /** `null` when the stored row does not survive validation — surfaced rather than hidden. */
  scheme: SchemeDefinition | null;
  status: SchemeLifecycleStatus | null;
  daysRemaining: number | null;
};

/** Every global row, drafts included. Drafts are the admin panel's whole job. */
export async function loadGlobalCatalogRows(
  supabase: AssistigoSupabaseClient,
): Promise<AdminCatalogRow[]> {
  const { data, error } = await supabase
    .from('schemes_catalog')
    .select(ADMIN_COLUMNS)
    .is('organization_id', null)
    .order('application_end_date', { ascending: true, nullsFirst: false });

  if (error) {
    logger.error('platform.catalog_load_failed', { code: error.code });
    return [];
  }
  return (data ?? []) as AdminCatalogRow[];
}

/**
 * Global rows with their lifecycle resolved, for the catalogue table.
 *
 * A row that fails validation is kept in the list with `scheme: null` rather than dropped. On the
 * tenant side dropping it is right — a malformed rule must not reach a counter. Here it is
 * exactly backwards: the admin panel is where somebody fixes it, so hiding it would make the
 * broken row invisible to the only people who can repair it.
 */
export async function loadGlobalCatalog(
  supabase: AssistigoSupabaseClient,
  asOfDate: Date = new Date(),
): Promise<AdminSchemeListing[]> {
  const rows = await loadGlobalCatalogRows(supabase);

  return rows.map((row) => {
    const scheme = schemeFromRow(row);
    if (!scheme) return { row, scheme: null, status: null, daysRemaining: null };
    const lifecycle = resolveSchemeLifecycle(scheme.schedule, asOfDate);
    return { row, scheme, status: lifecycle.status, daysRemaining: lifecycle.daysRemaining };
  });
}

/**
 * What a scheme slug currently resolves to for every tenant: the published global row if there is
 * one, otherwise the built-in that ships in the build.
 *
 * This is the "before" side of every diff the scraper queue shows. Getting it wrong in either
 * direction produces a misleading review — a diff against a draft would show changes nobody can
 * see, and a diff that ignored the global row would re-propose a change already made.
 */
export async function loadEffectiveGlobalSchemes(
  supabase: AssistigoSupabaseClient,
): Promise<Map<string, SchemeDefinition>> {
  const rows = await loadGlobalCatalogRows(supabase);
  const published: SchemeDefinition[] = [];

  for (const row of rows) {
    if (!row.is_published) continue;
    const scheme = schemeFromRow(row);
    if (scheme) published.push(scheme);
  }

  return new Map(
    mergeSchemes(published, BUILT_IN_SCHEMES).map((scheme) => [scheme.slug, scheme]),
  );
}

/**
 * Slugs that exist only as built-ins.
 *
 * Useful on the catalogue screen: a built-in with no global row has no tracked window at all, and
 * "the countdown is silent because nobody has entered a date" is the single most actionable thing
 * an employee can learn there.
 */
export function builtInsWithoutGlobalRow(rows: readonly AdminCatalogRow[]): SchemeDefinition[] {
  const covered = new Set(rows.map((row) => row.slug));
  return BUILT_IN_SCHEMES.filter((scheme) => !covered.has(scheme.slug));
}
