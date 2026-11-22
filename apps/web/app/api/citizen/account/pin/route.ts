import { citizenVaultPinChangeSchema } from '@assistigo/core';
import { logger } from '@/lib/api/logger';
import { handler, noContent, parseBody } from '@/lib/api/response';
import { changeVaultPin } from '@/lib/citizen/account';
import { resolveCitizen } from '@/lib/citizen/context';

/**
 * POST /api/citizen/account/pin — change the Vault PIN (docs/VAULT_BRIDGE_DESIGN.md D17).
 *
 * Body `{ currentPin, newPin }`. A wrong current PIN counts toward the restore limits. On success
 * every other session of this citizen is signed out, so a phone someone else set up — a centre
 * that "made the account" for them — no longer reaches the vault. This phone stays signed in.
 */
export const POST = handler('api.citizen.account.pin', async (request) => {
  const context = await resolveCitizen(request);
  const input = await parseBody(request, citizenVaultPinChangeSchema);
  await changeVaultPin(context, input);

  // resolveCitizen already checked this bearer token.
  const token = request.headers.get('authorization')?.slice(7).trim() ?? '';
  const { error } = await context.admin.auth.admin.signOut(token, 'others');
  if (error) {
    // The PIN changed either way; other phones still need it to restore. Not worth failing for.
    logger.warn('citizen.vault_pin_signout_others_failed', { citizenId: context.citizenId });
  }
  return noContent();
});
