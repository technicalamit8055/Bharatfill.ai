import { z } from 'zod';
import { roamingAccessRequestSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { accessRequestDeps, requestCustomerAccess } from '@/lib/roaming/request-access';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/roaming/request-access
 *
 * The one "Request access" button (migration 0046): to the citizen's BharatDoc app when they have
 * one (`method: 'app'` — poll `…/app-request/:requestId`), otherwise a WhatsApp code
 * (`method: 'otp'` — verify with `…/verify-otp`). `durationMinutes` applies to the code only.
 */
export const POST = handler(
  'api.customers.roaming.request_access',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, roamingAccessRequestSchema);
    const result = await requestCustomerAccess(accessRequestDeps(context), id, input);

    return ok(result);
  },
);
