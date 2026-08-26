import {
  DERIVATIVE_BUCKET,
  checkUsageEntitlement,
  derivativeStoragePath,
  entitlementExceeded,
  notFound,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import { derivativeIntentSchema } from '@/lib/derivatives/schema';
import { createSignedDerivativeUploadUrl } from '@/lib/derivatives/storage';

/**
 * POST /api/derivatives/upload-intent
 *
 * Hands back a one-time upload URL for a prepared file, scoped to a single org-owned path
 * (§17.4). Deliberately does *not* insert the row: a derivative has no "pending" state, and a
 * row written before the bytes exist would be a broken entry in the customer's prepared-files
 * list if the operator closed the tab. `POST /api/derivatives` writes the row once the object is
 * verified.
 */
export const POST = handler('api.derivatives.upload_intent', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'documenttool.use');

  const input = await parseBody(request, derivativeIntentSchema);

  // A prepared file may only point at a customer and a source document in the caller's own
  // organization. RLS would refuse a foreign id on insert, but failing here gives the operator a
  // real message instead of a 500 after they have already waited for an upload.
  if (input.customerId) {
    const { data, error } = await context.supabase
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound('errors.not_found');
  }

  if (input.sourceDocumentId) {
    const { data, error } = await context.supabase
      .from('documents')
      .select('id')
      .eq('id', input.sourceDocumentId)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound('errors.not_found');
  }

  const entitlements = await loadEntitlementContext(context);
  const sizeMb = Math.ceil(input.sizeBytes / (1024 * 1024));
  const storage = checkUsageEntitlement(entitlements, 'storage', sizeMb);
  if (!storage.allowed) throw entitlementExceeded(storage.reason);

  const derivativeId = crypto.randomUUID();
  const storagePath = derivativeStoragePath({
    organizationId: context.organization.id,
    derivativeId,
    filename: input.filename,
  });

  const upload = await createSignedDerivativeUploadUrl(context.supabase, storagePath);

  return created({
    derivativeId,
    storagePath,
    bucket: DERIVATIVE_BUCKET,
    uploadUrl: upload.url,
    uploadToken: upload.token,
  });
});
