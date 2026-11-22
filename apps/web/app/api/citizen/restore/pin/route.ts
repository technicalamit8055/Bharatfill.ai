import { citizenRestorePinSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { restoreWithPin } from '@/lib/citizen/account';
import { resolveCitizen } from '@/lib/citizen/context';

/**
 * POST /api/citizen/restore/pin — open the vault on a new phone with the Vault PIN
 * (docs/VAULT_BRIDGE_DESIGN.md §3.3). Five wrong in a row lock it for 24 h; ten ever switch the
 * PIN path off. The response carries the document key, so it is never cached.
 */
export const POST = handler('api.citizen.restore.pin', async (request) => {
  const context = await resolveCitizen(request);
  const input = await parseBody(request, citizenRestorePinSchema);
  return ok(await restoreWithPin(context, input), { headers: { 'cache-control': 'no-store' } });
});
