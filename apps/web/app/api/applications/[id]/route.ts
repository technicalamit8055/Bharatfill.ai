import { z } from 'zod';
import { notFound } from '@assistigo/core';
import { requirePermission, resolveContext, type RequestContext } from '@/lib/api/context';
import { handler, noContent, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { updateApplicationSchema } from '@/lib/applications/schema';
import type { ApplicationRow } from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();

async function loadApplication(context: RequestContext, id: string): Promise<ApplicationRow> {
  const { data, error } = await context.supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.application_not_found');
  return data as ApplicationRow;
}

export const GET = handler('api.applications.get', async (request, ctx: { params: Promise<{ id: string }> }) => {
  const context = await resolveContext(request);
  requirePermission(context, 'application.view');
  const id = idSchema.parse((await ctx.params).id);
  const application = await loadApplication(context, id);

  const [{ data: customer }, { data: documents }, { data: statusEvents }, { data: fillSessions }] =
    await Promise.all([
      context.supabase
        .from('customers')
        .select('id, full_name, customer_code, mobile')
        .eq('id', application.customer_id)
        .maybeSingle(),
      context.supabase
        .from('application_documents')
        .select('*')
        .eq('organization_id', context.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: true }),
      context.supabase
        .from('application_status_events')
        .select('*')
        .eq('organization_id', context.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
      context.supabase
        .from('fill_sessions')
        .select('id, status, page_origin, page_title, filled_fields_count, created_at')
        .eq('organization_id', context.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
    ]);

  return ok({
    application,
    customer: customer ?? null,
    documents: documents ?? [],
    statusEvents: statusEvents ?? [],
    fillSessions: fillSessions ?? [],
  });
});

export const PATCH = handler(
  'api.applications.update',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const id = idSchema.parse((await ctx.params).id);
    await loadApplication(context, id);
    const input = await parseBody(request, updateApplicationSchema);

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.category !== undefined) patch.category = input.category;
    if (input.portalName !== undefined) patch.portal_name = input.portalName || null;
    if (input.formName !== undefined) patch.form_name = input.formName || null;
    if (input.portalUrl !== undefined) patch.portal_url = input.portalUrl || null;
    if (input.portalReferenceNumber !== undefined) {
      patch.portal_reference_number = input.portalReferenceNumber || null;
    }
    if (input.deadlineAt !== undefined) patch.deadline_at = input.deadlineAt || null;
    if (input.amountCharged !== undefined) patch.amount_charged = input.amountCharged;
    if (input.paymentStatus !== undefined) patch.payment_status = input.paymentStatus;
    if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length > 0) {
      const { error } = await context.supabase
        .from('applications')
        .update(patch)
        .eq('id', id)
        .eq('organization_id', context.organization.id);
      if (error) throw error;

      await writeAuditLog(context, {
        action: 'application.updated',
        entityType: 'application',
        entityId: id,
        metadata: { fields: Object.keys(patch) },
      });
    }

    return ok({ id });
  },
);

export const DELETE = handler(
  'api.applications.delete',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.delete');
    const id = idSchema.parse((await ctx.params).id);
    await loadApplication(context, id);

    const { error } = await context.supabase
      .from('applications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', context.organization.id);
    if (error) throw error;

    await writeAuditLog(context, {
      action: 'application.deleted',
      entityType: 'application',
      entityId: id,
      metadata: {},
    });

    return noContent();
  },
);
