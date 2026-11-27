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

import type { FamilyMember, FamilyRelation, MemberId } from '../family/family';
import { isDisposableScanFile } from '../scan/scan-session';
import { cancelExpiryReminder, type ReminderCopy, scheduleExpiryReminder } from './expiry-reminders';
import { type ReminderPlan, reminderPlanFor } from './save-document';
import {
  type DetailsChange,
  type DocumentDetails,
  type DocumentSource,
  EMPTY_VAULT_INDEX,
  findDocument,
  type MemberChange,
  membersOf,
  withDocumentMember,
  withMemberAdded,
  withMemberChanged,
  withoutMember,
  withReminder,
  INDEX_ASSOCIATED_DATA,
  MAX_PAGES_PER_DOCUMENT,
  pageAssociatedData,
  pageFileName,
  type PageMimeType,
  parseVaultIndex,
  phoneOnlyForNewDocument,
  parseSearchText,
  serialiseSearchText,
  serialiseVaultIndex,
  type StoredReading,
  TEXT_FILE_NAME,
  textAssociatedData,
  type VaultDocument,
  type VaultIndex,
  withDetails,
  withReading,
  withDocument,
  withoutDocument,
  withPhoneOnly,
  withQrCheck,
  withStarred,
  type StoredQrCheck,
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

// ---- Change signal ------------------------------------------------------------------------

const changeListeners = new Set<() => void>();

/**
 * Called after the citizen saves, renames, moves, stars, deletes or changes the sync setting of a
 * document — so cloud sync can follow — never with what changed. Returns an unsubscribe.
 * Sync's own bookkeeping (`updateVaultIndex`) does not signal, so a sync cannot wake itself.
 */
export function onVaultChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function signalVaultChanged(): void {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch {
      // A listener's failure is its own; the change itself already succeeded.
    }
  }
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
  /**
   * A document pulled in from the cloud vault (a centre added it, 0047): saved already linked
   * to its cloud copy, in the same index write, so sync never uploads it back. Saving it again
   * for a cloud copy this vault already holds returns the existing document's id.
   */
  pulled?: { readonly cloud: NonNullable<VaultDocument['cloud']>; readonly addedByCentre: string },
  /** The text the phone read off the pages (`lib/ocr`), sealed beside them for search. */
  searchText?: string,
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
      if (searchText) await sealText(id, searchText, key);

      const document: VaultDocument = {
        id,
        createdAt: new Date().toISOString(),
        source,
        pages: pages.map(({ mimeType }) => ({ mimeType })),
        ...details,
        // Written in the same index write as the document, before any sync can see it (§15).
        phoneOnly: pulled ? false : phoneOnlyForNewDocument(details),
        ...(pulled ? { cloud: pulled.cloud, addedByCentre: pulled.addedByCentre } : {}),
      };
      const existing = await exclusive(async () => {
        const index = await readIndexForUpdate(key);
        const held = pulled
          ? index.documents.find((candidate) => candidate.cloud?.id === pulled.cloud.id)
          : undefined;
        if (held) return held.id;
        await writeIndex(withDocument(index, document), key);
        return null;
      });
      if (existing) {
        directory.delete();
        return existing;
      }
      signalVaultChanged();
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
  signalVaultChanged();
}

/** Records what a document's QR code proved (only the summary: never the code's contents). */
export async function setQrCheck(id: string, qrCheck: StoredQrCheck | null): Promise<void> {
  const key = await vaultKey();
  await exclusive(async () => writeIndex(withQrCheck(await readIndex(key), id, qrCheck), key));
  signalVaultChanged();
}

/** Renames, moves or re-tags a document. Returns it as saved; null when it no longer exists. */
export async function updateDetails(
  id: string,
  change: DetailsChange,
): Promise<VaultDocument | null> {
  const key = await vaultKey();
  const saved = await exclusive(async () => {
    const index = withDetails(await readIndex(key), id, change);
    await writeIndex(index, key);
    return findDocument(index, id);
  });
  signalVaultChanged();
  return saved;
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
  textCache.delete(id);
  if (removed?.reminderId) await cancelExpiryReminder(removed.reminderId);
  signalVaultChanged();
}

// ---- Document text (lib/ocr) --------------------------------------------------------------

/**
 * Texts already opened this run, by document id, so typing in the search box does not decrypt
 * every document again on each key. Held in memory only, like the decrypted index.
 */
const textCache = new Map<string, string>();

async function sealText(id: string, text: string, key: AESEncryptionKey): Promise<void> {
  await sealTo(
    new File(documentDirectory(id), TEXT_FILE_NAME),
    asciiToBase64(serialiseSearchText(text)),
    textAssociatedData(id),
    key,
  );
  textCache.set(id, text);
}

/**
 * Records what the phone read off a saved document: its details in the index and its text
 * sealed beside its pages. A document deleted meanwhile is left deleted. Does not signal a
 * change: the reading is never synced, so there is nothing for sync to do.
 */
export async function saveDocumentReading(
  id: string,
  reading: StoredReading,
  searchText: string,
): Promise<void> {
  const key = await vaultKey();
  await exclusive(async () => {
    const index = await readIndexForUpdate(key);
    if (!findDocument(index, id) || !documentDirectory(id).exists) return;
    if (searchText) await sealText(id, searchText, key);
    await writeIndex(withReading(index, id, reading), key);
  });
}

/**
 * The text of each document that has one, by id, decrypted into memory for search. A document
 * whose text will not open is left out rather than failing the search.
 */
export async function readSearchTexts(
  documents: readonly VaultDocument[],
): Promise<ReadonlyMap<string, string>> {
  const key = await vaultKey();
  const texts = new Map<string, string>();
  for (const document of documents) {
    const cached = textCache.get(document.id);
    if (cached !== undefined) {
      texts.set(document.id, cached);
      continue;
    }
    if (!document.reading) continue;
    const file = new File(documentDirectory(document.id), TEXT_FILE_NAME);
    if (!file.exists) continue;
    try {
      const text = parseSearchText(
        atob(await openAsBase64(file, textAssociatedData(document.id), key)),
      );
      if (text === null) continue;
      textCache.set(document.id, text);
      texts.set(document.id, text);
    } catch {
      // Unreadable: this document is found by its name and tags only.
    }
  }
  return texts;
}

/**
 * Removes every document from this phone — pages, index entries and expiry reminders — for Log
 * out and Delete account when the citizen chooses "remove from this phone". Cloud copies are
 * not touched. The vault key stays; it protects nothing once the files are gone, and the next
 * save reuses it.
 *
 * The index is reset to empty and unbound, so the next person to sign in here starts clean —
 * except that with `keepPendingCloudDeletes`, cloud deletions still queued (documents deleted
 * while offline) are kept with the account binding, so they go through the next time that
 * account syncs here instead of leaving a deleted document in the cloud.
 */
export async function clearVault(options: { keepPendingCloudDeletes: boolean }): Promise<void> {
  const key = await vaultKey();
  const removed = await exclusive(async () => {
    const index = await readIndexForUpdate(key);
    const pending = options.keepPendingCloudDeletes ? (index.cloudDeletes ?? []) : [];
    await writeIndex(
      pending.length > 0 && index.cloudAccountId
        ? { ...EMPTY_VAULT_INDEX, cloudDeletes: pending, cloudAccountId: index.cloudAccountId }
        : EMPTY_VAULT_INDEX,
      key,
    );
    return index.documents;
  });

  textCache.clear();
  for (const document of removed) {
    const directory = documentDirectory(document.id);
    if (directory.exists) directory.delete();
    if (document.reminderId) {
      try {
        await cancelExpiryReminder(document.reminderId);
      } catch {
        // A reminder that will not cancel still never names the document; carry on.
      }
    }
  }
  signalVaultChanged();
}

/**
 * "Keep on this phone only". Turning it on for a synced document queues its cloud copy for
 * deletion; turning it off lets the next sync upload the document.
 */
export async function setPhoneOnly(id: string, phoneOnly: boolean): Promise<void> {
  const key = await vaultKey();
  await exclusive(async () => writeIndex(withPhoneOnly(await readIndex(key), id, phoneOnly), key));
  signalVaultChanged();
}

// ---- Family members (lib/family/family.ts) --------------------------------------------------

/**
 * What an expiry reminder says for one person's document, already translated. It may name the
 * relation ("Papa's document…") and how far off the date is, but never the member's own name or
 * anything about the document.
 */
export type ReminderCopyFor = (owner: FamilyMember | null, plan: ReminderPlan) => ReminderCopy;

/** The family members, oldest first. */
export async function listFamilyMembers(): Promise<readonly FamilyMember[]> {
  return membersOf(await readIndex(await vaultKey()));
}

/** Adds a member. Throws a RangeError when the family is already full. */
export async function addFamilyMember(input: {
  readonly relation: FamilyRelation;
  readonly name: string | null;
}): Promise<FamilyMember> {
  const member: FamilyMember = {
    id: randomUUID(),
    relation: input.relation,
    ...(input.name ? { name: input.name } : {}),
    createdAt: new Date().toISOString(),
  };
  const key = await vaultKey();
  await exclusive(async () => writeIndex(withMemberAdded(await readIndex(key), member), key));
  signalVaultChanged();
  return member;
}

/**
 * Replaces the reminders of `documents` with ones worded for their owner now — after a
 * document changes hands, or a member's relation changes. Best effort: a reminder that will not
 * schedule leaves the document without one rather than failing the change.
 */
async function rewordReminders(
  documentIds: readonly string[],
  copyFor: ReminderCopyFor,
): Promise<void> {
  const key = await vaultKey();
  const index = await readIndex(key);
  const members = membersOf(index);
  for (const id of documentIds) {
    const document = findDocument(index, id);
    if (!document?.reminderId || !document.expiresOn) continue;
    await cancelExpiryReminder(document.reminderId);
    const owner = members.find((member) => member.id === document.memberId) ?? null;
    const plan = reminderPlanFor(document, new Date());
    let reminderId: string | null = null;
    if (plan) {
      try {
        reminderId = await scheduleExpiryReminder(plan.at, copyFor(owner, plan));
      } catch {
        reminderId = null;
      }
    }
    await exclusive(async () => writeIndex(withReminder(await readIndex(key), id, reminderId), key));
  }
}

export async function updateFamilyMember(
  id: string,
  change: MemberChange,
  copyFor: ReminderCopyFor,
): Promise<void> {
  const key = await vaultKey();
  const relationChanged = await exclusive(async () => {
    const index = await readIndex(key);
    const before = membersOf(index).find((member) => member.id === id);
    await writeIndex(withMemberChanged(index, id, change), key);
    return before !== undefined && change.relation !== undefined && change.relation !== before.relation;
  });
  if (relationChanged) {
    const owned = (await readIndex(key)).documents.filter((document) => document.memberId === id);
    await rewordReminders(
      owned.map((document) => document.id),
      copyFor,
    );
  }
  signalVaultChanged();
}

/** Removes a member with all their documents: pages, index entries and reminders. */
export async function removeFamilyMember(id: string): Promise<void> {
  const key = await vaultKey();
  const removed = await exclusive(async () => {
    const result = withoutMember(await readIndex(key), id);
    await writeIndex(result.index, key);
    return result.removed;
  });
  for (const document of removed) {
    const directory = documentDirectory(document.id);
    if (directory.exists) directory.delete();
    if (document.reminderId) await cancelExpiryReminder(document.reminderId);
  }
  signalVaultChanged();
}

/**
 * Files a document under a family member, or back under the citizen (`null`); see
 * `withDocumentMember` for what that does to sharing. Returns the document as saved.
 */
export async function moveDocumentToMember(
  id: string,
  memberId: MemberId,
  copyFor: ReminderCopyFor,
): Promise<VaultDocument | null> {
  const key = await vaultKey();
  const moved = await exclusive(async () => {
    const index = await readIndex(key);
    const before = findDocument(index, id);
    const next = withDocumentMember(index, id, memberId);
    await writeIndex(next, key);
    return before !== null && (before.memberId ?? null) !== memberId;
  });
  if (moved) await rewordReminders([id], copyFor);
  signalVaultChanged();
  return findDocument(await readIndex(key), id);
}

// ---- Cloud sync state (docs/VAULT_BRIDGE_DESIGN.md §3.2) -----------------------------------

/** The whole index, read for the sync planner. */
export async function readVaultIndex(): Promise<VaultIndex> {
  return readIndex(await vaultKey());
}

/**
 * Applies one sync-state change (`withCloudSynced`, `withCloudDeleteDone`, …) to the index under
 * the same lock as every other write, so a sync never loses a save or rename made meanwhile.
 */
export async function updateVaultIndex(change: (index: VaultIndex) => VaultIndex): Promise<void> {
  const key = await vaultKey();
  await exclusive(async () => writeIndex(change(await readIndex(key)), key));
}
