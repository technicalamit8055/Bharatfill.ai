import { z } from 'zod';
import { notFound } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { createApplicationFromSessionSchema } from '@/lib/fill-sessions/schema';

const idSchema = z.string().uuid();

/** POST /api/fill-sessions/:id/create-application — convert a session into a tracked application. */
export const POST = handler(
  'api.fill_sessions.create_application',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.create');
    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, createApplicationFromSessionSchema);

    const { data: session, error: loadError } = await context.supabase
      .from('fill_sessions')
      .select('id, customer_id, application_id, portal_adapter_id, page_origin, page_title')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!session) throw notFound('errors.fill_session_not_found');

    let portalName: string | null = null;
    let formName: string | null = null;
    if (session.portal_adapter_id) {
      const { data: adapter } = await context.supabase
        .from('portal_adapters')
        .select('portal_name, form_name')
        .eq('id', session.portal_adapter_id)
        .maybeSingle();
      portalName = adapter?.portal_name ?? null;
      formName = adapter?.form_name ?? null;
    }

    const { data: application, error } = await context.supabase
      .from('applications')
      .insert({
        organization_id: context.organization.id,
        customer_id: session.customer_id,
        portal_adapter_id: session.portal_adapter_id,
        title: input.title || session.page_title || session.page_origin,
        category: input.category,
        portal_name: portalName ?? session.page_origin,
        form_name: formName,
        created_by: context.userId,
      })
      .select('id')
      .single();
    if (error) throw error;

    if (!session.application_id) {
      const { error: linkError } = await context.supabase
        .from('fill_sessions')
        .update({ application_id: application.id })
        .eq('id', id)
        .eq('organization_id', context.organization.id);
      if (linkError) throw linkError;
    }

    await writeAuditLog(context, {
      action: 'application.created',
      entityType: 'application',
      entityId: application.id as string,
      metadata: { fromFillSessionId: id },
    });

    return created({ application: { id: application.id } });
  },
);
