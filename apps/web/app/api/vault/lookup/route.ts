import { vaultLookupSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { lookupVault } from '@/lib/vault/operator';

/**
 * POST /api/vault/lookup — ask a citizen for vault access by mobile number
 * (docs/VAULT_BRIDGE_DESIGN.md §4.1). The answer is the same whether or not the number has a
 * vault: a request id to poll, and the code box. Rate-limited per operator and per centre.
 */
export const POST = handler('api.vault.lookup', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'vault.access');
  const { mobile } = await parseBody(request, vaultLookupSchema);
  return ok(await lookupVault(operatorVaultContext(context), mobile), {
    headers: { 'cache-control': 'no-store' },
  });
});
