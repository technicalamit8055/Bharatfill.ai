import { z } from 'zod';
import { handler, ok } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { trustCentreAccess } from '@/lib/roaming/citizen-sessions';

const idSchema = z.string().uuid();

/**
 * POST /api/citizen/centre-access/:id/trust — keep this live session for 30 days (a trusted
 * centre), or renew a trusted one for another 30. At most three at once (migration 0042).
 */
export const POST = handler(
  'api.citizen.centre_access.trust',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    const id = idSchema.parse((await ctx.params).id);
    const trusted = await trustCentreAccess(
      {
        db: context.admin,
        citizenId: context.citizenId,
        phone: context.phone,
        now: () => new Date(),
      },
      id,
    );
    return ok({ trusted });
  },
);
