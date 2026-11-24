import 'server-only';

import type { ExtractionMode } from '@assistigo/ai';
import {
  CITIZEN_APP_ORGANIZATION_ID,
  DOCUMENT_BUCKET,
  conflict,
  documentStoragePath,
  isDocumentType,
  notFound,
  type AllowedUploadMimeType,
} from '@assistigo/core';
import type { z } from 'zod';
import type { RequestContext } from '../api/context';
import { logger } from '../api/logger';
import { addCentreDocumentToVault, mirrorFailure, queueExtraction } from '../citizen/app-customer';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { uploadIntentSchema } from './schema';
import {
  SNIFF_BYTE_COUNT,
  assertDeclaredTypeMatchesBytes,
  createSignedUploadUrl,
  downloadObject,
  removeObject,
} from './storage';

/**
 * An operator uploading a document for a BharatDoc app customer (migration 0047;
 * docs/VAULT_BRIDGE_DESIGN.md §17). Same three steps as any upload — reserve, PUT, process — but:
 *
 *   * the gate is `can_review_app_customer`, checked with the operator's own JWT: an app customer
 *     and a live grant the citizen gave this operator. Any other customer outside the caller's
 *     organization stays a 404, exactly as before; a roaming grant over another centre's
 *     customer still never lets a visitor write into that centre's records.
 *   * the row lives in the BharatDoc app organization, so it is written on the service role
 *     (no grant holder has a write policy there) after the gate has passed.
 *   * no centre quota is checked or used: the app organization has no plan, and app customers'
 *     extractions are not charged to the centre (§13).
 *   * after the bytes are verified, a sealed copy goes into the citizen's cloud vault so the
 *     phone pulls it in. That step never fails the upload — the customer record has the file.
 */

type Db = AssistigoSupabaseClient;
type UploadInput = z.output<typeof uploadIntentSchema>;

/** True when the caller may upload for this customer as a BharatDoc app customer. */
export async function canUploadForAppCustomer(supabase: Db, customerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_review_app_customer', {
    p_customer_id: customerId,
  });
  if (error) throw error;
  return data === true;
}

export type ReservedUpload = {
  documentId: string;
  storagePath: string;
  uploadUrl: string;
  uploadToken: string;
};

/** Reserves the document row and a one-time upload URL. The caller has passed the gate. */
export async function reserveAppCustomerUpload(
  context: RequestContext,
  admin: Db,
  input: UploadInput & { customerId: string },
): Promise<ReservedUpload> {
  const documentId = crypto.randomUUID();
  const storagePath = documentStoragePath({
    organizationId: CITIZEN_APP_ORGANIZATION_ID,
    customerId: input.customerId,
    documentId,
    filename: input.filename,
  });

  const { error } = await admin.from('documents').insert({
    id: documentId,
    organization_id: CITIZEN_APP_ORGANIZATION_ID,
    customer_id: input.customerId,
    original_filename: input.filename,
    storage_bucket: DOCUMENT_BUCKET,
    storage_path: storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    document_type: input.documentType ?? 'unknown',
    status: 'uploaded',
    label: input.label ?? null,
    uploaded_by: context.userId,
  });
  if (error) throw error;

  const upload = await createSignedUploadUrl(admin, storagePath);
  return { documentId, storagePath, uploadUrl: upload.url, uploadToken: upload.token };
}

type AppDocumentRow = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  status: string;
  document_type: string;
  original_filename: string;
  uploaded_by: string | null;
};

/**
 * The app-customer document `/process` was called for, when the caller is the operator who
 * reserved it and still holds the grant. Null for anything else, so the ordinary path answers.
 */
export async function loadOwnAppCustomerUpload(
  context: RequestContext,
  admin: Db,
  documentId: string,
): Promise<AppDocumentRow | null> {
  const { data, error } = await admin
    .from('documents')
    .select(
      'id, organization_id, customer_id, storage_bucket, storage_path, mime_type, status, document_type, original_filename, uploaded_by',
    )
    .eq('id', documentId)
    .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  const row = data as AppDocumentRow | null;
  if (!row || !row.customer_id || row.uploaded_by !== context.userId) return null;
  if (!(await canUploadForAppCustomer(context.supabase, row.customer_id))) return null;
  return row;
}

/**
 * Whether the citizen's app got a copy. Never says why not: "backup is off" is the citizen's own
 * setting, and a centre has no need to know it. The log has the step when it was a failure.
 */
export type AppCopy = 'added' | 'not_added';

export type AppUploadResult = {
  documentId: string;
  status: string;
  queued: boolean;
  /** Absent when this call did not attempt the copy (the document was already processed). */
  appCopy?: AppCopy;
};

/**
 * Verifies the uploaded bytes, then reads the document (or keeps it unread), and seals a copy
 * into the citizen's vault. Mirrors `processDocument` step for step, on the service role.
 */
export async function processAppCustomerUpload(
  context: RequestContext,
  admin: Db,
  row: AppDocumentRow,
  options: { extractionMode?: ExtractionMode | undefined; storeOnly?: boolean | undefined },
): Promise<AppUploadResult> {
  const storeOnly = options.storeOnly === true;
  if (storeOnly && (!isDocumentType(row.document_type) || row.document_type === 'unknown')) {
    throw conflict('documents.errors.storeOnlyType');
  }
  // Processed once: a second press must not seal a second vault copy.
  if (row.status !== 'uploaded') {
    return { documentId: row.id, status: row.status, queued: false };
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadObject(admin, row.storage_path, row.storage_bucket);
  } catch {
    throw notFound('errors.upload_incomplete');
  }

  try {
    assertDeclaredTypeMatchesBytes(
      bytes.subarray(0, SNIFF_BYTE_COUNT),
      row.mime_type as AllowedUploadMimeType,
    );
  } catch (mismatch) {
    await removeObject(admin, row.storage_path, row.storage_bucket).catch(() => {
      // Best effort — the row is marked failed either way.
    });
    await admin.from('documents').update({ status: 'failed' }).eq('id', row.id);
    throw mismatch;
  }

  // Claim the row before anything else, so two presses cannot both continue.
  const nextStatus = storeOnly ? 'stored' : 'processing';
  const { data: claimed, error: claimError } = await admin
    .from('documents')
    .update({ status: nextStatus })
    .eq('id', row.id)
    .eq('status', 'uploaded')
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || (claimed as unknown[]).length === 0) {
    return { documentId: row.id, status: nextStatus, queued: false };
  }

  let appCopy: AppCopy = 'not_added';
  try {
    const vaultId = await addCentreDocumentToVault(admin, {
      documentId: row.id,
      customerId: row.customer_id as string,
      bytes: Buffer.from(bytes),
      mimeType: row.mime_type,
      documentType: row.document_type,
      filename: row.original_filename,
      centre: { organizationId: context.organization.id, name: context.organization.name },
      operatorId: context.userId,
    });
    if (vaultId !== null) appCopy = 'added';
  } catch (thrown) {
    logger.warn('citizen.centre_document_vault_failed', {
      documentId: row.id,
      ...mirrorFailure(thrown),
    });
  }

  if (storeOnly) return { documentId: row.id, status: 'stored', queued: false, appCopy };

  await queueExtraction(admin, row.id, options.extractionMode ?? 'auto');
  const { data } = await admin.from('documents').select('status').eq('id', row.id).maybeSingle();
  const status = (data as { status: string } | null)?.status ?? 'processing';
  return { documentId: row.id, status, queued: true, appCopy };
}
