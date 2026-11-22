import { shareCodeIssueSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { issueShareCode } from '@/lib/citizen/access';
import { resolveCitizen } from '@/lib/citizen/context';
import { touchDevice } from '@/lib/citizen/documents';

/**
 * POST /api/citizen/share-code — a 6-digit code to read out at the counter (5 min, one use).
 * Returned once and never stored in the clear; a new code retires the previous one. Needs the
 * device header, so only a phone holding the vault can issue one.
 */
export const POST = handler('api.citizen.share_code', async (request) => {
  const context = await resolveCitizen(request);
  await touchDevice(context, request);
  const input = await parseBody(request, shareCodeIssueSchema);
  const issued = await issueShareCode(
    { db: context.admin, citizenId: context.citizenId, now: () => new Date() },
    input,
  );
  return ok(issued, { headers: { 'cache-control': 'no-store' } });
});
