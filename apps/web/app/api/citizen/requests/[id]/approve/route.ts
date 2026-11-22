import { z } from 'zod';
import { accessRequestDecisionSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { approveRequest } from '@/lib/citizen/access';
import { resolveCitizen } from '@/lib/citizen/context';
import { touchDevice } from '@/lib/citizen/documents';

const idSchema = z.string().uuid();

/** POST /api/citizen/requests/:id/approve — let the centre that asked see the vault for a while. */
export const POST = handler(
  'api.citizen.requests.approve',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    await touchDevice(context, request);
    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, accessRequestDecisionSchema);
    const grant = await approveRequest(
      { db: context.admin, citizenId: context.citizenId, now: () => new Date() },
      id,
      input,
    );
    return ok({ grant });
  },
);
