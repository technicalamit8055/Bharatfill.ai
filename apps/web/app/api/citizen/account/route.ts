import { citizenAccountCreateSchema, citizenAccountUpdateSchema } from '@assistigo/core';
import { handler, noContent, ok, parseBody } from '@/lib/api/response';
import {
  createCitizenAccount,
  deleteCitizenAccount,
  getCitizenAccount,
  updateCitizenAccount,
} from '@/lib/citizen/account';
import { resolveCitizen } from '@/lib/citizen/context';

/**
 * /api/citizen/account — the citizen app's own account (docs/VAULT_BRIDGE_DESIGN.md §3).
 *
 * Citizen bearer token only (`resolveCitizen`); an operator's token gets 404.
 * The POST response carries the citizen's document key, so it is never cached anywhere.
 */

const NO_STORE = { headers: { 'cache-control': 'no-store' } };

/** GET — `{ account }`, or `{ account: null }` when sign-in finished but sign-up did not. */
export const GET = handler('api.citizen.account.get', async (request) => {
  const context = await resolveCitizen(request);
  return ok({ account: await getCitizenAccount(context) }, NO_STORE);
});

/** POST — finish sign-up: name, language, Vault PIN, consent. Returns the document key once. */
export const POST = handler('api.citizen.account.create', async (request) => {
  const context = await resolveCitizen(request);
  const input = await parseBody(request, citizenAccountCreateSchema);
  return ok(await createCitizenAccount(context, input), NO_STORE);
});

/** PATCH — name, language, cloud sync on/off. */
export const PATCH = handler('api.citizen.account.update', async (request) => {
  const context = await resolveCitizen(request);
  const patch = await parseBody(request, citizenAccountUpdateSchema);
  return ok({ account: await updateCitizenAccount(context, patch) }, NO_STORE);
});

/** DELETE — delete the account and every synced document. */
export const DELETE = handler('api.citizen.account.delete', async (request) => {
  const context = await resolveCitizen(request);
  await deleteCitizenAccount(context);
  return noContent();
});
