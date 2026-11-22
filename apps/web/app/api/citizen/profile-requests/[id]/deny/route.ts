import { z } from 'zod';
import { handler, noContent } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { denyProfileRequest } from '@/lib/roaming/app-approval';
import { citizenApprovalContext } from '@/lib/roaming/approval-context';

const idSchema = z.string().uuid();

/** POST /api/citizen/profile-requests/:id/deny */
export const POST = handler(
  'api.citizen.profile_requests.deny',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    await denyProfileRequest(citizenApprovalContext(context), id);
    return noContent();
  },
);
