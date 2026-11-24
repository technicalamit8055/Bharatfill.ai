/**
 * Pulls in documents a centre added for the citizen (migration 0047; design §17).
 *
 * An operator with the citizen's permission uploads a file onto their customer record; the
 * server seals a copy into the citizen's cloud vault with the same document key and format the
 * phone uses. Here the phone fetches that ciphertext, opens it with the key it already holds
 * (AAD naming the citizen and the cloud row, format v1), and saves it into the on-phone vault
 * already linked to its cloud copy — so it is never uploaded back, and a later rename, move or
 * delete on the phone reaches the centre-side copy like any synced document.
 *
 * A PDF becomes pages through the phone's PDF renderer (`pdf-pages`), as an imported PDF does.
 * Without one (iOS, older builds) the PDF is left in the cloud and not downloaded at all.
 *
 * Quiet and best effort, like the rest of sync: nothing is logged, and a failure is retried on
 * the next run. Titles and contents are the citizen's: never logged.
 */

import { aesDecryptAsync, type AESEncryptionKey, AESSealedData } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { vaultFileAad } from '@assistigo/core';

import { MULTI_PAGE_LIMIT } from '../scan/scan-session';
import { isPdfImportAvailable, renderPdfPages } from '../scan/pdf-pages';
import type { PageMimeType } from '../vault/vault-index';
import { type IncomingPage, saveDocument } from '../vault/vault-storage';
import type { ApiResult, CitizenApi, CloudDocument } from './citizen-api';
import { pulledDetails } from './sync-plan';

export type PullStep = 'ok' | 'failed' | 'offline' | 'signed_out' | 'skipped';

export type PullContext = {
  readonly api: CitizenApi;
  readonly deviceId: string;
  readonly userId: string;
  readonly key: AESEncryptionKey;
};

const EXTENSION: Record<CloudDocument['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function stepOf<T>(result: ApiResult<T>): PullStep {
  if (result.ok) return 'ok';
  if (result.error.code === 'NETWORK') return 'offline';
  if (result.error.code === 'SIGNED_OUT') return 'signed_out';
  return 'failed';
}

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // The OS clears the cache on its own.
  }
}

/** Downloads, opens and saves one centre-added document. */
export async function pullDocument(run: PullContext, document: CloudDocument): Promise<PullStep> {
  const addedBy = document.addedByCentre;
  if (!addedBy) return 'skipped';
  const isPdf = document.mimeType === 'application/pdf';
  // Nothing to turn it into pages with: leave it in the cloud, and do not download it each run.
  if (isPdf && !isPdfImportAvailable()) return 'skipped';

  const link = await run.api.getDocumentFileUrl(run.deviceId, document.id);
  if (!link.ok) return stepOf(link);

  let sealed: Uint8Array;
  try {
    const response = await expoFetch(link.value);
    if (!response.ok) return 'failed';
    sealed = new Uint8Array(await response.arrayBuffer());
  } catch {
    return 'offline';
  }

  let plaintext: Uint8Array;
  try {
    plaintext = await aesDecryptAsync(AESSealedData.fromCombined(sealed), run.key, {
      additionalData: btoa(vaultFileAad(run.userId, document.id)),
    });
  } catch {
    // Not sealed for this account and row: never save something that does not open cleanly.
    return 'failed';
  }

  const file = new File(Paths.cache, `pulled-${document.id}.${EXTENSION[document.mimeType]}`);
  let pages: IncomingPage[];
  try {
    file.create({ overwrite: true });
    file.write(plaintext);
    if (isPdf) {
      const rendered = await renderPdfPages(file.uri, { maxPages: MULTI_PAGE_LIMIT });
      deleteQuietly(file);
      pages = rendered.pages.map((page) => ({ uri: page.uri, mimeType: 'image/jpeg' }));
    } else {
      pages = [{ uri: file.uri, mimeType: document.mimeType as PageMimeType }];
    }
  } catch {
    deleteQuietly(file);
    return 'failed';
  }

  const details = pulledDetails(document);
  try {
    await saveDocument(
      pages,
      'gallery',
      {
        title: details.title,
        documentType: details.documentType,
        ...(details.category === null ? {} : { category: details.category }),
        phoneOnly: false,
      },
      {
        // Recorded as the phone will send it, so the first sync after the pull changes nothing.
        cloud: {
          id: document.id,
          title: details.title,
          documentType: details.documentType,
          category: details.cloudCategory,
        },
        addedByCentre: addedBy.trim().slice(0, 160),
      },
    );
  } catch {
    return 'failed';
  }
  return 'ok';
}
