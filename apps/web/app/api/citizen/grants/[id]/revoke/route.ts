import { z } from 'zod';
import { handler, noContent } from '@/lib/api/response';
import { revokeGrant } from '@/lib/citizen/access';
import { resolveCitizen } from '@/lib/citizen/context';

const idSchema = z.string().uuid();

/** POST /api/citizen/grants/:id/revoke — Stop: the centre loses access at once. */
export const POST = handler(
  'api.citizen.grants.revoke',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    await revokeGrant(
      { db: context.admin, citizenId: context.citizenId, now: () => new Date() },
      id,
    );
    return noContent();
  },
);
