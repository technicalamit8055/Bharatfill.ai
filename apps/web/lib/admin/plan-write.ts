import { z } from 'zod';
import { DEFAULT_PLAN_CODE, SUPPORT_LEVELS, planCodeSchema } from '@assistigo/core';
import type { PlanCatalogueRow } from '../billing/plan-row';
import { planFromRow } from '../billing/plan-row';

/**
 * The admin plan editor's input, and the rules for turning it into a `plans` write.
 *
 * Pure — no Supabase, no `server-only` — so the rules are unit-tested directly. Migration 0029
 * enforces the same rules again in the database, so a write that slips past this file still
 * cannot reprice a plan somebody is on.
 */

/** Upper bound on any single limit. Anything larger is a typo, and "unlimited" is its own switch. */
export const PLAN_LIMIT_MAX = 10_000_000;
/** ₹ per month. The column is numeric(10,2); plans are priced in whole rupees. */
export const PLAN_PRICE_MAX = 1_000_000;

const count = z.number().int().min(0).max(PLAN_LIMIT_MAX);
/** A limit where null means unlimited. */
const limit = count.nullable();

export const adminPlanInputSchema = z.object({
  code: planCodeSchema,
  name: z.string().trim().min(1).max(80),
  nameHi: z.string().trim().max(80),
  priceMonthlyInr: z.number().int().min(0).max(PLAN_PRICE_MAX),
  includedFills: limit,
  includedAiExtractions: limit,
  includedSeats: z.number().int().min(1).max(PLAN_LIMIT_MAX),
  maxCustomers: limit,
  storageMb: count,
  features: z.object({
    adapterLibrary: z.boolean(),
    advancedDocumentTools: z.boolean(),
    bulkImport: z.boolean(),
    apiAccess: z.boolean(),
    support: z.enum(SUPPORT_LEVELS),
  }),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export type AdminPlanInput = z.infer<typeof adminPlanInputSchema>;

export function emptyPlanInput(sortOrder = 0): AdminPlanInput {
  return {
    code: '',
    name: '',
    nameHi: '',
    priceMonthlyInr: 0,
    includedFills: 100,
    includedAiExtractions: 50,
    includedSeats: 1,
    maxCustomers: 500,
    storageMb: 1000,
    features: {
      adapterLibrary: false,
      advancedDocumentTools: false,
      bulkImport: false,
      apiAccess: false,
      support: 'email',
    },
    // New plans start retired, so nothing reaches centres until an admin switches it on.
    active: false,
    sortOrder,
  };
}

export function planInputFromRow(row: PlanCatalogueRow): AdminPlanInput {
  const plan = planFromRow(row);
  return {
    code: plan.code,
    name: row.name,
    nameHi: row.name_hi ?? '',
    priceMonthlyInr: plan.priceMonthlyInr,
    includedFills: plan.includedFills,
    includedAiExtractions: plan.includedAiExtractions,
    includedSeats: plan.includedSeats,
    maxCustomers: plan.maxCustomers,
    storageMb: plan.storageMb,
    features: plan.features,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

/**
 * The editor's draft as the JSON its form posts.
 *
 * `JSON.stringify` writes NaN as `null` — which, for a limit, means *unlimited*. A cleared number
 * box must fail validation, never quietly lift a limit, so NaN is sent as a string instead.
 */
export function serializePlanDraft(draft: AdminPlanInput): string {
  return JSON.stringify(draft, (_key, value: unknown) =>
    typeof value === 'number' && Number.isNaN(value) ? 'invalid' : value,
  );
}

/** The `plans` columns an admin write sets. `code` is written on insert only. */
export function toPlanWrite(input: AdminPlanInput) {
  return {
    name: input.name,
    name_hi: input.nameHi || null,
    price_monthly_inr: input.priceMonthlyInr,
    included_fills: input.includedFills,
    included_ai_extractions: input.includedAiExtractions,
    included_seats: input.includedSeats,
    max_customers: input.maxCustomers,
    storage_mb: input.storageMb,
    features: input.features,
    active: input.active,
    sort_order: input.sortOrder,
  };
}

/**
 * Why an edit to an existing plan must be refused, as field-keyed translation keys — empty when
 * the edit may go ahead. These are the product owner's rules:
 *
 *   * the code never changes (organizations refer to the plan by it);
 *   * the price is locked while any organization is on the plan — reprice by creating a new plan
 *     and retiring this one;
 *   * the default free plan cannot be retired, since every new organization lands on it.
 *
 * Limit and feature changes are always allowed and apply to every subscriber immediately.
 */
export function planEditBlockers(
  existing: AdminPlanInput,
  next: AdminPlanInput,
  organizationsOnPlan: number,
): Record<string, string> {
  const blockers: Record<string, string> = {};
  if (next.code !== existing.code) blockers.code = 'admin.plans.codeImmutable';
  if (next.priceMonthlyInr !== existing.priceMonthlyInr && organizationsOnPlan > 0) {
    blockers.priceMonthlyInr = 'admin.plans.priceLocked';
  }
  if (existing.code === DEFAULT_PLAN_CODE && !next.active) {
    blockers.active = 'admin.plans.defaultPlanRequired';
  }
  return blockers;
}

/** Which top-level settings an edit changed, for the audit trail. Names only, never values. */
export function changedPlanFields(existing: AdminPlanInput, next: AdminPlanInput): string[] {
  return (Object.keys(next) as (keyof AdminPlanInput)[]).filter(
    (key) => JSON.stringify(existing[key]) !== JSON.stringify(next[key]),
  );
}
