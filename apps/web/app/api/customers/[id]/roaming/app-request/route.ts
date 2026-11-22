import { z } from 'zod';
import { roamingAppRequestSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { requestAppApproval } from '@/lib/roaming/app-approval';
import { operatorApprovalContext } from '@/lib/roaming/approval-context';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/roaming/app-request
 *
 * Asks the roaming citizen to approve access in the BharatDoc app (migration 0039). Takes no
 * duration — the citizen picks it on their phone. The answer is the same whether or not the
 * customer uses the app.
 */
export const POST = handler(
  'api.customers.roaming.app_request',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, roamingAppRequestSchema);
    const result = await requestAppApproval(operatorApprovalContext(context), id, input);

    return ok(result);
  },
);
