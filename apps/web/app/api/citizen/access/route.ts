import { handler, ok } from '@/lib/api/response';
import { listAccess } from '@/lib/citizen/access';
import { resolveCitizen } from '@/lib/citizen/context';

/** GET /api/citizen/access — live and recent grants, pending requests and access history. */
export const GET = handler('api.citizen.access', async (request) => {
  const context = await resolveCitizen(request);
  const overview = await listAccess({
    db: context.admin,
    citizenId: context.citizenId,
    now: () => new Date(),
  });
  return ok(overview, { headers: { 'cache-control': 'no-store' } });
});
