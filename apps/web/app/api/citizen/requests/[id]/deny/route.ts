import { z } from 'zod';
import { handler, noContent } from '@/lib/api/response';
import { denyRequest } from '@/lib/citizen/access';
import { resolveCitizen } from '@/lib/citizen/context';

const idSchema = z.string().uuid();

/** POST /api/citizen/requests/:id/deny */
export const POST = handler(
  'api.citizen.requests.deny',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    await denyRequest(
      { db: context.admin, citizenId: context.citizenId, now: () => new Date() },
      id,
    );
    return noContent();
  },
);
