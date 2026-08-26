import { z } from 'zod';
import { notFound } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { updateApplicationDocumentSchema } from '@/lib/applications/schema';

const idSchema = z.string().uuid();

/** PATCH /api/applications/:id/documents/:docId — update a checklist requirement's status. */
export const PATCH = handler(
  'api.applications.documents.update',
  async (request, ctx: { params: Promise<{ id: string; docId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const { id: applicationId, docId } = await ctx.params;
    idSchema.parse(applicationId);
    idSchema.parse(docId);
    const input = await parseBody(request, updateApplicationDocumentSchema);

    const { data: existing, error: loadError } = await context.supabase
      .from('application_documents')
      .select('id')
      .eq('id', docId)
      .eq('application_id', applicationId)
      .eq('organization_id', context.organization.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!existing) throw notFound('errors.application_document_not_found');

    const patch: Record<string, unknown> = {};
    if (input.documentId !== undefined) patch.document_id = input.documentId;
    if (input.derivativeId !== undefined) patch.derivative_id = input.derivativeId;
    if (input.status !== undefined) patch.status = input.status;
    if (input.requirementLabel !== undefined) patch.requirement_label = input.requirementLabel;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length > 0) {
      const { error } = await context.supabase
        .from('application_documents')
        .update(patch)
        .eq('id', docId)
        .eq('organization_id', context.organization.id);
      if (error) throw error;

      await writeAuditLog(context, {
        action: 'application.document_updated',
        entityType: 'application_document',
        entityId: docId,
        metadata: { applicationId, fields: Object.keys(patch) },
      });
    }

    return ok({ id: docId });
  },
);
