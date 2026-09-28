import { planFeaturesSchema, type PlanDefinition } from '@assistigo/core';
import type { PlanRow } from '../supabase/database.types';

/** The `plans` columns the app reads. One list, so every loader selects the same shape. */
export const PLAN_COLUMNS =
  'id, code, name, name_hi, price_monthly_inr, included_fills, included_ai_extractions, ' +
  'included_seats, max_customers, storage_mb, features, active, sort_order';

export type PlanCatalogueRow = Pick<
  PlanRow,
  | 'id'
  | 'code'
  | 'name'
  | 'name_hi'
  | 'price_monthly_inr'
  | 'included_fills'
  | 'included_ai_extractions'
  | 'included_seats'
  | 'max_customers'
  | 'storage_mb'
  | 'features'
  | 'active'
  | 'sort_order'
>;

/**
 * A `plans` row as the typed definition the entitlement checks use.
 *
 * `numeric` columns can arrive from PostgREST as strings, so every number is coerced. The
 * `features` jsonb is validated; a row whose features do not parse still maps, with every flag
 * off — the plan keeps its limits, and a malformed column never grants a feature.
 */
export function planFromRow(row: PlanCatalogueRow): PlanDefinition {
  const features = planFeaturesSchema.safeParse(row.features ?? {});
  const optional = (value: number | string | null) => (value === null ? null : Number(value));

  return {
    code: row.code,
    name: { en: row.name, hi: row.name_hi?.trim() ? row.name_hi : row.name },
    priceMonthlyInr: Number(row.price_monthly_inr),
    includedFills: optional(row.included_fills),
    includedAiExtractions: optional(row.included_ai_extractions),
    includedSeats: Number(row.included_seats),
    maxCustomers: optional(row.max_customers),
    storageMb: Number(row.storage_mb),
    features: features.success ? features.data : planFeaturesSchema.parse({}),
    active: row.active,
  };
}
