import { DERIVATIVE_BUCKET, derivativeStoragePath, validationFailed } from '@assistigo/core';
import { buildDerivativeMetadata, TOOL_TO_DB_TOOL_TYPE } from '@assistigo/document-tools';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { logger } from '@/lib/api/logger';
import { recordUsage } from '@/lib/billing/entitlements';
import { derivativeCreateSchema, derivativeListSchema } from '@/lib/derivatives/schema';
import { removeDerivativeObject, verifyDerivativeObject } from '@/lib/derivatives/storage';
import type { DocumentDerivativeRow, Json } from '@/lib/supabase/database.types';

/**
 * GET /api/derivatives — prepared files, newest first.
 *
 * Filterable by customer or by source document, which are the two places the dashboard shows
 * them: the customer profile and the document detail page.
 */
export const GET = handler('api.derivatives.list', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'document.view');

  const input = parseQuery(request, derivativeListSchema);

  let query = context.supabase
    .from('document_derivatives')
    .select(
      'id, customer_id, source_document_id, tool_type, filename, mime_type, size_bytes, width, height, metadata, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit);

  // Scoped to one customer, RLS is the filter — `document_derivatives_select` admits a live
  // roaming grant holder, whose customer's prepared files sit in another organization. Same
  // reasoning as GET /api/documents.
  if (input.customerId) query = query.eq('customer_id', input.customerId);
  else query = query.eq('organization_id', context.organization.id);
  if (input.sourceDocumentId) query = query.eq('source_document_id', input.sourceDocumentId);
  if (input.toolType) query = query.eq('tool_type', input.toolType);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Partial<DocumentDerivativeRow>[];

  return ok({
    derivatives: rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id ?? null,
      sourceDocumentId: row.source_document_id ?? null,
      toolType: row.tool_type,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      width: row.width ?? null,
      height: row.height ?? null,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    })),
  });
});

/**
 * POST /api/derivatives
 *
 * Records a prepared file whose bytes are already in the `prepared-files` bucket, after checking
 * that the stored object really is what the request says it is.
 *
 * The original document is never touched — spec §13.3's first acceptance criterion — which is a
 * property of this route by construction: it only ever inserts into `document_derivatives`.
 */
export const POST = handler('api.derivatives.create', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'documenttool.use');

  const input = await parseBody(request, derivativeCreateSchema);

  // Rebuild the path from the id and the filename rather than accepting one from the client. A
  // client-supplied path is a cross-tenant write waiting to happen; the storage policy and the
  // table's own check constraint would both refuse it, but the request should never get that far.
  const storagePath = derivativeStoragePath({
    organizationId: context.organization.id,
    derivativeId: input.derivativeId,
    filename: input.filename,
  });

  const toolType = TOOL_TO_DB_TOOL_TYPE[input.recipe.tool];
  if (toolType !== input.toolType) {
    // The recipe and the declared tool type disagree, so one of them is wrong and the row would
    // be self-contradictory.
    throw validationFailed({ fields: { toolType: 'validation.tool_type_mismatch' } });
  }
  if (input.presetCode !== undefined && input.presetCode !== input.recipe.presetCode) {
    throw validationFailed({ fields: { presetCode: 'validation.preset_mismatch' } });
  }

  const verified = await verifyDerivativeObject(
    context.supabase,
    storagePath,
    input.mimeType,
    input.sizeBytes,
  );

  const metadata = buildDerivativeMetadata(input.recipe);

  const { data, error } = await context.supabase
    .from('document_derivatives')
    .insert({
      id: input.derivativeId,
      organization_id: context.organization.id,
      source_document_id: input.sourceDocumentId ?? null,
      customer_id: input.customerId ?? null,
      tool_type: toolType,
      // Presets ship in the build rather than in `document_requirement_presets`, so the resolved
      // rule is snapshotted into metadata and this stays null. See packages/document-tools.
      preset_id: null,
      storage_bucket: DERIVATIVE_BUCKET,
      storage_path: storagePath,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: verified.sizeBytes,
      width: input.widthPx ?? null,
      height: input.heightPx ?? null,
      metadata: metadata as unknown as Json,
      created_by: context.userId,
    })
    .select('id, filename, mime_type, size_bytes, created_at')
    .single();

  if (error) {
    // The row is the thing that makes the object reachable. Without it the bytes are orphaned in
    // the bucket, counted against nobody's storage and deletable by no one, so they go.
    try {
      await removeDerivativeObject(context.supabase, storagePath);
    } catch (cleanupError) {
      logger.error('derivatives.orphan_cleanup_failed', {
        derivativeId: input.derivativeId,
        dbError: cleanupError instanceof Error ? cleanupError.message : 'unknown',
      });
    }
    throw error;
  }

  await writeAuditLog(context, {
    action: 'derivative.created',
    entityType: 'document_derivative',
    entityId: input.derivativeId,
    // The recipe, not the filename and not the customer. Shape and settings only.
    metadata: {
      tool: input.recipe.tool,
      presetCode: input.recipe.presetCode,
      operations: input.recipe.steps.map((step) => step.operation),
      redacted: input.recipe.redacted,
      mimeType: input.mimeType,
      sizeBytes: verified.sizeBytes,
      hasCustomer: Boolean(input.customerId),
    },
  });

  await recordUsage(context, 'document_tool', 1, { tool: input.recipe.tool });

  return created({
    id: data.id,
    filename: data.filename,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    createdAt: data.created_at,
  });
});
