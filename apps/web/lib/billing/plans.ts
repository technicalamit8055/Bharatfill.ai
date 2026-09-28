import 'server-only';

import { ALL_PLANS, getPlan, type PlanDefinition } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { logger } from '../api/logger';
import { PLAN_COLUMNS, planFromRow, type PlanCatalogueRow } from './plan-row';

/**
 * The plan catalogue centres can choose from: active plans, in the order admins set.
 *
 * A failed read falls back to the built-in plans rather than an empty page — the operator can
 * still see what they are on — and is logged, because a catalogue that silently stops matching
 * the database is a billing bug.
 */
export async function loadPlanCatalogue(
  supabase: AssistigoSupabaseClient,
): Promise<PlanDefinition[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('price_monthly_inr', { ascending: true });

  if (error) {
    logger.error('billing.plan_catalogue_read_failed', { dbError: error.message });
    return ALL_PLANS;
  }
  return ((data ?? []) as unknown as PlanCatalogueRow[]).map(planFromRow);
}

/**
 * One organization's plan, retired or not — RLS lets members read the plan they are on even
 * after it leaves the catalogue (migration 0029).
 *
 * Returns null when the read fails or finds nothing, so the caller's entitlement context falls
 * back through `resolvePlan`: to the built-in definition, else to the free plan.
 */
export async function loadPlanByCode(
  supabase: AssistigoSupabaseClient,
  code: string,
): Promise<PlanDefinition | null> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('code', code)
    .maybeSingle();

  if (error) {
    logger.error('billing.plan_read_failed', { dbError: error.message });
    return null;
  }
  if (!data) {
    // A code with no row: a plan deleted by hand, or a seed that never ran. The built-in
    // fallback covers the four seeded codes; anything else lands on free, and should be loud.
    logger.error('billing.plan_missing', { planCode: code, fallback: getPlan(code).code });
    return null;
  }
  return planFromRow(data as unknown as PlanCatalogueRow);
}
