import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { checkoutSchema } from '@/lib/billing/schema';
import { getBillingProvider } from '@/lib/billing/providers';
import { publicEnv } from '@/lib/env';

/**
 * POST /api/billing/checkout — start (or, for the mock provider, instantly apply) a plan change.
 */
export const POST = handler('api.billing.checkout', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'billing.manage');
  const input = await parseBody(request, checkoutSchema);

  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  const provider = getBillingProvider(context.supabase);
  const result = await provider.createCheckoutSession({
    organizationId: context.organization.id,
    planCode: input.planCode,
    successUrl: `${appUrl}/billing`,
    cancelUrl: `${appUrl}/billing`,
    customerEmail: context.email,
  });

  if (result.mode === 'instant') {
    await writeAuditLog(context, {
      action: 'billing.plan_changed',
      entityType: 'subscription',
      entityId: context.organization.id,
      metadata: { planCode: result.planCode, status: result.status, provider: provider.name },
    });
  }

  return ok(result);
});
