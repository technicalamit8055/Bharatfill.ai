import { z } from 'zod';
import { AppError } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { createTranslator } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { buildBillMessage } from '@/lib/khata/bill';
import { loadBill, sendBillOnWhatsapp } from '@/lib/khata/service';

const idSchema = z.string().uuid();

/**
 * POST /api/applications/:id/bill/whatsapp — send the receipt to the mobile on the customer's
 * own record, from the platform's WhatsApp number. The operator never types or picks the
 * number, so a bill cannot be sent to the wrong person by a slip of the finger.
 */
export const POST = handler(
  'api.applications.bill.whatsapp',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const id = idSchema.parse((await ctx.params).id);

    const { bill, customerMobile } = await loadBill(context.supabase, context.organization, id);
    if (bill.total === null) throw new AppError('VALIDATION_FAILED', 'errors.khata_no_fees');
    if (!customerMobile) throw new AppError('VALIDATION_FAILED', 'errors.khata_no_mobile');

    const locale = await getLocale();
    await sendBillOnWhatsapp(customerMobile, buildBillMessage(createTranslator(locale), bill));

    await writeAuditLog(context, {
      action: 'application.bill_sent',
      entityType: 'application',
      entityId: id,
      metadata: { channel: 'whatsapp' },
    });

    return ok({ sent: true });
  },
);
