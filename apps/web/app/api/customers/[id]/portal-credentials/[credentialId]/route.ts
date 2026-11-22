import { z } from 'zod';
import { updatePortalCredentialSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { listCredentials, loadCredential, loadOwnCustomer } from '@/lib/portal-credentials/access';
import {
  buildCredentialPatch,
  refOf,
  toPortalCredentialView,
} from '@/lib/portal-credentials/rows';

const idSchema = z.string().uuid();

type Params = { params: Promise<{ id: string; credentialId: string }> };

async function ids(ctx: Params): Promise<{ customerId: string; credentialId: string }> {
  const params = await ctx.params;
  return { customerId: idSchema.parse(params.id), credentialId: idSchema.parse(params.credentialId) };
}

/**
 * PATCH /api/customers/:id/portal-credentials/:credentialId
 *
 * Partial update. A secret that is absent from the body is kept; `null` clears it.
 */
export const PATCH = handler('api.portal_credentials.update', async (request, ctx: Params) => {
  const context = await resolveContext(request);
  requirePermission(context, 'credential.manage');

  const { customerId, credentialId } = await ids(ctx);
  const input = await parseBody(request, updatePortalCredentialSchema);
  await loadOwnCustomer(context, customerId);
  const current = await loadCredential(context, customerId, credentialId);

  const { patch, changed } = buildCredentialPatch(
    refOf(current),
    current.portal_key,
    input,
    context.userId,
    new Date().toISOString(),
  );

  if (changed.length > 0) {
    const { error } = await context.supabase
      .from('customer_portal_credentials')
      .update(patch)
      .eq('id', credentialId)
      .eq('organization_id', context.organization.id);
    if (error) throw error;

    await writeAuditLog(context, {
      action: 'customer.portal_credential_saved',
      entityType: 'customer',
      entityId: customerId,
      metadata: { credentialId, portalKey: current.portal_key, created: false, changed },
    });
  }

  const rows = await listCredentials(context, customerId);
  return ok({ credentials: rows.map(toPortalCredentialView) });
});

/** DELETE /api/customers/:id/portal-credentials/:credentialId */
export const DELETE = handler('api.portal_credentials.delete', async (request, ctx: Params) => {
  const context = await resolveContext(request);
  requirePermission(context, 'credential.manage');

  const { customerId, credentialId } = await ids(ctx);
  await loadOwnCustomer(context, customerId);
  const current = await loadCredential(context, customerId, credentialId);

  const { error } = await context.supabase
    .from('customer_portal_credentials')
    .delete()
    .eq('id', credentialId)
    .eq('organization_id', context.organization.id);
  if (error) throw error;

  await writeAuditLog(context, {
    action: 'customer.portal_credential_deleted',
    entityType: 'customer',
    entityId: customerId,
    metadata: { credentialId, portalKey: current.portal_key },
  });

  const rows = await listCredentials(context, customerId);
  return ok({ credentials: rows.map(toPortalCredentialView) });
});
