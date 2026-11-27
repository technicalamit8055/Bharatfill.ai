import { z } from 'zod';
import { AppError, checkLedgerEntry, ledgerEntrySchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { loadBill } from '@/lib/khata/service';

const idSchema = z.string().uuid();

/**
 * POST /api/applications/:id/payments — add one line to the counter khata (migration 0050).
 *
 * A payment needs `application.update`; a refund needs `payment.refund` (owner, manager) as
 * well, and RLS refuses it for anyone else. The ledger is insert-only, so a wrong entry is
 * corrected with a refund, never edited away.
 */
export const POST = handler(
  'api.applications.payments.create',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const id = idSchema.parse((await ctx.params).id);
    const entry = await parseBody(request, ledgerEntrySchema);
    if (entry.kind === 'refund') requirePermission(context, 'payment.refund');

    const before = await loadBill(context.supabase, context.organization, id);
    const check = checkLedgerEntry(before.bill, entry);
    if (!check.ok) throw new AppError('VALIDATION_FAILED', check.messageKey);

    // customer_id, received_by and created_at are set by the insert trigger, not trusted from here.
    const { error } = await context.supabase.from('application_payments').insert({
      organization_id: context.organization.id,
      application_id: id,
      customer_id: before.customerId,
      kind: entry.kind,
      method: entry.method,
      amount: entry.amount,
      note: entry.note,
    });
    if (error) {
      // Another counter recorded money on the same bill a moment earlier.
      if (error.code === '23514') {
        throw new AppError(
          'CONFLICT',
          entry.kind === 'refund'
            ? 'errors.khata_refund_more_than_paid'
            : 'errors.khata_more_than_due',
        );
      }
      throw error;
    }

    await writeAuditLog(context, {
      action:
        entry.kind === 'refund' ? 'application.refund_recorded' : 'application.payment_recorded',
      entityType: 'application',
      entityId: id,
      // Amount and method, which an owner reconciling the drawer needs; the note may name a
      // person, so only whether there was one.
      metadata: { method: entry.method, amount: entry.amount, hasNote: entry.note !== null },
    });

    const { bill } = await loadBill(context.supabase, context.organization, id);
    return created({ bill });
  },
);
