/**
 * Admin-managed plans hold their rules in the database, not only in the admin panel.
 * Migration 0029; master spec §6.1, §22.
 *
 * The panel writes with the service role, which bypasses RLS — so the price lock, code
 * immutability and the free plan's protection are a trigger, and these tests go through that
 * same service-role client to prove the trigger holds even when the application check is
 * skipped. The read tests prove a retired plan stays visible to the organizations on it (their
 * limits resolve from that row) and to nobody else.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;
const customCode = `rls_plan_${Date.now()}`;
let customPlanId: string;

beforeAll(async () => {
  fixture = await setupFixture();
  const { data, error } = await adminClient()
    .from('plans')
    .insert({
      code: customCode,
      name: 'RLS fixture plan',
      price_monthly_inr: 450,
      included_fills: 10,
      included_ai_extractions: 5,
      included_seats: 2,
      max_customers: 20,
      storage_mb: 100,
      features: { support: 'email' },
      active: true,
      sort_order: 99,
    })
    .select('id')
    .single();
  if (error) throw error;
  customPlanId = data.id as string;
});

afterAll(async () => {
  // Organizations first: their subscriptions reference the plan.
  await teardownFixture(fixture);
  if (customPlanId) await adminClient().from('plans').delete().eq('id', customPlanId);
});

describe('plan writes (service role, as the admin panel)', () => {
  it('rejects a code that is not a stable machine key', async () => {
    const { error } = await adminClient()
      .from('plans')
      .insert({ code: 'Bad Code', name: 'Bad', storage_mb: 1 });
    expect(error?.code).toBe('23514');
  });

  it('rejects negative limits', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ included_fills: -1 })
      .eq('id', customPlanId);
    expect(error?.code).toBe('23514');
  });

  it('allows repricing a plan nobody is on', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ price_monthly_inr: 499 })
      .eq('id', customPlanId);
    expect(error).toBeNull();
  });

  it('never allows the code to change', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ code: `${customCode}_renamed` })
      .eq('id', customPlanId);
    expect(error?.message).toContain('plan_code_immutable');
  });

  it('refuses to retire the free plan', async () => {
    const { error } = await adminClient().from('plans').update({ active: false }).eq('code', 'free');
    expect(error?.message).toContain('plan_default_required');
  });

  it('locks the price of the free plan, which every fixture organization is on', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ price_monthly_inr: 1 })
      .eq('code', 'free');
    expect(error?.message).toContain('plan_price_locked');
  });
});

describe('a plan with subscribers', () => {
  beforeAll(async () => {
    const admin = adminClient();
    const { error } = await admin
      .from('subscriptions')
      .update({ plan_id: customPlanId })
      .eq('organization_id', fixture.orgA.id)
      .in('status', ['active', 'trialing', 'past_due']);
    if (error) throw error;
  });

  it('locks its price', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ price_monthly_inr: 599 })
      .eq('id', customPlanId);
    expect(error?.message).toContain('plan_price_locked');
  });

  it('still accepts limit changes, which apply to every subscriber', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ included_fills: 25 })
      .eq('id', customPlanId);
    expect(error).toBeNull();
  });

  it('can be retired, and stays readable to the organization on it', async () => {
    const { error } = await adminClient()
      .from('plans')
      .update({ active: false })
      .eq('id', customPlanId);
    expect(error).toBeNull();

    const { data, error: readError } = await fixture.orgA.usersByRole.operator.client
      .from('plans')
      .select('code, included_fills')
      .eq('code', customCode)
      .maybeSingle();
    expect(readError).toBeNull();
    expect(data).toEqual({ code: customCode, included_fills: 25 });
  });

  it('is hidden from organizations that are not on it once retired', async () => {
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('plans')
      .select('code')
      .eq('code', customCode);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('tenant sessions', () => {
  it('cannot create or edit plans', async () => {
    const owner = fixture.orgA.usersByRole.owner.client;

    const inserted = await owner
      .from('plans')
      .insert({ code: `${customCode}_tenant`, name: 'Tenant plan', storage_mb: 1 });
    expect(inserted.error).not.toBeNull();

    const updated = await owner
      .from('plans')
      .update({ included_fills: null })
      .eq('code', 'starter')
      .select('id');
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([]);
  });
});
