/**
 * Runs document sync on the phone (docs/VAULT_BRIDGE_DESIGN.md §3.2).
 *
 * For each action `planSync` returns:
 *   upload  build the document's one file in memory (`buildSyncFile`), ask the server for an
 *           upload slot, encrypt with the cloud document key — AES-256-GCM, AAD naming the
 *           citizen and the new row (format v1, `@assistigo/core`) — PUT the ciphertext to the
 *           signed URL, then confirm with its SHA-256. Plaintext never leaves the phone.
 *   update  send the new title / type / folder.
 *   delete  remove a queued cloud copy; "already gone" counts as done.
 *
 * Best effort and quiet: nothing is shown or logged, nothing is retried in a loop. Offline or
 * signed out stops the run; the next run (app foregrounded, document saved) picks up where this
 * one stopped, because progress is written to the vault index after every action.
 *
 * One run at a time; a request during a run schedules exactly one follow-up run.
 */

import { aesEncryptAsync, AESEncryptionKey, CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { MAX_VAULT_FILE_BYTES, vaultFileAad } from '@assistigo/core';

import { buildSyncFile } from '../vault/document-export';
import {
  canSyncAs,
  type DocumentSource,
  findDocument,
  type VaultIndex,
  withCloudAccount,
  withCloudDeleteDone,
  withCloudForgotten,
  withCloudSynced,
  withUploadFinished,
} from '../vault/vault-index';
import { readVaultIndex, updateVaultIndex } from '../vault/vault-storage';
import type { ApiResult, CitizenApi } from './citizen-api';
import { loadCloudDeviceId, loadCloudDocumentKey } from './cloud-store';
import { cloudConfig } from './config';
import { citizenApi, currentSession } from './session';
import { pullDocument } from './pull';
import { planPulls, planSync, type SyncAction, syncFileKind } from './sync-plan';

/**
 * `other_account`: this phone's vault is bound to a different cloud account (someone else
 * signed in here before), so nothing is synced — see `cloudAccountId` in `vault-index.ts`.
 */
export type SyncOutcome =
  'done' | 'partial' | 'offline' | 'signed_out' | 'not_set_up' | 'other_account';

type StepResult = 'ok' | 'failed' | 'offline' | 'signed_out';

function stepOf<T>(result: ApiResult<T>): StepResult | null {
  if (result.ok) return null;
  if (result.error.code === 'NETWORK') return 'offline';
  if (result.error.code === 'SIGNED_OUT') return 'signed_out';
  return 'failed';
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Documents found too big to sync during this app session. */
const tooLarge = new Set<string>();

type RunContext = {
  api: CitizenApi;
  deviceId: string;
  userId: string;
  key: AESEncryptionKey;
};

async function upload(
  run: RunContext,
  index: VaultIndex,
  action: Extract<SyncAction, { kind: 'upload' }>,
): Promise<StepResult> {
  const document = findDocument(index, action.documentId);
  if (!document) return 'ok';

  if (tooLarge.has(document.id)) return 'failed';
  let file;
  try {
    file = await buildSyncFile(document, syncFileKind(document));
  } catch {
    return 'failed';
  }
  // Too big for the cloud vault: it stays on the phone, and is not rebuilt again this session.
  if (file.bytes.length > MAX_VAULT_FILE_BYTES) {
    tooLarge.add(document.id);
    return 'failed';
  }

  const intent = await run.api.createUploadIntent(run.deviceId, {
    documentType: action.documentType,
    title: action.title,
    mimeType: file.mimeType,
    sizeBytes: file.bytes.length,
    pageCount: document.pages.length,
    category: action.category,
  });
  if (!intent.ok) return stepOf(intent) ?? 'failed';
  const cloudId = intent.value.document.id;

  const sealed = await aesEncryptAsync(file.bytes, run.key, {
    additionalData: btoa(vaultFileAad(run.userId, cloudId)),
  });
  // IV ‖ ciphertext ‖ tag — format v1. Copied into a plain ArrayBuffer-backed array for fetch.
  const ciphertext = new Uint8Array(await sealed.combined('bytes'));

  try {
    const put = await expoFetch(intent.value.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: ciphertext,
    });
    if (!put.ok) return 'failed';
  } catch {
    return 'offline';
  }

  const sha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, ciphertext));
  const confirmed = await run.api.confirmUpload(run.deviceId, cloudId, sha256);
  if (!confirmed.ok) return stepOf(confirmed) ?? 'failed';

  await updateVaultIndex((current) =>
    withUploadFinished(current, action.documentId, {
      id: cloudId,
      title: action.title,
      documentType: action.documentType,
      category: action.category,
    }),
  );
  return 'ok';
}

async function perform(
  run: RunContext,
  index: VaultIndex,
  action: SyncAction,
): Promise<StepResult> {
  switch (action.kind) {
    case 'delete': {
      const result = await run.api.deleteDocument(run.deviceId, action.cloudId);
      if (!result.ok && result.error.status !== 404) return stepOf(result) ?? 'failed';
      await updateVaultIndex((current) => withCloudDeleteDone(current, action.cloudId));
      return 'ok';
    }
    case 'update': {
      const result = await run.api.updateDocument(run.deviceId, action.cloudId, {
        title: action.title,
        documentType: action.documentType,
        category: action.category,
      });
      if (!result.ok && result.error.status === 404) {
        // The cloud copy is gone: forget it here so the next run uploads it afresh.
        await updateVaultIndex((current) => withCloudForgotten(current, action.documentId));
        return 'ok';
      }
      if (!result.ok) return stepOf(result) ?? 'failed';
      await updateVaultIndex((current) =>
        withCloudSynced(current, action.documentId, {
          id: action.cloudId,
          title: action.title,
          documentType: action.documentType,
          category: action.category,
        }),
      );
      return 'ok';
    }
    case 'upload':
      return upload(run, index, action);
  }
}

async function runOnce(untitled: (source: DocumentSource) => string): Promise<SyncOutcome> {
  const api = citizenApi();
  if (!cloudConfig() || !api) return 'not_set_up';

  const session = await currentSession();
  if (!session) return 'signed_out';
  const [keyBase64, deviceId] = await Promise.all([
    loadCloudDocumentKey(session.userId),
    loadCloudDeviceId(session.userId),
  ]);
  if (!keyBase64 || !deviceId) return 'not_set_up';

  const account = await api.getAccount();
  if (!account.ok) {
    const step = stepOf(account);
    return step === 'offline' || step === 'signed_out' ? step : 'partial';
  }
  if (!account.value) return 'not_set_up';

  const run: RunContext = {
    api,
    deviceId,
    userId: session.userId,
    key: await AESEncryptionKey.import(keyBase64, 'base64'),
  };

  // Bind an unbound vault to this account, under the index lock, before anything is uploaded.
  const claim = { bound: false };
  await updateVaultIndex((current) => {
    claim.bound = canSyncAs(current, session.userId);
    return claim.bound ? withCloudAccount(current, session.userId) : current;
  });
  if (!claim.bound) return 'other_account';

  const index = await readVaultIndex();
  let failed = false;
  for (const action of planSync(index, { cloudEnabled: account.value.cloudEnabled, untitled })) {
    const step = await perform(run, index, action);
    if (step === 'offline' || step === 'signed_out') return step;
    if (step === 'failed') failed = true;
  }

  // Then pull in what a centre added for the citizen (0047), after every queued delete has run,
  // so a document the citizen deleted here is never brought back.
  const listed = await api.listDocuments(deviceId);
  if (!listed.ok) {
    const step = stepOf(listed);
    return step === 'offline' || step === 'signed_out' ? step : 'partial';
  }
  for (const document of planPulls(await readVaultIndex(), listed.value)) {
    const step = await pullDocument(run, document);
    if (step === 'offline' || step === 'signed_out') return step;
    if (step === 'failed') failed = true;
  }
  return failed ? 'partial' : 'done';
}

let running: Promise<SyncOutcome> | null = null;
let again = false;

/**
 * Starts a sync, or — if one is running — makes sure one more runs after it. Never throws.
 * `untitled` names a document saved without a title, as the vault shows it.
 */
export function requestVaultSync(
  untitled: (source: DocumentSource) => string,
): Promise<SyncOutcome> {
  if (running) {
    again = true;
    return running;
  }
  running = runOnce(untitled)
    .catch((): SyncOutcome => 'partial')
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void requestVaultSync(untitled);
      }
    });
  return running;
}
