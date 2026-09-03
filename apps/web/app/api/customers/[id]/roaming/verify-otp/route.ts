import { z } from 'zod';
import { roamingOtpVerifySchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { verifyRoamingOtp } from '@/lib/roaming/service';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/roaming/verify-otp
 *
 * Verifies the code the citizen read off their own phone and, only on success, mints the
 * time-boxed `customer_access_grants` row that unlocks the profile and documents.
 */
export const POST = handler(
  'api.customers.roaming.verify_otp',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, roamingOtpVerifySchema);
    const session = await verifyRoamingOtp(context, id, input.otp);

    return ok({ session });
  },
);
