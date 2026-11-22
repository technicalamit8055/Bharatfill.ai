import { vaultUnlockSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { unlockWithCode } from '@/lib/vault/operator';

/**
 * POST /api/vault/unlock — the 6-digit code the citizen reads out from Share with centre.
 * Every failure (wrong code, expired, no vault, cloud off) is the same `errors.vault.code_wrong`.
 */
export const POST = handler('api.vault.unlock', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'vault.access');
  const { mobile, code } = await parseBody(request, vaultUnlockSchema);
  return ok(
    { grant: await unlockWithCode(operatorVaultContext(context), mobile, code) },
    { headers: { 'cache-control': 'no-store' } },
  );
});
