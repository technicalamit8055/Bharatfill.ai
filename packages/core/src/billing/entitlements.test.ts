import { describe, expect, it } from 'vitest';
import {
  buildUsageSummary,
  checkCustomerLimit,
  checkFeature,
  checkUsageEntitlement,
  resolvePlan,
  type EntitlementContext,
} from './entitlements';
import { PLANS, PLAN_CODE_PATTERN, planFeaturesSchema, type PlanDefinition } from './plans';

const custom: PlanDefinition = {
  code: 'district_pro',
  name: { en: 'District Pro', hi: 'डिस्ट्रिक्ट प्रो' },
  priceMonthlyInr: 799,
  includedFills: 2,
  includedAiExtractions: null,
  includedSeats: 3,
  maxCustomers: 5,
  storageMb: 100,
  features: {
    adapterLibrary: true,
    advancedDocumentTools: false,
    bulkImport: true,
    apiAccess: false,
    support: 'email',
  },
  active: true,
};

function context(overrides: Partial<EntitlementContext> = {}): EntitlementContext {
  return {
    planCode: 'district_pro',
    plan: custom,
    subscriptionStatus: 'active',
    usage: {},
    seatsInUse: 1,
    customerCount: 0,
    storageUsedMb: 0,
    ...overrides,
  };
}

describe('resolvePlan', () => {
  it('uses the plan loaded from the database', () => {
    expect(resolvePlan(context())).toBe(custom);
  });

  it('prefers an edited database row over the built-in definition', () => {
    const edited = { ...PLANS.starter, includedFills: 450 };
    expect(resolvePlan({ planCode: 'starter', plan: edited }).includedFills).toBe(450);
  });

  it('falls back to the built-in definition when the row could not be read', () => {
    expect(resolvePlan({ planCode: 'professional', plan: null })).toBe(PLANS.professional);
  });

  it('falls back to free for an unknown code with no row — the most restrictive plan', () => {
    expect(resolvePlan({ planCode: 'district_pro', plan: null })).toBe(PLANS.free);
  });

  it('ignores a row for a different plan than the organization is on', () => {
    expect(resolvePlan({ planCode: 'starter', plan: custom })).toBe(PLANS.starter);
  });
});

describe('entitlements against an admin-created plan', () => {
  it('enforces its fill allowance', () => {
    expect(checkUsageEntitlement(context({ usage: { fill: 1 } }), 'fill').allowed).toBe(true);
    const denied = checkUsageEntitlement(context({ usage: { fill: 2 } }), 'fill');
    expect(denied).toMatchObject({ allowed: false, reason: 'billing.limit.fills' });
  });

  it('treats a null allowance as unlimited', () => {
    const decision = checkUsageEntitlement(context({ usage: { ai_extraction: 10_000 } }), 'ai_extraction');
    expect(decision).toMatchObject({ allowed: true, remaining: null });
  });

  it('enforces its customer limit and feature flags', () => {
    expect(checkCustomerLimit(context({ customerCount: 5 })).allowed).toBe(false);
    expect(checkFeature(context(), 'bulkImport').allowed).toBe(true);
    expect(checkFeature(context(), 'advancedDocumentTools').allowed).toBe(false);
  });

  it('still requires a paid-up subscription for a non-free plan', () => {
    const decision = checkUsageEntitlement(context({ subscriptionStatus: 'past_due' }), 'fill');
    expect(decision).toMatchObject({ allowed: false, reason: 'billing.limit.payment_required' });
  });

  it('reports its own name and limits in the usage summary', () => {
    const summary = buildUsageSummary(context({ usage: { fill: 1 } }));
    expect(summary.planCode).toBe('district_pro');
    expect(summary.planName.en).toBe('District Pro');
    expect(summary.items.find((item) => item.key === 'fill')).toMatchObject({
      used: 1,
      included: 2,
      ratio: 0.5,
    });
  });
});

describe('planFeaturesSchema', () => {
  it('defaults every missing flag to off', () => {
    expect(planFeaturesSchema.parse({})).toEqual({
      adapterLibrary: false,
      advancedDocumentTools: false,
      bulkImport: false,
      apiAccess: false,
      support: 'community',
    });
  });

  it('rejects an unknown support level', () => {
    expect(planFeaturesSchema.safeParse({ support: 'platinum' }).success).toBe(false);
  });
});

describe('PLAN_CODE_PATTERN', () => {
  it('accepts every built-in code and a typical custom one', () => {
    for (const code of [...Object.keys(PLANS), 'district_pro', 'csc_2027']) {
      expect(PLAN_CODE_PATTERN.test(code)).toBe(true);
    }
  });

  it('rejects codes that are not stable machine keys', () => {
    for (const code of ['', 'a', 'Pro', '1plan', 'pro-plan', 'pro plan', `p${'x'.repeat(40)}`]) {
      expect(PLAN_CODE_PATTERN.test(code)).toBe(false);
    }
  });
});
