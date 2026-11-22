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
import type { CitizenVaultDocumentRow } from '../supabase/database.types';
import { VAULT_BUCKET } from './account';
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
};

const COLUMNS =
  'id, citizen_id, document_type, category, title, storage_path, mime_type, size_bytes, page_count, sha256, status, created_at, updated_at, deleted_at';

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
  const { data, error } = await context.admin
    .from('citizen_vault_documents')
    .select(COLUMNS)
    .eq('citizen_id', context.citizenId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as CitizenVaultDocumentRow[]).map(toView);
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
      category: storedVaultCategory(input.documentType),
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
  return toView(updated as CitizenVaultDocumentRow);
}

export async function updateVaultDocument(
  context: CitizenContext,
  documentId: string,
  patch: z.output<typeof vaultDocumentUpdateSchema>,
): Promise<VaultDocumentView> {
  await loadOwnDocument(context, documentId);
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.documentType !== undefined) {
    update.document_type = patch.documentType;
    update.category = storedVaultCategory(patch.documentType);
  }
  const { data, error } = await context.admin
    .from('citizen_vault_documents')
    .update(update)
    .eq('id', documentId)
    .eq('citizen_id', context.citizenId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toView(data as CitizenVaultDocumentRow);
}

/** Hidden from every reader at once; bytes removed now (the sweep retries a failed removal). */
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
