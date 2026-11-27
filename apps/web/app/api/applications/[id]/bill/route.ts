import { z } from 'zod';
import { AppError, billFeesSchema, checkFees } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { loadBill } from '@/lib/khata/service';

const idSchema = z.string().uuid();

/** GET /api/applications/:id/bill — the counter bill and its khata lines (migration 0050). */
export const GET = handler(
  'api.applications.bill.get',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.view');
    const id = idSchema.parse((await ctx.params).id);
    const { bill } = await loadBill(context.supabase, context.organization, id);
    return ok({ bill });
  },
);

/**
 * PUT /api/applications/:id/bill — set or correct the government fee and the service charge.
 * The database sums them into `amount_charged`, derives the payment status and issues the bill
 * number the first time.
 */
export const PUT = handler(
  'api.applications.bill.update',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const id = idSchema.parse((await ctx.params).id);
    const fees = await parseBody(request, billFeesSchema);

    const before = await loadBill(context.supabase, context.organization, id);
    const check = checkFees(fees, before.bill.paid);
    if (!check.ok) throw new AppError('VALIDATION_FAILED', check.messageKey);

    const { error } = await context.supabase
      .from('applications')
      .update({ govt_fee: fees.govtFee, service_charge: fees.serviceCharge })
      .eq('id', id)
      .eq('organization_id', context.organization.id);
    if (error) {
      // A payment landed between the check and the write.
      if (error.code === '23514') throw new AppError('CONFLICT', 'errors.khata_fee_below_paid');
      throw error;
    }

    const fields: string[] = [];
    if (fees.govtFee !== before.bill.govtFee) fields.push('govt_fee');
    if (fees.serviceCharge !== before.bill.serviceCharge) fields.push('service_charge');
    await writeAuditLog(context, {
      action: 'application.fees_set',
      entityType: 'application',
      entityId: id,
      metadata: { fields },
    });

    const { bill } = await loadBill(context.supabase, context.organization, id);
    return ok({ bill });
  },
);
