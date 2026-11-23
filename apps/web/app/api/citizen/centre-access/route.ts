import { handler, ok } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { listCentreAccess } from '@/lib/roaming/citizen-sessions';

/**
 * GET /api/citizen/centre-access — the centres that can use the citizen's details now, and the
 * sessions of the last 30 days (migration 0042). Centre name, purpose and times only.
 */
export const GET = handler('api.citizen.centre_access', async (request) => {
  const context = await resolveCitizen(request);
  const sessions = await listCentreAccess({
    db: context.admin,
    citizenId: context.citizenId,
    phone: context.phone,
    now: () => new Date(),
  });
  return ok({ sessions }, { headers: { 'cache-control': 'no-store' } });
});
