import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { resolveRoamingAccess } from '@/lib/roaming/service';

const idSchema = z.string().uuid();

/**
 * GET /api/customers/:id/roaming
 *
 * The state machine the dashboard banner and the extension's `RoamingAuthBanner` both render
 * from: `home_org`, `roaming_locked` (masked card, no session) or `roaming_active` (a live
 * grant). See `RoamingAccessView` in packages/core/src/roaming/types.ts.
 */
export const GET = handler(
  'api.customers.roaming.get',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.view');

    const id = idSchema.parse((await ctx.params).id);
    const view = await resolveRoamingAccess(context, id);

    return ok(view);
  },
);
