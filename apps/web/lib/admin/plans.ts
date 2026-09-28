import 'server-only';

import type { AssistigoSupabaseClient } from '../supabase/server';
import { PLAN_COLUMNS, type PlanCatalogueRow } from '../billing/plan-row';

/**
 * Plan reads for the admin panel. Always called with the service-role client from a
 * `PlatformSession`, after its permission check: retired plans included, and the organization
 * counts are aggregates — no organization is named.
 */

export type AdminPlanListing = {
  row: PlanCatalogueRow;
  /** Organizations on the plan, by their synced `plan_code`. */
  organizations: number;
};

/**
 * How many organizations are on a plan: by `plan_code` (free-plan organizations have no
 * subscription row) or by a live subscription. The same test `plan_in_use()` applies in the
 * database; this is the friendly check that runs first.
 */
export async function countOrganizationsOnPlan(
  supabase: AssistigoSupabaseClient,
  plan: Pick<PlanCatalogueRow, 'id' | 'code'>,
): Promise<number> {
  const [organizations, subscriptions] = await Promise.all([
    supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('plan_code', plan.code),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id)
      .in('status', ['active', 'trialing', 'past_due']),
  ]);
  if (organizations.error) throw organizations.error;
  if (subscriptions.error) throw subscriptions.error;
  return Math.max(organizations.count ?? 0, subscriptions.count ?? 0);
}

export async function loadAdminPlans(supabase: AssistigoSupabaseClient): Promise<AdminPlanListing[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('price_monthly_inr', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as PlanCatalogueRow[];
  // One pair of head-only counts per plan: a catalogue is a handful of rows, never hundreds.
  const counts = await Promise.all(rows.map((row) => countOrganizationsOnPlan(supabase, row)));
  return rows.map((row, index) => ({ row, organizations: counts[index] ?? 0 }));
}

export async function loadAdminPlan(
  supabase: AssistigoSupabaseClient,
  id: string,
): Promise<AdminPlanListing | null> {
  const { data, error } = await supabase.from('plans').select(PLAN_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as PlanCatalogueRow;
  return { row, organizations: await countOrganizationsOnPlan(supabase, row) };
}
