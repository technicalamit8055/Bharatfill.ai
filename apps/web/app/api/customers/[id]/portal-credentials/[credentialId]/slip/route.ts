import { z } from 'zod';
import { AppError, credentialSlipRequestSchema, getPortal } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { createTranslator, localised } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import {
  NO_STORE,
  loadCredential,
  loadOwnCustomer,
  portalDisplayName,
} from '@/lib/portal-credentials/access';
import { readSecret } from '@/lib/portal-credentials/rows';
import { buildSlipMessage, sendSlipOnWhatsapp, type SlipContent } from '@/lib/portal-credentials/slip';

const idSchema = z.string().uuid();

/**
 * POST /api/customers/:id/portal-credentials/:credentialId/slip
 *
 * `{ channel: 'print' }` returns the slip's content for the dashboard to print on the counter's
 * thermal printer. `{ channel: 'whatsapp' }` sends it to the mobile on the customer's own record
 * and returns nothing secret. Either way it is a critical audit entry (spec §19.7a).
 */
export const POST = handler(
  'api.portal_credentials.slip',
  async (request, ctx: { params: Promise<{ id: string; credentialId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'credential.use');

    const params = await ctx.params;
    const customerId = idSchema.parse(params.id);
    const credentialId = idSchema.parse(params.credentialId);
    const { channel } = await parseBody(request, credentialSlipRequestSchema);

    const customer = await loadOwnCustomer(context, customerId);
    const row = await loadCredential(context, customerId, credentialId);
    const locale = await getLocale();
    const portal = getPortal(row.portal_key);

    const loginId = readSecret(row, 'login_id');
    if (loginId === null) throw new AppError('INTERNAL', 'errors.portal_credential_unreadable');

    const slip: SlipContent = {
      portalName: portalDisplayName(row, locale),
      loginIdLabel: localised(portal.loginIdLabel, locale),
      loginId,
      password: readSecret(row, 'password'),
      homeUrl: portal.homeUrl,
    };

    if (channel === 'whatsapp') {
      if (!customer.mobile) {
        throw new AppError('VALIDATION_FAILED', 'errors.portal_slip_no_mobile');
      }
      await sendSlipOnWhatsapp(customer.mobile, buildSlipMessage(createTranslator(locale), slip));
    }

    await writeAuditLog(context, {
      action: 'customer.portal_credential_slip_issued',
      entityType: 'customer',
      entityId: customerId,
      metadata: { credentialId, portalKey: row.portal_key, channel },
    });

    if (channel === 'whatsapp') return ok({ sent: true });
    return ok({ slip: { ...slip, customerName: customer.fullName } }, NO_STORE);
  },
);
