import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import {
  CITIZEN_DEVICE_HEADER,
  VAULT_FILE_OVERHEAD_BYTES,
  conflict,
  notFound,
  permissionDenied,
  storedVaultCategory,
  type vaultDocumentIntentSchema,
  type vaultDocumentUpdateSchema,
} from '@assistigo/core';
import type { z } from 'zod';
import { logger } from '../api/logger';
import { isMissingColumnError } from '../supabase/missing-column';
import type { CitizenVaultDocumentRow } from '../supabase/database.types';
import { VAULT_BUCKET } from './account';
import {
  ensureAppCustomer,
  mirrorFailure,
  mirrorPendingDocuments,
  mirrorVaultDocument,
  removeMirror,
  updateMirror,
} from './app-customer';
import type { CitizenContext } from './context';

/**
 * Document sync for the citizen app (docs/VAULT_BRIDGE_DESIGN.md §3.2; migration 0038).
 *
 *   intent   → a `pending` row and a signed upload URL for `citizen/<citizen>/<document>`.
 *              The server never sees plaintext: the phone encrypts with its document key
 *              (format v1, AAD naming this row) and PUTs the ciphertext straight to Storage.
 *   confirm  → the server reads the object back, checks its length and SHA-256 against what the
 *              phone says it sent, and marks the row `ready`. A mismatch removes both.
 *   update   → type and title. delete → the row is hidden at once and the bytes removed.
 *
 * Every call names the phone (`x-bharatfill-device`). Only a phone that received the document key
 * knows its device id, so these calls — unlike a bare OTP sign-in — refresh `last_active_at`
 * (the recycled-number guard, design §3.3).
 *
 * Titles are the citizen's own words and may name them: never logged. Log lines carry ids only.
 */

export type VaultDocumentView = {
  id: string;
  documentType: string;
  category: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  status: 'pending' | 'ready';
  createdAt: string;
  updatedAt: string;
  /** The centre that added it for the citizen (0047), so the phone can pull it in; else null. */
  addedByCentre: string | null;
};

const COLUMNS =
  'id, citizen_id, document_type, category, title, storage_path, mime_type, size_bytes, page_count, sha256, status, created_at, updated_at, deleted_at, mirror_document_id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toView(row: CitizenVaultDocumentRow): VaultDocumentView {
  return {
    id: row.id,
    documentType: row.document_type,
    category: row.category,
    title: row.title,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    addedByCentre: row.added_by_centre_name ?? null,
  };
}

const storagePath = (citizenId: string, documentId: string) => `citizen/${citizenId}/${documentId}`;

/**
 * Checks the `x-bharatfill-device` header names a live device of this citizen and records the
 * activity. Returns the device id.
 */
export async function touchDevice(context: CitizenContext, request: Request): Promise<string> {
  const deviceId = request.headers.get(CITIZEN_DEVICE_HEADER)?.trim() ?? '';
  if (!UUID.test(deviceId)) throw permissionDenied('errors.vault.device_unknown');

  const { data, error } = await context.admin
    .from('citizen_devices')
    .select('id')
    .eq('id', deviceId)
    .eq('citizen_id', context.citizenId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw permissionDenied('errors.vault.device_unknown');

  const now = new Date().toISOString();
  await context.admin.from('citizen_devices').update({ last_seen_at: now }).eq('id', deviceId);
  await context.admin
    .from('citizen_accounts')
    .update({ last_active_at: now })
    .eq('id', context.citizenId);
  return deviceId;
}

async function loadOwnDocument(
  context: CitizenContext,
  documentId: string,
): Promise<CitizenVaultDocumentRow> {
  const { data, error } = await context.admin
    .from('citizen_vault_documents')
    .select(COLUMNS)
    .eq('id', documentId)
    .eq('citizen_id', context.citizenId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.vault.document_missing');
  return data as CitizenVaultDocumentRow;
}

export async function listVaultDocuments(context: CitizenContext): Promise<VaultDocumentView[]> {
  // The phone lists on every launch: a good moment to catch up on customer-side copies (0041).
  await mirrorQuietly(context);

  const query = (columns: string) =>
    context.admin
      .from('citizen_vault_documents')
      .select(columns)
      .eq('citizen_id', context.citizenId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
  let { data, error } = await query(`${COLUMNS}, added_by_centre_name`);
  // A database that has not run 0047: nothing was added by a centre yet.
  if (isMissingColumnError(error)) ({ data, error } = await query(COLUMNS));
  if (error) throw error;
  return ((data ?? []) as unknown as CitizenVaultDocumentRow[]).map(toView);
}

/** How long the phone's download link for its own encrypted file lives. */
const DOWNLOAD_URL_TTL_SECONDS = 120;

/**
 * A short-lived link to the encrypted bytes of one of the citizen's own ready documents, so the
 * phone can pull in a file a centre added (0047). Ciphertext only: the phone decrypts it with
 * the document key it already holds; the server hands out nothing it could not already read.
 */
export async function createDownloadUrl(
  context: CitizenContext,
  documentId: string,
): Promise<{ downloadUrl: string }> {
  const row = await loadOwnDocument(context, documentId);
  if (row.status !== 'ready') throw notFound('errors.vault.document_missing');
  const { data, error } = await context.admin.storage
    .from(VAULT_BUCKET)
    .createSignedUrl(row.storage_path, DOWNLOAD_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error('signed download url missing');
  return { downloadUrl: data.signedUrl };
}

export type UploadIntent = {
  document: VaultDocumentView;
  /** PUT the encrypted bytes here (`content-type: application/octet-stream`). Short-lived. */
  uploadUrl: string;
};

export async function createUploadIntent(
  context: CitizenContext,
  input: z.output<typeof vaultDocumentIntentSchema>,
): Promise<UploadIntent> {
  const { data: account, error: accountError } = await context.admin
    .from('citizen_accounts')
    .select('cloud_enabled')
    .eq('id', context.citizenId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) throw notFound('errors.vault.account_missing');
  if (!(account as { cloud_enabled: boolean }).cloud_enabled) {
    throw conflict('errors.vault.sync_off');
  }

  const id = randomUUID();
  const path = storagePath(context.citizenId, id);
  const { data: row, error } = await context.admin
    .from('citizen_vault_documents')
    .insert({
      id,
      citizen_id: context.citizenId,
      document_type: input.documentType,
      // The phone's folder when it sent one; an older app build: the type's folder.
      category: input.category ?? storedVaultCategory(input.documentType),
      title: input.title,
      storage_path: path,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      page_count: input.pageCount,
      status: 'pending',
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;

  const { data: signed, error: signError } = await context.admin.storage
    .from(VAULT_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    await context.admin.from('citizen_vault_documents').delete().eq('id', id);
    throw signError ?? new Error('signed upload url missing');
  }

  return { document: toView(row as CitizenVaultDocumentRow), uploadUrl: signed.signedUrl };
}

export async function confirmUpload(
  context: CitizenContext,
  documentId: string,
  sha256: string,
): Promise<VaultDocumentView> {
  const row = await loadOwnDocument(context, documentId);
  if (row.status === 'ready') return toView(row);

  const storage = context.admin.storage.from(VAULT_BUCKET);
  const { data: blob, error } = await storage.download(row.storage_path);
  const bytes = blob && !error ? Buffer.from(await blob.arrayBuffer()) : null;

  const matches =
    bytes !== null &&
    bytes.length === row.size_bytes + VAULT_FILE_OVERHEAD_BYTES &&
    createHash('sha256').update(bytes).digest('hex') === sha256;

  if (!matches) {
    // Missing, truncated or not what the phone encrypted: drop both, the phone retries cleanly.
    await storage.remove([row.storage_path]);
    await context.admin.from('citizen_vault_documents').delete().eq('id', row.id);
    logger.warn('citizen.vault_upload_mismatch', {
      citizenId: context.citizenId,
      documentId: row.id,
      present: bytes !== null,
    });
    throw conflict('errors.vault.upload_mismatch');
  }

  const { data: updated, error: updateError } = await context.admin
    .from('citizen_vault_documents')
    .update({ status: 'ready', sha256 })
    .eq('id', row.id)
    .select(COLUMNS)
    .single();
  if (updateError) throw updateError;
  const ready = updated as CitizenVaultDocumentRow;

  // Now the operator side: the same file as a customer document, read like any upload (0041).
  // Never fails the phone's sync — `listVaultDocuments` retries anything left behind.
  try {
    const customerId = await ensureAppCustomer(context.admin, context);
    if (customerId) await mirrorVaultDocument(context.admin, context.citizenId, customerId, ready);
  } catch (thrown) {
    logger.warn('citizen.mirror_failed', {
      citizenId: context.citizenId,
      documentId: ready.id,
      ...mirrorFailure(thrown),
    });
  }
  return toView(ready);
}

async function mirrorQuietly(context: CitizenContext): Promise<void> {
  try {
    await mirrorPendingDocuments(context.admin, context);
  } catch (thrown) {
    logger.warn('citizen.mirror_catch_up_failed', {
      citizenId: context.citizenId,
      ...mirrorFailure(thrown),
    });
  }
}

export async function updateVaultDocument(
  context: CitizenContext,
  documentId: string,
  patch: z.output<typeof vaultDocumentUpdateSchema>,
): Promise<VaultDocumentView> {
  const current = await loadOwnDocument(context, documentId);
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.documentType !== undefined) update.document_type = patch.documentType;
  // A folder the phone sent wins; a retype from an app build that sends none moves it with
  // its type, as before folders synced.
  if (patch.category !== undefined) update.category = patch.category;
  else if (patch.documentType !== undefined) {
    update.category = storedVaultCategory(patch.documentType);
  }
  const category = typeof update.category === 'string' ? update.category : undefined;
  const { data, error } = await context.admin
    .from('citizen_vault_documents')
    .update(update)
    .eq('id', documentId)
    .eq('citizen_id', context.citizenId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  if (current.mirror_document_id) {
    await updateMirror(context.admin, current.mirror_document_id, {
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.documentType === undefined ? {} : { documentType: patch.documentType }),
      ...(category === undefined ? {} : { category }),
      mimeType: current.mime_type,
    });
  }
  return toView(data as CitizenVaultDocumentRow);
}

/**
 * Hidden from every reader at once; bytes removed now (the sweep retries a failed removal). The
 * customer-side copy (0041) is removed with it.
 */
export async function deleteVaultDocument(
  context: CitizenContext,
  documentId: string,
): Promise<void> {
  const row = await loadOwnDocument(context, documentId);
  const { error } = await context.admin
    .from('citizen_vault_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;

  if (row.mirror_document_id) await removeMirror(context.admin, row.mirror_document_id);

  const { error: removeError } = await context.admin.storage
    .from(VAULT_BUCKET)
    .remove([row.storage_path]);
  if (removeError) {
    logger.warn('citizen.vault_delete_storage_failed', {
      citizenId: context.citizenId,
      documentId: row.id,
    });
  }
}
