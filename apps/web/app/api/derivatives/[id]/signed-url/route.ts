import { z } from 'zod';
import { SIGNED_URL_TTL_SECONDS, notFound } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { createSignedDownloadUrl } from '@/lib/documents/storage';
import type { DocumentDerivativeRow } from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();

/**
 * POST /api/derivatives/:id/signed-url
 *
 * The only way to reach a prepared file's bytes. Same rules as a source document: private
 * bucket, five-minute expiry, every issue audited (docs/SECURITY.md §4). A derivative is a
 * smaller exposure than the original, but it is still the customer's photograph.
 */
export const POST = handler(
  'api.derivatives.signed_url',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.download');

    const id = idSchema.parse((await ctx.params).id);

    const { data, error } = await context.supabase
      .from('document_derivatives')
      .select('id, storage_bucket, storage_path, mime_type, filename')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('errors.not_found');

    const row = data as Pick<
      DocumentDerivativeRow,
      'id' | 'storage_bucket' | 'storage_path' | 'mime_type' | 'filename'
    >;

    const url = await createSignedDownloadUrl(
      context.supabase,
      row.storage_path,
      row.storage_bucket,
    );

    await writeAuditLog(context, {
      action: 'document.downloaded',
      entityType: 'document_derivative',
      entityId: id,
      metadata: { mimeType: row.mime_type, kind: 'derivative' },
    });

    return ok({
      url,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      mimeType: row.mime_type,
      filename: row.filename,
    });
  },
);
