import { z } from 'zod';
import { roamingOtpRequestSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { requestRoamingOtp } from '@/lib/roaming/service';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/roaming/request-otp
 *
 * Mints a five-minute consent code and sends it to the citizen's own phone. Never returns the
 * code itself — only that it went out, and to which masked number (§19.2, migration 0024).
 */
export const POST = handler(
  'api.customers.roaming.request_otp',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, roamingOtpRequestSchema);
    const result = await requestRoamingOtp(context, id, input);

    return ok(result);
  },
);
