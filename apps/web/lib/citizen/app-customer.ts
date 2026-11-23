import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  CITIZEN_APP_ORGANIZATION_ID,
  DOCUMENT_BUCKET,
  documentStoragePath,
  isDocumentType,
  isStoreOnlyDocumentType,
  mirrorFolderFrom,
  sniffMimeType,
  type DocumentType,
} from '@assistigo/core';
import { logger } from '../api/logger';
import { serverEnv } from '../env';
import { runDocumentJob } from '../jobs/runner';
import { isMissingColumnError } from '../supabase/missing-column';
import type { CitizenVaultDocumentRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { unwrapDocumentKey } from './secrets';
import { openVaultFile } from './vault-file';

/**
 * A BharatDoc app account as an ordinary customer (migration 0041; docs/VAULT_BRIDGE_DESIGN.md §13).
 *
 *   ensureAppCustomer   the citizen's `customers` row in the BharatDoc app organization —
 *                       name and verified mobile — made at sign-up (or on the next sync for an
 *                       account made before 0041).
 *   mirrorVaultDocument a synced file, decrypted on the server and stored as a normal
 *                       `documents` row for that customer, then read by the same extraction
 *                       pipeline an operator's upload goes through. The values wait for the
 *                       human review like any other extraction (docs/AI_PIPELINE.md §6).
 *   removeMirror / deleteAppCustomer   the citizen deleting a document or the account removes
 *                       the customer-side copy too.
 *
 * Centres reach these rows only through a roaming grant the citizen gives (0024 / 0039). This
 * module runs on the service role after a citizen route has proved who is calling; every query
 * is pinned to the citizen's own ids. Ids only in logs — never a name, number or title.
 */

type Db = AssistigoSupabaseClient;

const VAULT_BUCKET = 'citizen-vault';

/** How many old documents one sync call mirrors, so a big backlog never stalls the phone. */
export const MIRROR_BATCH_LIMIT = 5;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** `customers.full_name` needs two characters; the vault allows one. */
export function customerNameFrom(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.length >= 2 ? trimmed : 'Customer';
}

/** "919900012345" (how Supabase Auth stores it) → "9900012345"; anything else → null. */
export function mobileFromAuthPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const match = /^(?:91)?([6-9]\d{9})$/.exec(digits);
  return match?.[1] ?? null;
}

/** The filename an operator sees. The citizen's title, plus the real extension. */
export function mirrorFilename(title: string, mimeType: string): string {
  const base =
    title
      .trim()
      .replace(/[\\/]+/g, ' ')
      .slice(0, 120) || 'Document';
  return `${base}.${EXTENSION_BY_MIME[mimeType] ?? 'bin'}`;
}

/** The vault stores the same document classes as `documents`; anything unknown stays `unknown`. */
export function mirrorDocumentType(vaultType: string): DocumentType {
  return isDocumentType(vaultType) ? vaultType : 'unknown';
}

/**
 * The citizen's customer id, creating the row if this account has none yet. Safe to call on
 * every sync: it returns the existing id after the first time.
 */
export async function ensureAppCustomer(
  db: Db,
  citizen: { citizenId: string; phone: string | null },
): Promise<string | null> {
  const { data: account, error } = await db
    .from('citizen_accounts')
    .select('customer_id, display_name')
    .eq('id', citizen.citizenId)
    .maybeSingle();
  if (error) throw error;
  if (!account) return null;

  const row = account as { customer_id: string | null; display_name: string };
  if (row.customer_id) return row.customer_id;

  const mobile = mobileFromAuthPhone(citizen.phone);
  if (!mobile) {
    // Every citizen signs in by +91 OTP, so this is a broken account, not a normal path.
    logger.warn('citizen.app_customer_no_mobile', { citizenId: citizen.citizenId });
    return null;
  }

  const { data: customer, error: insertError } = await db
    .from('customers')
    .insert({
      organization_id: CITIZEN_APP_ORGANIZATION_ID,
      full_name: customerNameFrom(row.display_name),
      mobile,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  const customerId = (customer as { id: string }).id;

  // Only claims the link if nobody else did in the meantime (two sync calls racing).
  const { data: claimed, error: linkError } = await db
    .from('citizen_accounts')
    .update({ customer_id: customerId })
    .eq('id', citizen.citizenId)
    .is('customer_id', null)
    .select('customer_id');
  if (linkError) throw linkError;

  if (!claimed || (claimed as unknown[]).length === 0) {
    await db.from('customers').delete().eq('id', customerId);
    const { data: again } = await db
      .from('citizen_accounts')
      .select('customer_id')
      .eq('id', citizen.citizenId)
      .maybeSingle();
    return (again as { customer_id: string | null } | null)?.customer_id ?? null;
  }

  logger.info('citizen.app_customer_created', { citizenId: citizen.citizenId, customerId });
  return customerId;
}

/**
 * Keeps the customer's name in step with the app — until a centre has checked the profile
 * against a document, after which the reviewed name is the better one and is left alone.
 */
export async function syncAppCustomerName(
  db: Db,
  citizenId: string,
  displayName: string,
): Promise<void> {
  const { data } = await db
    .from('citizen_accounts')
    .select('customer_id')
    .eq('id', citizenId)
    .maybeSingle();
  const customerId = (data as { customer_id: string | null } | null)?.customer_id;
  if (!customerId) return;

  const { error } = await db
    .from('customers')
    .update({ full_name: customerNameFrom(displayName) })
    .eq('id', customerId)
    .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID)
    .eq('verification_status', 'unverified');
  if (error) throw error;
}

/**
 * Copies one confirmed vault file into the citizen's customer record and starts reading it.
 * Returns the new `documents` id. Idempotent: a file already mirrored returns its mirror.
 */
export async function mirrorVaultDocument(
  db: Db,
  citizenId: string,
  customerId: string,
  vault: Pick<
    CitizenVaultDocumentRow,
    'id' | 'document_type' | 'title' | 'storage_path' | 'mime_type' | 'mirror_document_id'
  > & { category?: string | null },
): Promise<string> {
  if (vault.mirror_document_id) return vault.mirror_document_id;

  const { data: keyRow, error: keyError } = await db
    .from('citizen_vault_keys')
    .select('wrapped_key')
    .eq('citizen_id', citizenId)
    .single();
  if (keyError) throw keyError;

  const { data: blob, error: downloadError } = await db.storage
    .from(VAULT_BUCKET)
    .download(vault.storage_path);
  if (downloadError || !blob) throw downloadError ?? new Error('vault object missing');

  const key = unwrapDocumentKey(citizenId, (keyRow as { wrapped_key: string }).wrapped_key);
  const plaintext = openVaultFile(citizenId, vault.id, Buffer.from(await blob.arrayBuffer()), key);

  // The phone said what the file is; the bytes decide, as for any upload (docs/SECURITY.md §4).
  const sniffed = sniffMimeType(new Uint8Array(plaintext.subarray(0, 32)));
  if (sniffed !== vault.mime_type) throw new Error('mirror mime mismatch');

  const documentId = randomUUID();
  const filename = mirrorFilename(vault.title, vault.mime_type);
  const storagePath = documentStoragePath({
    organizationId: CITIZEN_APP_ORGANIZATION_ID,
    customerId,
    documentId,
    filename,
  });
  const documentType = mirrorDocumentType(vault.document_type);
  // A photo or signature is the value itself: kept, never read (§12.4).
  const storeOnly = isStoreOnlyDocumentType(documentType);

  const { error: uploadError } = await db.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, plaintext, { contentType: vault.mime_type, upsert: false });
  if (uploadError) throw uploadError;

  const row = {
    id: documentId,
    organization_id: CITIZEN_APP_ORGANIZATION_ID,
    customer_id: customerId,
    original_filename: filename,
    storage_bucket: DOCUMENT_BUCKET,
    storage_path: storagePath,
    mime_type: vault.mime_type,
    size_bytes: plaintext.length,
    document_type: documentType,
    status: storeOnly ? 'stored' : 'processing',
    label: 'BharatDoc app',
  };
  // The folder the citizen filed it in on the phone (0043), so the operator finds it there too.
  const folder = mirrorFolderFrom(vault.category);
  const withFolder: Record<string, unknown> = folder === null ? row : { ...row, folder };
  let { error: insertError } = await db.from('documents').insert(withFolder);
  if (folder !== null && isMissingColumnError(insertError)) {
    // Database one migration behind: keep the copy, in its type's folder.
    ({ error: insertError } = await db.from('documents').insert(row));
  }
  if (insertError) {
    await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw insertError;
  }

  // Link first, so a failure below never makes a second copy on the next sync.
  const { data: linked, error: linkError } = await db
    .from('citizen_vault_documents')
    .update({ mirror_document_id: documentId })
    .eq('id', vault.id)
    .eq('citizen_id', citizenId)
    .is('mirror_document_id', null)
    .select('id');
  if (linkError || !linked || (linked as unknown[]).length === 0) {
    await db.from('documents').delete().eq('id', documentId);
    await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    if (linkError) throw linkError;
    const { data: existing } = await db
      .from('citizen_vault_documents')
      .select('mirror_document_id')
      .eq('id', vault.id)
      .maybeSingle();
    return (existing as { mirror_document_id: string | null } | null)?.mirror_document_id ?? '';
  }

  if (!storeOnly) await queueExtraction(db, documentId);
  logger.info('citizen.document_mirrored', { citizenId, documentId, storeOnly });
  return documentId;
}

/**
 * Queues `ocr.extract` and, unless a scheduler owns the queue, runs it now — the same two steps
 * as an operator upload (lib/documents/process.ts). `enqueue_job` checks a membership the
 * service role does not have, so the row is written directly; the partial unique index on
 * in-flight idempotency keys still deduplicates. Never throws: the document already exists and
 * the job row (or "Read again") can finish it.
 */
async function queueExtraction(db: Db, documentId: string): Promise<void> {
  const { error } = await db.from('jobs').insert({
    organization_id: CITIZEN_APP_ORGANIZATION_ID,
    type: 'ocr.extract',
    payload: { documentId, extractionMode: 'auto' },
    idempotency_key: `ocr.extract:${documentId}`,
  });
  if (error && error.code !== '23505') {
    logger.warn('citizen.mirror_enqueue_failed', { documentId });
    return;
  }
  if (serverEnv().JOB_INLINE_RUNNER === 'off') return;
  try {
    await runDocumentJob(db, { documentId, workerId: 'inline-citizen' });
  } catch (thrown) {
    logger.warn('citizen.mirror_inline_failed', {
      documentId,
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
  }
}

/** Mirrors confirmed files that have no customer-side copy yet (older syncs, earlier failures). */
export async function mirrorPendingDocuments(
  db: Db,
  citizen: { citizenId: string; phone: string | null },
): Promise<void> {
  const customerId = await ensureAppCustomer(db, citizen);
  if (!customerId) return;

  const { data, error } = await db
    .from('citizen_vault_documents')
    .select('id, document_type, category, title, storage_path, mime_type, mirror_document_id')
    .eq('citizen_id', citizen.citizenId)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .is('mirror_document_id', null)
    .limit(MIRROR_BATCH_LIMIT);
  if (error) throw error;

  for (const row of (data ?? []) as Parameters<typeof mirrorVaultDocument>[3][]) {
    try {
      await mirrorVaultDocument(db, citizen.citizenId, customerId, row);
    } catch (thrown) {
      logger.warn('citizen.mirror_failed', {
        citizenId: citizen.citizenId,
        documentId: row.id,
        reason: thrown instanceof Error ? thrown.name : 'unknown',
      });
    }
  }
}

/** Title, type or folder changed in the app: the operator sees the same. */
export async function updateMirror(
  db: Db,
  mirrorDocumentId: string,
  patch: { title?: string; documentType?: string; category?: string; mimeType: string },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined)
    update.original_filename = mirrorFilename(patch.title, patch.mimeType);
  if (patch.documentType !== undefined)
    update.document_type = mirrorDocumentType(patch.documentType);
  if (patch.category !== undefined) update.folder = mirrorFolderFrom(patch.category);
  if (Object.keys(update).length === 0) return;

  const apply = (values: Record<string, unknown>) =>
    db
      .from('documents')
      .update(values)
      .eq('id', mirrorDocumentId)
      .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID);

  let { error } = await apply(update);
  if ('folder' in update && isMissingColumnError(error)) {
    // Database one migration behind (0043): apply the rest, drop the move.
    const { folder: _dropped, ...rest } = update;
    error = Object.keys(rest).length === 0 ? null : (await apply(rest)).error;
  }
  if (error) throw error;
}

/** The citizen deleted the document: the customer-side copy goes too, bytes first. */
export async function removeMirror(db: Db, mirrorDocumentId: string): Promise<void> {
  const { data } = await db
    .from('documents')
    .select('id, storage_bucket, storage_path')
    .eq('id', mirrorDocumentId)
    .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID)
    .maybeSingle();
  const row = data as { id: string; storage_bucket: string; storage_path: string } | null;
  if (!row) return;
  const { error: removeError } = await db.storage
    .from(row.storage_bucket)
    .remove([row.storage_path]);
  if (removeError) logger.warn('citizen.mirror_remove_failed', { documentId: row.id });
  const { error } = await db.from('documents').delete().eq('id', row.id);
  if (error) throw error;
}

/**
 * Account deletion: every mirrored file, then the customer row (field values, grants, links and
 * requests cascade from it). Runs before the auth user is deleted.
 */
export async function deleteAppCustomer(db: Db, citizenId: string): Promise<void> {
  const { data } = await db
    .from('citizen_accounts')
    .select('customer_id')
    .eq('id', citizenId)
    .maybeSingle();
  const customerId = (data as { customer_id: string | null } | null)?.customer_id;
  if (!customerId) return;

  const { data: documents, error } = await db
    .from('documents')
    .select('id')
    .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID)
    .eq('customer_id', customerId);
  if (error) throw error;
  for (const document of (documents ?? []) as { id: string }[]) {
    await removeMirror(db, document.id);
  }

  const { error: customerError } = await db
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('organization_id', CITIZEN_APP_ORGANIZATION_ID);
  if (customerError) throw customerError;
  logger.info('citizen.app_customer_deleted', { citizenId, customerId });
}
