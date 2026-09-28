/**
 * Plan catalogue and entitlements.
 * Master spec §22.
 *
 * The prices here are the *implementation placeholder* from §22.1, not a business commitment.
 * The database `plans` table is the runtime source of truth — super admins add and edit plans
 * there from /admin/plans. This file seeds it and gives the app a typed fallback for when a plan
 * row cannot be read, so the product runs with no payment provider configured at all.
 */

import { z } from 'zod';

/** The plans every database is seeded with. Admin-created plans add codes beyond these. */
export const PLAN_CODES = ['free', 'starter', 'professional', 'business'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/**
 * Shape of any plan code, built in or admin-created. Mirrors the `plans_code_format` check in
 * migration 0029: a stable machine key, never shown to operators.
 */
export const PLAN_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
export const planCodeSchema = z.string().regex(PLAN_CODE_PATTERN);

export const USAGE_EVENT_TYPES = [
  'fill',
  'ai_extraction',
  'document_tool',
  'storage',
  'seat',
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export type PlanFeatures = {
  /** Portal adapter library beyond the demo adapters. */
  adapterLibrary: boolean;
  /** PDF merge/split/compress in addition to photo and signature tools. */
  advancedDocumentTools: boolean;
  bulkImport: boolean;
  apiAccess: boolean;
  support: 'community' | 'email' | 'priority';
};

export const SUPPORT_LEVELS = ['community', 'email', 'priority'] as const;

/**
 * Validates the `plans.features` jsonb column. Missing flags default to *off*: a feature a row
 * does not mention is a feature the plan does not include, never one it gets by accident.
 */
export const planFeaturesSchema = z.object({
  adapterLibrary: z.boolean().default(false),
  advancedDocumentTools: z.boolean().default(false),
  bulkImport: z.boolean().default(false),
  apiAccess: z.boolean().default(false),
  support: z.enum(SUPPORT_LEVELS).default('community'),
});

export type PlanDefinition = {
  /** A built-in `PlanCode` or an admin-created one matching `PLAN_CODE_PATTERN`. */
  code: string;
  name: { en: string; hi: string };
  priceMonthlyInr: number;
  /** null means unlimited. */
  includedFills: number | null;
  includedAiExtractions: number | null;
  includedSeats: number;
  maxCustomers: number | null;
  storageMb: number;
  features: PlanFeatures;
  active: boolean;
};

export const PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: 'free',
    name: { en: 'Free', hi: 'फ्री' },
    priceMonthlyInr: 0,
    includedFills: 25,
    includedAiExtractions: 10,
    includedSeats: 1,
    maxCustomers: 50,
    storageMb: 200,
    features: {
      adapterLibrary: false,
      advancedDocumentTools: false,
      bulkImport: false,
      apiAccess: false,
      support: 'community',
    },
    active: true,
  },
  starter: {
    code: 'starter',
    name: { en: 'Starter', hi: 'स्टार्टर' },
    priceMonthlyInr: 299,
    includedFills: 300,
    includedAiExtractions: 100,
    includedSeats: 2,
    maxCustomers: 1000,
    storageMb: 2000,
    features: {
      adapterLibrary: true,
      advancedDocumentTools: true,
      bulkImport: false,
      apiAccess: false,
      support: 'email',
    },
    active: true,
  },
  professional: {
    code: 'professional',
    name: { en: 'Professional', hi: 'प्रोफेशनल' },
    priceMonthlyInr: 599,
    includedFills: 1000,
    includedAiExtractions: 400,
    includedSeats: 4,
    maxCustomers: 5000,
    storageMb: 10_000,
    features: {
      adapterLibrary: true,
      advancedDocumentTools: true,
      bulkImport: true,
      apiAccess: false,
      support: 'email',
    },
    active: true,
  },
  business: {
    code: 'business',
    name: { en: 'Business', hi: 'बिज़नेस' },
    priceMonthlyInr: 999,
    includedFills: null,
    includedAiExtractions: 1500,
    includedSeats: 10,
    maxCustomers: null,
    storageMb: 50_000,
    features: {
      adapterLibrary: true,
      advancedDocumentTools: true,
      bulkImport: true,
      apiAccess: false,
      support: 'priority',
    },
    active: true,
  },
};

export const DEFAULT_PLAN_CODE: PlanCode = 'free';

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

export function getPlan(code: string | null | undefined): PlanDefinition {
  return isPlanCode(code) ? PLANS[code] : PLANS[DEFAULT_PLAN_CODE];
}

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'cancelled',
  'incomplete',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * A failed payment must never destroy customer data (§22.4). A past-due organization keeps
 * full read access and loses only metered actions.
 */
export const STATUSES_WITH_METERED_ACCESS: readonly SubscriptionStatus[] = ['active', 'trialing'];
