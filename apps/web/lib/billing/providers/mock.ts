import 'server-only';
import {
  notFound,
  type BillingProvider,
  type CheckoutInput,
  type CheckoutResult,
  type PortalInput,
  type WebhookInput,
  type WebhookResult,
} from '@assistigo/core';
import type { AssistigoSupabaseClient } from '@/lib/supabase/server';

const PERIOD_DAYS = 30;

/**
 * Development/beta billing provider (§22.2). Applies a plan change immediately — no payment is
 * collected, no external redirect happens. Every call is real database state, so the rest of
 * the app (entitlements, the billing page, RLS) exercises exactly the same path a live provider
 * would use.
 */
export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock' as const;

  constructor(private readonly supabase: AssistigoSupabaseClient) {}

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
    const { data: plan, error: planError } = await this.supabase
      .from('plans')
      .select('id')
      .eq('code', input.planCode)
      .eq('active', true)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) throw notFound('errors.plan_not_found');

    const { data: existing, error: existingError } = await this.supabase
      .from('subscriptions')
      .select('id')
      .eq('organization_id', input.organizationId)
      .in('status', ['active', 'trialing', 'past_due'])
      .maybeSingle();
    if (existingError) throw existingError;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const row = {
      organization_id: input.organizationId,
      plan_id: plan.id as string,
      provider: 'mock' as const,
      status: 'active' as const,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    };

    const { error } = existing
      ? await this.supabase.from('subscriptions').update(row).eq('id', existing.id)
      : await this.supabase.from('subscriptions').insert(row);
    if (error) throw error;

    return { mode: 'instant', planCode: input.planCode, status: 'active' };
  }

  async handleWebhook(_input: WebhookInput): Promise<WebhookResult> {
    return { result: 'ignored', reason: 'The mock provider has no external webhooks.' };
  }

  async getPortalUrl(input: PortalInput): Promise<string> {
    return input.returnUrl;
  }
}
