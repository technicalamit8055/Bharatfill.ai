import {
  DOCUMENT_BUCKET,
  checkUsageEntitlement,
  documentStoragePath,
  entitlementExceeded,
  notFound,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import { uploadIntentSchema } from '@/lib/documents/schema';
import { createSignedUploadUrl } from '@/lib/documents/storage';
import {
  canUploadForAppCustomer,
  reserveAppCustomerUpload,
} from '@/lib/documents/app-customer-upload';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/documents/upload-intent
 *
 * Reserves a document row and hands back a one-time upload URL scoped to a single org-owned
 * storage path (§17.4). The bytes go straight to storage; the server still decides what the
 * file really is when `/process` sniffs its magic bytes (docs/SECURITY.md §4).
 */
export const POST = handler('api.documents.upload_intent', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'document.upload');

  const input = await parseBody(request, uploadIntentSchema);

  // A document may only be attached to a customer in the caller's own organization. RLS would
  // catch a foreign id on insert, but failing here gives the operator a real message.
  if (input.customerId) {
    const { data: customer, error } = await context.supabase
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!customer) {
      // A BharatDoc app customer the citizen has let this operator in to (0047): the file goes
      // onto their record and into their app. Any other foreign customer stays a 404.
      if (!(await canUploadForAppCustomer(context.supabase, input.customerId))) {
        throw notFound('errors.not_found');
      }
      const reserved = await reserveAppCustomerUpload(context, createSupabaseAdminClient(), {
        ...input,
        customerId: input.customerId,
      });
      await writeAuditLog(context, {
        action: 'document.uploaded',
        entityType: 'document',
        entityId: reserved.documentId,
        metadata: {
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          hasCustomer: true,
          appCustomer: true,
        },
      });
      return created({
        documentId: reserved.documentId,
        storagePath: reserved.storagePath,
        bucket: DOCUMENT_BUCKET,
        uploadUrl: reserved.uploadUrl,
        uploadToken: reserved.uploadToken,
      });
    }
  }

  const entitlements = await loadEntitlementContext(context);
  const sizeMb = Math.ceil(input.sizeBytes / (1024 * 1024));
  const storage = checkUsageEntitlement(entitlements, 'storage', sizeMb);
  if (!storage.allowed) throw entitlementExceeded(storage.reason);

  const documentId = crypto.randomUUID();
  const storagePath = documentStoragePath({
    organizationId: context.organization.id,
    customerId: input.customerId ?? null,
    documentId,
    filename: input.filename,
  });

  const { data, error } = await context.supabase
    .from('documents')
    .insert({
      id: documentId,
      organization_id: context.organization.id,
      customer_id: input.customerId ?? null,
      original_filename: input.filename,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      // The operator's choice is stored as a starting point; classification may overwrite it.
      document_type: input.documentType ?? 'unknown',
      status: 'uploaded',
      label: input.label ?? null,
      uploaded_by: context.userId,
    })
    .select('id, storage_path, status')
    .single();

  if (error) throw error;

  const upload = await createSignedUploadUrl(context.supabase, storagePath);

  await writeAuditLog(context, {
    action: 'document.uploaded',
    entityType: 'document',
    entityId: documentId,
    // Shape and size, never the filename — an operator's filename routinely carries the
    // customer's name (docs/SECURITY.md §5).
    metadata: {
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      hasCustomer: Boolean(input.customerId),
    },
  });

  return created({
    documentId: data.id,
    storagePath: data.storage_path,
    bucket: DOCUMENT_BUCKET,
    uploadUrl: upload.url,
    uploadToken: upload.token,
  });
});
