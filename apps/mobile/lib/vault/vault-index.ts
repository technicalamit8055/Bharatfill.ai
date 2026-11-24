/**
 * The on-device vault's index: which documents exist and how many pages each has.
 *
 * The index is stored encrypted like the pages (see `vault-storage.ts`) and parsed with Zod on
 * every read, so a damaged or tampered file is refused instead of trusted.
 *
 * Besides ids, timestamps and page counts it holds what the citizen chose on the Save Document
 * screen: a name, a document type, a vault folder, tags, and an expiry date with the id of its
 * reminder. The name and tags are free text that may name the citizen, so they are sealed like
 * the pages and never logged. They may also be Hindi; `serialiseVaultIndex` escapes anything
 * outside ASCII, so the file still round-trips through base64 without a text encoder.
 *
 * A document can be starred so the citizen finds the ones they hand over most often. Every field
 * after `pages` is optional, so indexes written before it existed still parse.
 */

import { DOCUMENT_FOLDERS, DOCUMENT_TYPES, keepsOnPhoneByDefault } from '@assistigo/core';
import { z } from 'zod';

import { VAULT_CATEGORIES, type VaultCategoryKey } from './categories';

export const VAULT_INDEX_VERSION = 1;

/** Where a document's pages came from. */
export const DOCUMENT_SOURCES = ['scanner', 'gallery'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

/** Image types a page may be stored as, and so shown as. */
export const PAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export type PageMimeType = (typeof PAGE_MIME_TYPES)[number];

/** Upper bound on pages per document, above the scanner's own limit to allow gallery imports. */
export const MAX_PAGES_PER_DOCUMENT = 50;

/** Limits on what the Save Document screen stores. */
export const MAX_TITLE_LENGTH = 80;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const vaultDocumentSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  source: z.enum(DOCUMENT_SOURCES),
  pages: z
    .array(z.object({ mimeType: z.enum(PAGE_MIME_TYPES) }))
    .min(1)
    .max(MAX_PAGES_PER_DOCUMENT),
  starred: z.boolean().optional(),
  title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  category: z.enum(VAULT_CATEGORIES).optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS).optional(),
  /** A calendar date, `YYYY-MM-DD`. */
  expiresOn: z.string().regex(ISO_DATE).optional(),
  /** The local notification scheduled for `expiresOn`, so deleting the document cancels it. */
  reminderId: z.string().min(1).max(200).optional(),
  /**
   * "Keep on this phone only": never uploaded to the cloud vault (design §3.2). Every document
   * saved since design §15 has it set, from its type unless the citizen chose; one without it
   * is older and syncs, as it always did.
   */
  phoneOnly: z.boolean().optional(),
  /** The citizen set `phoneOnly` themselves, so a later folder move never changes it. */
  phoneOnlyChosen: z.boolean().optional(),
  /**
   * The centre that added this document for the citizen (0047; design §17), as its name was
   * then. Set only on documents pulled in from the cloud vault; shown as "Added by …".
   */
  addedByCentre: z.string().min(1).max(160).optional(),
  /**
   * The cloud copy of this document, once synced: its server id and the type, title and folder
   * it was last synced with, so a later rename, retype or move is noticed and sent
   * (`lib/cloud/sync-plan.ts`). `category` is absent on copies synced before folders synced;
   * the planner then sends the folder once.
   */
  cloud: z
    .object({
      id: z.string().uuid(),
      title: z.string().min(1).max(120),
      documentType: z.enum(DOCUMENT_TYPES),
      category: z.enum(DOCUMENT_FOLDERS).optional(),
    })
    .optional(),
});

const vaultIndexSchema = z.object({
  version: z.literal(VAULT_INDEX_VERSION),
  documents: z.array(vaultDocumentSchema),
  /**
   * Cloud copies still to delete: documents deleted, or switched to phone-only, after syncing.
   * Kept until the server confirms, so going offline never leaves a copy behind.
   */
  cloudDeletes: z.array(z.string().uuid()).max(1000).optional(),
  /**
   * The cloud account this phone's vault syncs with, set on the first sync. Sync refuses to run
   * for any other account, so a second person signing in on the same phone never has the first
   * person's documents uploaded into their vault. Cleared only when the vault is detached from
   * the cloud (account deleted) or emptied.
   */
  cloudAccountId: z.string().uuid().optional(),
});

export type VaultDocument = z.infer<typeof vaultDocumentSchema>;
export type VaultIndex = z.infer<typeof vaultIndexSchema>;

/** What the citizen chose on the Save Document screen. */
export type DocumentDetails = Pick<
  VaultDocument,
  | 'title'
  | 'documentType'
  | 'category'
  | 'tags'
  | 'expiresOn'
  | 'reminderId'
  | 'phoneOnly'
  | 'phoneOnlyChosen'
>;

/**
 * Whether a new document stays on the phone: what the citizen chose, otherwise the default for
 * its type and folder (design §15). Every save writes the answer, so the sync that runs straight
 * after a save can never upload an everyday scan before the choice is recorded.
 */
export function phoneOnlyForNewDocument(details: DocumentDetails): boolean {
  return details.phoneOnly ?? keepsOnPhoneByDefault(details.documentType, details.category);
}

export const EMPTY_VAULT_INDEX: VaultIndex = { version: VAULT_INDEX_VERSION, documents: [] };

/** Parses a decrypted index. Returns null when it is not a valid index. */
export function parseVaultIndex(json: string): VaultIndex | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = vaultIndexSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * JSON with every character outside ASCII written as a `\uXXXX` escape, which `JSON.parse` reads
 * back unchanged. Only string values can hold such characters, so escaping them in place is
 * still valid JSON.
 */
export function serialiseVaultIndex(index: VaultIndex): string {
  return JSON.stringify(vaultIndexSchema.parse(index)).replace(
    /[\u0080-￿]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Newest first, as every list of documents shows them. */
export function withDocument(index: VaultIndex, document: VaultDocument): VaultIndex {
  const parsed = vaultDocumentSchema.parse(document);
  const others = index.documents.filter((existing) => existing.id !== parsed.id);
  return {
    ...index,
    documents: [parsed, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** Stars or un-stars one document. An unknown id leaves the index as it was. */
export function withStarred(index: VaultIndex, id: string, starred: boolean): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) =>
      document.id === id ? { ...document, starred } : document,
    ),
  };
}

/**
 * What the Document Details screen can change after saving: the name (Edit), the folder (Move;
 * null takes the document out of every folder) and the tags. Fields left out stay as they are.
 */
export type DetailsChange = {
  readonly title?: string;
  readonly category?: VaultCategoryKey | null;
  readonly tags?: readonly string[];
};

/**
 * Applies a details change to one document, validated like any saved document, so a name or tag
 * over the limits is refused. An unknown id leaves the index as it was.
 *
 * Filing an everyday scan in a vault section (Move → Identity) makes it ready for centres, as
 * saving it there would have, unless the citizen chose "phone only" themselves. A move never
 * works the other way: taking a document out of a folder never removes a copy a centre may be
 * using.
 */
export function withDetails(index: VaultIndex, id: string, change: DetailsChange): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) => {
      if (document.id !== id) return document;
      const { category: previous, ...rest } = document;
      const category = change.category === undefined ? previous : change.category;
      const nowShared =
        rest.phoneOnly === true &&
        rest.phoneOnlyChosen !== true &&
        !keepsOnPhoneByDefault(rest.documentType, category);
      return vaultDocumentSchema.parse({
        ...rest,
        ...(nowShared ? { phoneOnly: false } : {}),
        ...(category ? { category } : {}),
        ...(change.title !== undefined ? { title: change.title } : {}),
        ...(change.tags !== undefined ? { tags: [...change.tags] } : {}),
      });
    }),
  };
}

/** Removes a document; a synced one leaves its cloud copy queued for deletion. */
export function withoutDocument(index: VaultIndex, id: string): VaultIndex {
  const removed = index.documents.find((document) => document.id === id);
  const next = { ...index, documents: index.documents.filter((document) => document.id !== id) };
  return removed?.cloud ? withCloudDeleteQueued(next, removed.cloud.id) : next;
}

// ---- Cloud sync state (docs/VAULT_BRIDGE_DESIGN.md §3.2) ------------------------------------

function withCloudDeleteQueued(index: VaultIndex, cloudId: string): VaultIndex {
  const queue = index.cloudDeletes ?? [];
  return queue.includes(cloudId) ? index : { ...index, cloudDeletes: [...queue, cloudId] };
}

/** Records that a document's cloud copy now matches `cloud`. */
export function withCloudSynced(
  index: VaultIndex,
  id: string,
  cloud: NonNullable<VaultDocument['cloud']>,
): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) =>
      document.id === id ? vaultDocumentSchema.parse({ ...document, cloud }) : document,
    ),
  };
}

/**
 * The citizen turns "Keep on this phone only" on or off. Turning it on for a synced document
 * forgets its cloud copy here and queues that copy for deletion. Either way it is now their
 * choice, which a folder move no longer overrides.
 */
export function withPhoneOnly(index: VaultIndex, id: string, phoneOnly: boolean): VaultIndex {
  const target = index.documents.find((document) => document.id === id);
  if (!target) return index;
  const { cloud, ...rest } = target;
  const updated: VaultDocument = phoneOnly
    ? { ...rest, phoneOnly: true, phoneOnlyChosen: true }
    : { ...target, phoneOnly: false, phoneOnlyChosen: true };
  const next = {
    ...index,
    documents: index.documents.map((document) => (document.id === id ? updated : document)),
  };
  return phoneOnly && cloud ? withCloudDeleteQueued(next, cloud.id) : next;
}

/**
 * An upload finished. If the document was deleted or made phone-only while it uploaded, the new
 * cloud copy is queued for deletion instead of being recorded — never left behind.
 */
export function withUploadFinished(
  index: VaultIndex,
  id: string,
  cloud: NonNullable<VaultDocument['cloud']>,
): VaultIndex {
  const document = index.documents.find((candidate) => candidate.id === id);
  if (!document || document.phoneOnly) return withCloudDeleteQueued(index, cloud.id);
  return withCloudSynced(index, id, cloud);
}

/** The server confirmed a queued cloud copy is gone (or was never there). */
export function withCloudDeleteDone(index: VaultIndex, cloudId: string): VaultIndex {
  const queue = (index.cloudDeletes ?? []).filter((queued) => queued !== cloudId);
  return { ...index, cloudDeletes: queue };
}

/** The server no longer has this document's cloud copy: forget it, so it is uploaded again. */
export function withCloudForgotten(index: VaultIndex, id: string): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) => {
      if (document.id !== id || !document.cloud) return document;
      const { cloud: _gone, ...rest } = document;
      return rest;
    }),
  };
}

/**
 * Whether `userId` may sync this vault: the account it is bound to, or any account when it is
 * not bound yet. Indexes written before the binding existed are unbound, so the first account
 * to sync after the update claims them; only one account could have synced them.
 */
export function canSyncAs(index: VaultIndex, userId: string): boolean {
  return index.cloudAccountId === undefined || index.cloudAccountId === userId;
}

/** Binds the vault to `userId`; a vault bound to another account is left as it is. */
export function withCloudAccount(index: VaultIndex, userId: string): VaultIndex {
  if (!canSyncAs(index, userId) || index.cloudAccountId === userId) return index;
  return { ...index, cloudAccountId: userId };
}

/**
 * Cuts the vault loose from the cloud after the account is deleted: the cloud copies are gone
 * with it, so every document forgets its copy, nothing stays queued, and the binding is
 * cleared. What is left is the plain on-phone vault; a later account starts from scratch.
 */
export function withCloudDetached(index: VaultIndex): VaultIndex {
  const { cloudDeletes: _queue, cloudAccountId: _account, ...rest } = index;
  return {
    ...rest,
    documents: index.documents.map((document) => {
      if (!document.cloud) return document;
      const { cloud: _gone, ...kept } = document;
      return kept;
    }),
  };
}

/**
 * What Log out tells the citizen before they choose whether to keep the documents on this
 * phone: how many there are, and how many exist only here (phone-only, or not synced yet) and
 * would be lost for good if removed.
 */
export type PhoneVaultSummary = { readonly total: number; readonly onlyOnPhone: number };

export function phoneVaultSummary(index: VaultIndex): PhoneVaultSummary {
  const onlyOnPhone = index.documents.filter(
    (document) => document.phoneOnly === true || !document.cloud,
  ).length;
  return { total: index.documents.length, onlyOnPhone };
}

export function findDocument(index: VaultIndex, id: string): VaultDocument | null {
  return index.documents.find((document) => document.id === id) ?? null;
}

/** File name of one encrypted page inside its document's folder. */
export function pageFileName(pageIndex: number): string {
  return `page-${String(pageIndex + 1).padStart(3, '0')}.enc`;
}

/**
 * Additional authenticated data for one page, before base64. Binding the ciphertext to its
 * document and position means a page file copied or moved elsewhere fails to decrypt, instead of
 * silently showing up as a different document.
 */
export function pageAssociatedData(documentId: string, pageIndex: number): string {
  return `bharatfill-vault/v${VAULT_INDEX_VERSION}/page/${documentId}/${pageIndex}`;
}

/** Additional authenticated data for the index file, before base64. */
export const INDEX_ASSOCIATED_DATA = `bharatfill-vault/v${VAULT_INDEX_VERSION}/index`;

const EXTENSION_MIME_TYPES: Readonly<Record<string, PageMimeType>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

/** Falls back to the file extension when a picker does not report a MIME type. */
export function pageMimeTypeFromName(name: string): PageMimeType | null {
  const extension = name.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

/** Maps a picker's reported MIME type to one the vault stores; unknown types are refused. */
export function pageMimeTypeOf(reported: string | null | undefined): PageMimeType | null {
  const normalised = reported?.toLowerCase().trim();
  if (normalised === 'image/jpg') return 'image/jpeg';
  const parsed = z.enum(PAGE_MIME_TYPES).safeParse(normalised);
  return parsed.success ? parsed.data : null;
}
