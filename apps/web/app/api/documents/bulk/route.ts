import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { logger } from '@/lib/api/logger';
import { removeObject } from '@/lib/documents/storage';
import { bulkDeleteSchema } from '@/lib/documents/schema';
import type { DocumentRow } from '@/lib/supabase/database.types';

/**
 * DELETE /api/documents/bulk
 *
 * Same soft-delete-plus-hard-delete-bytes shape as `DELETE /api/documents/:id`, run once per
 * requested id so a failure on one document never blocks the rest and each deletion still gets
 * its own `document.deleted` audit row (docs/SECURITY.md §6 — delete is a per-event action, not
 * a batch summary).
 */
export const DELETE = handler('api.documents.bulk_delete', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'document.delete');

  const { ids } = await parseBody(request, bulkDeleteSchema);
  const uniqueIds = Array.from(new Set(ids));

  const { data, error } = await context.supabase
    .from('documents')
    .select('id, storage_bucket, storage_path')
    .in('id', uniqueIds)
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null);

  if (error) throw error;

  const rows = (data ?? []) as Pick<DocumentRow, 'id' | 'storage_bucket' | 'storage_path'>[];
  const foundIds = new Set(rows.map((row) => row.id));

  const deleted: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    try {
      // Remove the bytes first, same ordering as the single-document route: if this fails the
      // row stays live and the operator can retry, rather than leaving an orphaned object.
      try {
        await removeObject(context.supabase, row.storage_path, row.storage_bucket);
      } catch (storageError) {
        logger.warn('documents.storage_remove_failed', {
          documentId: row.id,
          dbError: storageError instanceof Error ? storageError.message : 'unknown',
        });
      }

      const { error: updateError } = await context.supabase
        .from('documents')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('organization_id', context.organization.id);

      if (updateError) throw updateError;

      await writeAuditLog(context, {
        action: 'document.deleted',
        entityType: 'document',
        entityId: row.id,
      });

      deleted.push(row.id);
    } catch (rowError) {
      logger.error('documents.bulk_delete_row_failed', {
        documentId: row.id,
        dbError: rowError instanceof Error ? rowError.message : 'unknown',
      });
      failed.push(row.id);
    }
  }

  // Ids that were never found (already deleted, wrong org, or bogus) are reported back so the UI
  // can tell an operator their selection went stale rather than silently doing nothing.
  const notFound = uniqueIds.filter((id) => !foundIds.has(id));

  return ok({ deleted, failed, notFound });
});
