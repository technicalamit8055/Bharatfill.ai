/**
 * Tests for the mock billing provider — the only `BillingProvider` implementation wired up so
 * far (§22.2). What matters here is that a plan change is idempotent per organization (one
 * subscription row, updated in place, never a second row racing the unique
 * `subscriptions_one_active_per_org_idx`) and that an inactive/unknown plan code is refused.
 */

import { describe, expect, it } from 'vitest';
import { AppError } from '@assistigo/core';
import { MockBillingProvider } from './mock';

type Captured = { table: string; op: 'insert' | 'update'; payload: Record<string, unknown> };

function stubClient(options: { plan?: { id: string } | null; existingSubscriptionId?: string | null }) {
  const captured: Captured[] = [];
  const plan = options.plan === undefined ? { id: 'plan-starter' } : options.plan;
  const existingSubscriptionId =
    options.existingSubscriptionId === undefined ? null : options.existingSubscriptionId;

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: () => {
          if (table === 'plans') return Promise.resolve({ data: plan, error: null });
          if (table === 'subscriptions') {
            return Promise.resolve({
              data: existingSubscriptionId ? { id: existingSubscriptionId } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: (payload: Record<string, unknown>) => {
          captured.push({ table, op: 'insert', payload });
          return Promise.resolve({ error: null });
        },
        update: (payload: Record<string, unknown>) => {
          captured.push({ table, op: 'update', payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return builder;
    },
  };

  return { client: client as never, captured };
}

const INPUT = {
  organizationId: 'org-1',
  planCode: 'starter' as const,
  successUrl: 'https://example.test/billing',
  cancelUrl: 'https://example.test/billing',
};

describe('MockBillingProvider.createCheckoutSession', () => {
  it('inserts a subscription when the organization has none yet', async () => {
    const { client, captured } = stubClient({ existingSubscriptionId: null });
    const provider = new MockBillingProvider(client);

    const result = await provider.createCheckoutSession(INPUT);

    expect(result).toEqual({ mode: 'instant', planCode: 'starter', status: 'active' });
    const write = captured.find((entry) => entry.table === 'subscriptions');
    expect(write?.op).toBe('insert');
    expect(write?.payload).toMatchObject({
      organization_id: 'org-1',
      plan_id: 'plan-starter',
      provider: 'mock',
      status: 'active',
    });
  });

  it('updates the existing subscription in place rather than inserting a second row', async () => {
    const { client, captured } = stubClient({ existingSubscriptionId: 'sub-1' });
    const provider = new MockBillingProvider(client);

    const result = await provider.createCheckoutSession(INPUT);

    expect(result).toEqual({ mode: 'instant', planCode: 'starter', status: 'active' });
    const write = captured.find((entry) => entry.table === 'subscriptions');
    expect(write?.op).toBe('update');
    expect(write?.payload).toMatchObject({ plan_id: 'plan-starter', status: 'active' });
  });

  it('refuses a plan code that has no active row in the plans table', async () => {
    const { client } = stubClient({ plan: null });
    const provider = new MockBillingProvider(client);

    await expect(provider.createCheckoutSession(INPUT)).rejects.toBeInstanceOf(AppError);
  });
});

describe('MockBillingProvider.handleWebhook / getPortalUrl', () => {
  it('ignores webhooks — the mock provider never sends any', async () => {
    const { client } = stubClient({});
    const provider = new MockBillingProvider(client);

    const result = await provider.handleWebhook({
      providerEventId: 'evt_1',
      eventType: 'subscription.updated',
      payload: {},
    });

    expect(result.result).toBe('ignored');
  });

  it('bounces the portal straight back to the return URL — there is no hosted portal', async () => {
    const { client } = stubClient({});
    const provider = new MockBillingProvider(client);

    const url = await provider.getPortalUrl({
      organizationId: 'org-1',
      returnUrl: 'https://example.test/billing',
    });

    expect(url).toBe('https://example.test/billing');
  });
});
