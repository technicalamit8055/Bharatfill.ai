import { z } from 'zod';
import { notFound } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, noContent } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { logger } from '@/lib/api/logger';
import { removeDerivativeObject } from '@/lib/derivatives/storage';
import type { DocumentDerivativeRow } from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();

/**
 * DELETE /api/derivatives/:id
 *
 * A hard delete, unlike a document. A derivative carries no history worth keeping — it is a
 * regenerable copy of something the organization still holds — and the audit entry for its
 * creation stays either way. Keeping a tombstone row would only keep the bytes' size counted
 * against the storage limit for a file nobody can reach.
 *
 * Gated on `document.delete` and, again, by the RLS policy, which restricts derivative deletion
 * to owner and manager.
 */
export const DELETE = handler(
  'api.derivatives.delete',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.delete');

    const id = idSchema.parse((await ctx.params).id);

    const { data, error } = await context.supabase
      .from('document_derivatives')
      .select('id, storage_path, mime_type')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('errors.not_found');

    const row = data as Pick<DocumentDerivativeRow, 'id' | 'storage_path' | 'mime_type'>;

    // Bytes first: if this fails the row stays and the operator can retry. The other order
    // would leave an object nobody can find in order to delete it.
    try {
      await removeDerivativeObject(context.supabase, row.storage_path);
    } catch (storageError) {
      logger.warn('derivatives.storage_remove_failed', {
        derivativeId: id,
        dbError: storageError instanceof Error ? storageError.message : 'unknown',
      });
    }

    const { error: deleteError } = await context.supabase
      .from('document_derivatives')
      .delete()
      .eq('id', id)
      .eq('organization_id', context.organization.id);

    if (deleteError) throw deleteError;

    await writeAuditLog(context, {
      action: 'document.deleted',
      entityType: 'document_derivative',
      entityId: id,
      metadata: { mimeType: row.mime_type, kind: 'derivative' },
    });

    return noContent();
  },
);
