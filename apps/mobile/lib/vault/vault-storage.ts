/**
 * The on-device document vault: encrypted page files plus an encrypted index.
 *
 * - Every page is sealed with AES-256-GCM (`expo-crypto`) before it touches app storage. The
 *   key is generated on the phone and kept in the platform keystore (`expo-secure-store`,
 *   this-device-only), so a backup or a copied file is unreadable without the phone.
 * - Each page's ciphertext is bound to its document id and position (GCM additional data), so a
 *   file moved between documents fails to decrypt.
 * - The plaintext copies the scanner and the image picker leave behind are deleted as soon as
 *   the page is sealed, whether or not saving succeeds (see `isDisposableScanFile`).
 * - Nothing here uploads, logs or shares anything. Decrypted pages exist only in memory, as data
 *   URIs for display.
 *
 * Layout under the app's document directory:
 *   vault/index.enc              the index (`vault-index.ts`)
 *   vault/<document id>/page-001.enc …
 */

import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  randomUUID,
} from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { isDisposableScanFile } from '../scan/scan-session';
import { cancelExpiryReminder } from './expiry-reminders';
import {
  type DetailsChange,
  type DocumentDetails,
  type DocumentSource,
  EMPTY_VAULT_INDEX,
  findDocument,
  INDEX_ASSOCIATED_DATA,
  MAX_PAGES_PER_DOCUMENT,
  pageAssociatedData,
  pageFileName,
  type PageMimeType,
  parseVaultIndex,
  serialiseVaultIndex,
  type VaultDocument,
  type VaultIndex,
  withDetails,
  withDocument,
  withoutDocument,
  withStarred,
} from './vault-index';

const KEY_ENTRY = 'bharatfill.vault.key.v1';
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class VaultUnreadableError extends Error {
  constructor() {
    super('The vault could not be decrypted on this device.');
    this.name = 'VaultUnreadableError';
  }
}

// ---- Key ----------------------------------------------------------------------------------

let keyPromise: Promise<AESEncryptionKey> | null = null;

async function loadOrCreateKey(): Promise<AESEncryptionKey> {
  // A read that throws (keystore locked, unavailable) propagates: a new key is made only when
  // there is definitely none, never over a key that is merely out of reach right now.
  const stored = await SecureStore.getItemAsync(KEY_ENTRY, KEY_OPTIONS);
  if (stored) return AESEncryptionKey.import(stored, 'base64');

  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(KEY_ENTRY, await key.encoded('base64'), KEY_OPTIONS);
  return key;
}

function vaultKey(): Promise<AESEncryptionKey> {
  keyPromise ??= loadOrCreateKey().catch((error: unknown) => {
    keyPromise = null;
    throw error;
  });
  return keyPromise;
}

// ---- Encryption ---------------------------------------------------------------------------

/** `expo-crypto` takes string inputs as base64. Every associated-data string here is ASCII. */
function asciiToBase64(text: string): string {
  return btoa(text);
}

async function sealTo(
  target: File,
  plaintext: Uint8Array | string,
  associatedData: string,
  key: AESEncryptionKey,
): Promise<void> {
  const sealed = await aesEncryptAsync(plaintext, key, {
    additionalData: asciiToBase64(associatedData),
  });
  target.write(await sealed.combined('bytes'));
}

/** Decrypts a sealed file to base64. Throws `VaultUnreadableError` when it does not open. */
async function openAsBase64(
  source: File,
  associatedData: string,
  key: AESEncryptionKey,
): Promise<string> {
  try {
    const sealed = AESSealedData.fromCombined(await source.bytes());
    const plaintext = await aesDecryptAsync(sealed, key, {
      output: 'base64',
      additionalData: asciiToBase64(associatedData),
    });
    return plaintext.replace(/\s/g, '');
  } catch {
    throw new VaultUnreadableError();
  }
}

// ---- Layout -------------------------------------------------------------------------------

function vaultDirectory(): Directory {
  const directory = new Directory(Paths.document, 'vault');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function indexFile(): File {
  return new File(vaultDirectory(), 'index.enc');
}

function documentDirectory(id: string): Directory {
  return new Directory(vaultDirectory(), id);
}

// ---- Index --------------------------------------------------------------------------------

/** Index writes are read-modify-write, so they run one at a time. */
let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readIndex(key: AESEncryptionKey): Promise<VaultIndex> {
  const file = indexFile();
  if (!file.exists) return EMPTY_VAULT_INDEX;

  const index = parseVaultIndex(atob(await openAsBase64(file, INDEX_ASSOCIATED_DATA, key)));
  if (!index) throw new VaultUnreadableError();
  return index;
}

/**
 * The index to update. One that can never be opened again — its key is gone, so its pages are
 * unreadable too — must not block every later save, so updates start from an empty index.
 */
async function readIndexForUpdate(key: AESEncryptionKey): Promise<VaultIndex> {
  try {
    return await readIndex(key);
  } catch (error) {
    if (error instanceof VaultUnreadableError) return EMPTY_VAULT_INDEX;
    throw error;
  }
}

async function writeIndex(index: VaultIndex, key: AESEncryptionKey): Promise<void> {
  // Written beside the live index and moved over it, so a crash mid-write cannot corrupt it.
  const pending = new File(vaultDirectory(), 'index.enc.pending');
  await sealTo(pending, asciiToBase64(serialiseVaultIndex(index)), INDEX_ASSOCIATED_DATA, key);
  await pending.move(indexFile(), { overwrite: true });
}

// ---- Public API ---------------------------------------------------------------------------

export type IncomingPage = {
  /** A `file://` URI from the scanner or the image picker. */
  readonly uri: string;
  readonly mimeType: PageMimeType;
};

/** The app's `tmp` folder, where the camera leaves photos on iOS. */
function tempDirectoryUri(): string {
  return new Directory(Paths.document.parentDirectory, 'tmp').uri;
}

function deleteIfDisposable(uri: string): void {
  try {
    if (!isDisposableScanFile(uri, { cacheUri: Paths.cache.uri, tempUri: tempDirectoryUri() })) {
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort: the OS clears the cache and tmp folders on its own when space runs low.
  }
}

/**
 * Deletes the app's temporary copies of pages that will not be saved — camera photos, picker
 * copies, processed previews. Gallery originals are never touched.
 */
export function discardIncoming(uris: readonly string[]): void {
  for (const uri of uris) deleteIfDisposable(uri);
}

/**
 * Encrypts the pages into a new vault document and returns its id. The source copies are
 * deleted afterwards, whether or not saving succeeded; a failed save leaves nothing behind.
 */
export async function saveDocument(
  pages: readonly IncomingPage[],
  source: DocumentSource,
  details: DocumentDetails = {},
): Promise<string> {
  try {
    if (pages.length === 0 || pages.length > MAX_PAGES_PER_DOCUMENT) {
      throw new RangeError(`A document needs 1–${MAX_PAGES_PER_DOCUMENT} pages.`);
    }

    const key = await vaultKey();
    const id = randomUUID();
    const directory = documentDirectory(id);
    directory.create({ intermediates: true });

    try {
      for (const [pageIndex, page] of pages.entries()) {
        const plaintext = await new File(page.uri).bytes();
        await sealTo(
          new File(directory, pageFileName(pageIndex)),
          plaintext,
          pageAssociatedData(id, pageIndex),
          key,
        );
      }

      const document: VaultDocument = {
        id,
        createdAt: new Date().toISOString(),
        source,
        pages: pages.map(({ mimeType }) => ({ mimeType })),
        ...details,
      };
      await exclusive(async () =>
        writeIndex(withDocument(await readIndexForUpdate(key), document), key),
      );
      return id;
    } catch (error) {
      if (directory.exists) directory.delete();
      throw error;
    }
  } finally {
    for (const page of pages) deleteIfDisposable(page.uri);
  }
}

/** Every document, newest first. */
export async function listDocuments(): Promise<readonly VaultDocument[]> {
  return (await readIndex(await vaultKey())).documents;
}

export async function getDocument(id: string): Promise<VaultDocument | null> {
  return findDocument(await readIndex(await vaultKey()), id);
}

/**
 * One page, decrypted into a `data:` URI for an `<Image>`. It lives only in memory; nothing is
 * written back to disk in the clear.
 */
export async function readPageDataUri(document: VaultDocument, pageIndex: number): Promise<string> {
  const page = document.pages[pageIndex];
  if (!page) throw new RangeError('No such page.');

  const file = new File(documentDirectory(document.id), pageFileName(pageIndex));
  const base64 = await openAsBase64(
    file,
    pageAssociatedData(document.id, pageIndex),
    await vaultKey(),
  );
  return `data:${page.mimeType};base64,${base64}`;
}

/**
 * Bytes the document takes on this phone: its encrypted pages, each 28 bytes (IV and tag)
 * larger than the page itself. Null when a page's size cannot be read.
 */
export function documentSizeBytes(document: VaultDocument): number | null {
  let total = 0;
  for (const pageIndex of document.pages.keys()) {
    const size = new File(documentDirectory(document.id), pageFileName(pageIndex)).size;
    if (size === null) return null;
    total += size;
  }
  return total;
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  const key = await vaultKey();
  await exclusive(async () => writeIndex(withStarred(await readIndex(key), id, starred), key));
}

/** Renames, moves or re-tags a document. Returns it as saved; null when it no longer exists. */
export async function updateDetails(
  id: string,
  change: DetailsChange,
): Promise<VaultDocument | null> {
  const key = await vaultKey();
  return exclusive(async () => {
    const index = withDetails(await readIndex(key), id, change);
    await writeIndex(index, key);
    return findDocument(index, id);
  });
}

/** Deletes the document's pages and index entry, and cancels its expiry reminder if it has one. */
export async function deleteDocument(id: string): Promise<void> {
  const key = await vaultKey();
  const removed = await exclusive(async () => {
    const index = await readIndexForUpdate(key);
    await writeIndex(withoutDocument(index, id), key);
    return findDocument(index, id);
  });

  const directory = documentDirectory(id);
  if (directory.exists) directory.delete();
  if (removed?.reminderId) await cancelExpiryReminder(removed.reminderId);
}
