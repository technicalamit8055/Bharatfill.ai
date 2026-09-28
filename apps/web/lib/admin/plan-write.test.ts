import { describe, expect, it } from 'vitest';
import {
  adminPlanInputSchema,
  changedPlanFields,
  emptyPlanInput,
  planEditBlockers,
  planInputFromRow,
  serializePlanDraft,
  toPlanWrite,
  type AdminPlanInput,
} from './plan-write';

const starter: AdminPlanInput = {
  code: 'starter',
  name: 'Starter',
  nameHi: 'स्टार्टर',
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
  sortOrder: 1,
};

describe('adminPlanInputSchema', () => {
  it('accepts a complete plan', () => {
    expect(adminPlanInputSchema.safeParse(starter).success).toBe(true);
  });

  it('accepts null as unlimited for fills, AI extractions and customers', () => {
    const unlimited = { ...starter, includedFills: null, includedAiExtractions: null, maxCustomers: null };
    expect(adminPlanInputSchema.safeParse(unlimited).success).toBe(true);
  });

  it('rejects negative limits, fractional prices, zero seats and malformed codes', () => {
    for (const bad of [
      { ...starter, includedFills: -1 },
      { ...starter, priceMonthlyInr: 299.5 },
      { ...starter, includedSeats: 0 },
      { ...starter, code: 'Starter Plus' },
      { ...starter, name: '   ' },
    ]) {
      expect(adminPlanInputSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('starts a new plan retired, so it reaches no centre until switched on', () => {
    expect(emptyPlanInput().active).toBe(false);
    expect(adminPlanInputSchema.safeParse({ ...emptyPlanInput(), code: 'new_plan', name: 'New' }).success).toBe(
      true,
    );
  });
});

describe('serializePlanDraft', () => {
  it('round-trips a valid draft, keeping null as unlimited', () => {
    const draft = { ...starter, includedFills: null };
    expect(adminPlanInputSchema.parse(JSON.parse(serializePlanDraft(draft)))).toEqual(draft);
  });

  it('turns a cleared limit box into a validation error, never into unlimited', () => {
    const cleared = { ...starter, includedFills: Number.NaN };
    const parsed = adminPlanInputSchema.safeParse(JSON.parse(serializePlanDraft(cleared)));
    expect(parsed.success).toBe(false);
  });
});

describe('planEditBlockers', () => {
  it('allows limit and feature changes on a plan organizations are on', () => {
    const next = {
      ...starter,
      includedFills: 500,
      features: { ...starter.features, bulkImport: true },
    };
    expect(planEditBlockers(starter, next, 12)).toEqual({});
  });

  it('locks the price while any organization is on the plan', () => {
    expect(planEditBlockers(starter, { ...starter, priceMonthlyInr: 349 }, 1)).toEqual({
      priceMonthlyInr: 'admin.plans.priceLocked',
    });
  });

  it('allows repricing a plan nobody is on', () => {
    expect(planEditBlockers(starter, { ...starter, priceMonthlyInr: 349 }, 0)).toEqual({});
  });

  it('never lets the code change', () => {
    expect(planEditBlockers(starter, { ...starter, code: 'starter_v2' }, 0)).toEqual({
      code: 'admin.plans.codeImmutable',
    });
  });

  it('refuses to retire the default free plan, but allows retiring others', () => {
    const free = { ...starter, code: 'free', priceMonthlyInr: 0 };
    expect(planEditBlockers(free, { ...free, active: false }, 0)).toEqual({
      active: 'admin.plans.defaultPlanRequired',
    });
    expect(planEditBlockers(starter, { ...starter, active: false }, 40)).toEqual({});
  });
});

describe('changedPlanFields', () => {
  it('names the settings that changed, and nothing else', () => {
    const next = { ...starter, includedFills: 450, features: { ...starter.features, support: 'priority' as const } };
    expect(changedPlanFields(starter, next)).toEqual(['includedFills', 'features']);
    expect(changedPlanFields(starter, starter)).toEqual([]);
  });
});

describe('row round trip', () => {
  it('maps a database row to the editor and back without loss', () => {
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'starter',
      ...toPlanWrite(starter),
      // PostgREST returns numeric columns as strings.
      price_monthly_inr: '299.00' as unknown as number,
    };
    expect(planInputFromRow(row)).toEqual(starter);
  });

  it('writes an empty Hindi name as null', () => {
    expect(toPlanWrite({ ...starter, nameHi: '' }).name_hi).toBeNull();
  });
});
