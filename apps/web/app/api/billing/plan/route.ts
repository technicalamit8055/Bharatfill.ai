import { ALL_PLANS } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';

/** GET /api/billing/plan — the plan catalogue plus this organization's active subscription. */
export const GET = handler('api.billing.plan', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'billing.view');

  const { data: subscription, error } = await context.supabase
    .from('subscriptions')
    .select('*, plans(code, name, name_hi)')
    .eq('organization_id', context.organization.id)
    .in('status', ['active', 'trialing', 'past_due', 'cancelled', 'incomplete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return ok({
    plans: ALL_PLANS,
    activePlanCode: context.organization.plan_code,
    subscription: subscription ?? null,
  });
});
