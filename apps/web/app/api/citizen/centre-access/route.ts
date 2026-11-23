import { handler, ok } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { listCentreProfiles } from '@/lib/roaming/citizen-locks';
import { listCentreAccess } from '@/lib/roaming/citizen-sessions';

/**
 * GET /api/citizen/centre-access — the centres that can use the citizen's details now, and the
 * sessions of the last 30 days (migration 0042); plus `centres`, the centres that created a
 * profile for this number and whether the citizen locked each (migration 0046). Centre name,
 * purpose, times and lock state only.
 */
export const GET = handler('api.citizen.centre_access', async (request) => {
  const context = await resolveCitizen(request);
  const ctx = {
    db: context.admin,
    citizenId: context.citizenId,
    phone: context.phone,
    now: () => new Date(),
  };
  const [sessions, centres] = await Promise.all([listCentreAccess(ctx), listCentreProfiles(ctx)]);
  return ok({ sessions, centres }, { headers: { 'cache-control': 'no-store' } });
});
