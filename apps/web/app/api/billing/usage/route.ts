import { buildUsageSummary } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { loadEntitlementContext } from '@/lib/billing/entitlements';

/** GET /api/billing/usage — live quota meters for the current billing period (§22.3). */
export const GET = handler('api.billing.usage', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'billing.view');

  const entitlements = await loadEntitlementContext(context);
  return ok({ usage: buildUsageSummary(entitlements), entitlements });
});
