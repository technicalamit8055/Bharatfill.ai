import { z } from 'zod';
import { handler, noContent } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { stopCentreAccess } from '@/lib/roaming/citizen-sessions';

const idSchema = z.string().uuid();

/** POST /api/citizen/centre-access/:id/stop — the centre loses access to the details at once. */
export const POST = handler(
  'api.citizen.centre_access.stop',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    await stopCentreAccess(
      {
        db: context.admin,
        citizenId: context.citizenId,
        phone: context.phone,
        now: () => new Date(),
      },
      id,
    );
    return noContent();
  },
);
