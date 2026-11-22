import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conflict, createPortalCredentialSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { listCredentials, loadOwnCustomer } from '@/lib/portal-credentials/access';
import { buildCredentialInsert, toPortalCredentialView } from '@/lib/portal-credentials/rows';

const idSchema = z.string().uuid();

/**
 * GET /api/customers/:id/portal-credentials
 *
 * The customer's portal logins, masked: portal, the last characters of the login ID, and
 * whether a password / security answer is on file. No secret is ever in this response
 * (spec §19.7a). Used by the dashboard card and by the extension to decide whether to offer a
 * one-click login.
 */
export const GET = handler(
  'api.portal_credentials.list',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'credential.use');

    const customerId = idSchema.parse((await ctx.params).id);
    await loadOwnCustomer(context, customerId);

    const rows = await listCredentials(context, customerId);
    return ok({ credentials: rows.map(toPortalCredentialView) });
  },
);

/**
 * POST /api/customers/:id/portal-credentials
 *
 * Saves a portal login. The login ID, password and security answer are encrypted before the
 * insert, bound to this row by its id (chosen here for that reason).
 */
export const POST = handler(
  'api.portal_credentials.create',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'credential.manage');

    const customerId = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, createPortalCredentialSchema);
    await loadOwnCustomer(context, customerId);

    const ref = {
      organizationId: context.organization.id,
      customerId,
      credentialId: randomUUID(),
    };
    const row = buildCredentialInsert(ref, input, context.userId, new Date().toISOString());

    const { data, error } = await context.supabase
      .from('customer_portal_credentials')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      // One login per catalogued portal per customer (unique index in 0036).
      if (error.code === '23505') throw conflict('errors.portal_credential_exists');
      throw error;
    }

    await writeAuditLog(context, {
      action: 'customer.portal_credential_saved',
      entityType: 'customer',
      entityId: customerId,
      metadata: {
        credentialId: (data as { id: string }).id,
        portalKey: input.portalKey,
        created: true,
        // Part names only. (A key containing "password" would be redacted by writeAuditLog.)
        changed: [
          'login_id',
          ...(input.password ? ['password'] : []),
          ...(input.securityAnswer ? ['security_answer'] : []),
        ],
      },
    });

    const rows = await listCredentials(context, customerId);
    return created({ credentials: rows.map(toPortalCredentialView) });
  },
);
