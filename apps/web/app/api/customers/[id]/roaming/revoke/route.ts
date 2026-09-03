import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, noContent } from '@/lib/api/response';
import { revokeRoamingAccess } from '@/lib/roaming/service';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/roaming/revoke
 *
 * "Lock / End Session" — ends the caller's own active roaming access immediately, before its
 * timer would otherwise have expired it.
 */
export const POST = handler(
  'api.customers.roaming.revoke',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const id = idSchema.parse((await ctx.params).id);
    await revokeRoamingAccess(context, id);

    return noContent();
  },
);
