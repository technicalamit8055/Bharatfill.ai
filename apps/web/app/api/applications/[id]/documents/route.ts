import { z } from 'zod';
import { notFound } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { addApplicationDocumentSchema } from '@/lib/applications/schema';

const idSchema = z.string().uuid();

/** POST /api/applications/:id/documents — add a checklist requirement, or attach a document to one. */
export const POST = handler(
  'api.applications.documents.create',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const applicationId = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, addApplicationDocumentSchema);

    const { data: application, error: loadError } = await context.supabase
      .from('applications')
      .select('id')
      .eq('id', applicationId)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!application) throw notFound('errors.application_not_found');

    const status = input.documentId || input.derivativeId ? 'attached' : input.status;

    const { data, error } = await context.supabase
      .from('application_documents')
      .insert({
        organization_id: context.organization.id,
        application_id: applicationId,
        requirement_key: input.requirementKey,
        requirement_label: input.requirementLabel ?? null,
        document_id: input.documentId ?? null,
        derivative_id: input.derivativeId ?? null,
        preset_id: input.presetId ?? null,
        status,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;

    await writeAuditLog(context, {
      action: 'application.document_updated',
      entityType: 'application_document',
      entityId: data.id as string,
      metadata: { applicationId, requirementKey: input.requirementKey, status },
    });

    return created({ document: { id: data.id } });
  },
);
