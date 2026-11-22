import { z } from 'zod';
import { notFound, revealPortalCredentialSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { NO_STORE, loadCredential, loadOwnCustomer } from '@/lib/portal-credentials/access';
import { readSecret } from '@/lib/portal-credentials/rows';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/portal-credentials/:credentialId/reveal
 *
 * Returns one secret part — login ID, password or security answer — and audits it as critical.
 * One part per call, so the audit trail records exactly what was looked at (spec §19.7a).
 */
export const POST = handler(
  'api.portal_credentials.reveal',
  async (request, ctx: { params: Promise<{ id: string; credentialId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'credential.use');

    const params = await ctx.params;
    const customerId = idSchema.parse(params.id);
    const credentialId = idSchema.parse(params.credentialId);
    const { part } = await parseBody(request, revealPortalCredentialSchema);

    await loadOwnCustomer(context, customerId);
    const row = await loadCredential(context, customerId, credentialId);
    const value = readSecret(row, part);
    if (value === null) throw notFound('errors.not_found');

    await writeAuditLog(context, {
      action: 'customer.portal_credential_revealed',
      entityType: 'customer',
      entityId: customerId,
      metadata: { credentialId, portalKey: row.portal_key, part },
    });

    return ok({ part, value }, NO_STORE);
  },
);
