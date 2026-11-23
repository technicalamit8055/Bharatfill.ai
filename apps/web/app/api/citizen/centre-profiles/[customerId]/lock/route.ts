import { z } from 'zod';
import { handler, noContent } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { lockCentreProfile, unlockCentreProfile } from '@/lib/roaming/citizen-locks';

const idSchema = z.string().uuid();

type Params = { params: Promise<{ customerId: string }> };

async function citizenContext(request: Request) {
  const context = await resolveCitizen(request);
  return {
    db: context.admin,
    citizenId: context.citizenId,
    phone: context.phone,
    now: () => new Date(),
  };
}

/**
 * POST /api/citizen/centre-profiles/:customerId/lock — the centre that created this profile can
 * no longer open it (migration 0046). It keeps the customer in its list, masked, with their
 * scheme matches, and must ask again (app or WhatsApp) to open the details for a while.
 */
export const POST = handler('api.citizen.centre_profiles.lock', async (request, ctx: Params) => {
  const context = await citizenContext(request);
  await lockCentreProfile(context, idSchema.parse((await ctx.params).customerId));
  return noContent();
});

/** DELETE — unlock: the centre works with the profile as before. */
export const DELETE = handler(
  'api.citizen.centre_profiles.unlock',
  async (request, ctx: Params) => {
    const context = await citizenContext(request);
    await unlockCentreProfile(context, idSchema.parse((await ctx.params).customerId));
    return noContent();
  },
);
