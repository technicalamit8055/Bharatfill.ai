import { handler, ok } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { listProfileRequests } from '@/lib/roaming/app-approval';
import { citizenApprovalContext } from '@/lib/roaming/approval-context';

/**
 * GET /api/citizen/profile-requests — centres asking, right now, to use the profile a centre
 * keeps for this citizen (migration 0039). Centre name and purpose only.
 */
export const GET = handler('api.citizen.profile_requests', async (request) => {
  const context = await resolveCitizen(request);
  const requests = await listProfileRequests(citizenApprovalContext(context));
  return ok({ requests }, { headers: { 'cache-control': 'no-store' } });
});
