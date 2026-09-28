import { resolvePlan } from '@assistigo/core';
import { resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { loadPlanByCode } from '@/lib/billing/plans';

/**
 * GET /api/me
 *
 * Who am I, which workspace am I in, and what am I allowed to do. Both the dashboard and the
 * Chrome extension call this immediately after connecting (spec §17.4).
 */
export const GET = handler('api.me', async (request) => {
  const context = await resolveContext(request);
  const planCode = context.organization.plan_code;
  const plan = resolvePlan({ planCode, plan: await loadPlanByCode(context.supabase, planCode) });

  return ok({
    user: {
      id: context.userId,
      email: context.email,
    },
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      businessType: context.organization.business_type,
      locale: context.organization.preferred_locale,
      state: context.organization.state,
      district: context.organization.district,
    },
    membership: {
      role: context.role,
      status: context.membership.status,
    },
    permissions: [...context.permissions],
    plan: {
      code: plan.code,
      name: plan.name,
      features: plan.features,
    },
  });
});
