import { vaultDocumentIntentSchema } from '@assistigo/core';
import { created, handler, ok, parseBody } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { createUploadIntent, listVaultDocuments, touchDevice } from '@/lib/citizen/documents';

/**
 * /api/citizen/documents — the citizen's synced documents (docs/VAULT_BRIDGE_DESIGN.md §3.2).
 * Citizen bearer token plus the `x-bharatfill-device` header of a phone holding the vault key.
 */

/** GET — metadata of every synced document (never bytes, never a URL). */
export const GET = handler('api.citizen.documents.list', async (request) => {
  const context = await resolveCitizen(request);
  await touchDevice(context, request);
  return ok({ documents: await listVaultDocuments(context) });
});

/** POST — start an upload: a pending row and a short-lived signed upload URL. */
export const POST = handler('api.citizen.documents.intent', async (request) => {
  const context = await resolveCitizen(request);
  await touchDevice(context, request);
  const input = await parseBody(request, vaultDocumentIntentSchema);
  return created(await createUploadIntent(context, input));
});
