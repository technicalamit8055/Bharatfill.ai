import { z } from 'zod';
import { roamingAppDecisionSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { approveProfileRequest } from '@/lib/roaming/app-approval';
import { citizenApprovalContext } from '@/lib/roaming/approval-context';

const idSchema = z.string().uuid();

/** POST /api/citizen/profile-requests/:id/approve — for the 1, 2 or 4 hours the citizen chose. */
export const POST = handler(
  'api.citizen.profile_requests.approve',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, roamingAppDecisionSchema);
    const approved = await approveProfileRequest(citizenApprovalContext(context), id, input);
    return ok({ approved });
  },
);
