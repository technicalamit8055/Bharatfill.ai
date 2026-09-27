import 'server-only';
import {
  BUILT_IN_ADAPTER_BY_SLUG,
  mergeAdapters,
  type PortalAdapter,
} from '@assistigo/form-engine';
import type { AssistigoSupabaseClient } from '../supabase/server';

export type CatalogAdapter = Omit<PortalAdapter, 'lastVerifiedAt'> & {
  /** Whether this adapter has a real `portal_adapters` row — a built-in that isn't seeded yet does not. */
  persisted: boolean;
  /**
   * Shipped and maintained by the platform (a built-in, or a global row with no organization),
   * as opposed to one a centre published for itself. The card's check mark says this — not
   * "verified", which is `lastVerifiedAt` and is shown on the detail page.
   */
  maintainedByPlatform: boolean;
  lastVerifiedAt: string | null;
  health: { successRate: number | null; lastFailureAt: string | null };
};

/**
 * The Form Library catalogue: built-in adapters merged with this organization's (and the
 * global) database rows, same precedence rule as `/api/forms/map` — a database row for a slug
 * always wins over the built-in shipped with the app.
 */
export async function loadAdapterCatalog(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
): Promise<CatalogAdapter[]> {
  const { data, error } = await supabase
    .from('portal_adapters')
    .select('*')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`);
  if (error) throw error;

  const adapterRows = (data ?? []) as Record<string, unknown>[];
  const persistedIds = new Set(adapterRows.map((row) => String(row.id)));
  const organizationRowIds = new Set(
    adapterRows.filter((row) => row.organization_id != null).map((row) => String(row.id)),
  );
  const persistedHealth = new Map(
    adapterRows.map((row) => [
      String(row.id),
      {
        lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
        health: (row.health as { successRate: number | null; lastFailureAt: string | null }) ?? {
          successRate: null,
          lastFailureAt: null,
        },
      },
    ]),
  );

  const databaseAdapters = adapterRows
    .slice()
    .sort((a, b) => Number(a.organization_id != null) - Number(b.organization_id != null))
    .map(
      (row) =>
        ({
          id: String(row.id),
          slug: String(row.slug),
          portalName: String(row.portal_name),
          formName: String(row.form_name),
          region: row.region as string | undefined,
          // `portal_adapters` has no category column: a row publishing a fix to a built-in keeps
          // the built-in's category, and a centre's own adapter has none.
          category: BUILT_IN_ADAPTER_BY_SLUG.get(String(row.slug))?.category,
          urlPatterns: (row.url_patterns as string[]) ?? [],
          version: String(row.version),
          status: row.status as PortalAdapter['status'],
          fields: (row.field_mappings as PortalAdapter['fields']) ?? [],
          documentRequirements:
            (row.document_requirements as PortalAdapter['documentRequirements']) ?? [],
          notes: row.notes as string | undefined,
          knownIssues: row.known_issues as string | undefined,
        }) satisfies PortalAdapter,
    );

  const merged = mergeAdapters(databaseAdapters);

  return merged.map((adapter) => ({
    ...adapter,
    persisted: persistedIds.has(adapter.id),
    maintainedByPlatform: !organizationRowIds.has(adapter.id),
    lastVerifiedAt: persistedHealth.get(adapter.id)?.lastVerifiedAt ?? null,
    health: persistedHealth.get(adapter.id)?.health ?? { successRate: null, lastFailureAt: null },
  }));
}
