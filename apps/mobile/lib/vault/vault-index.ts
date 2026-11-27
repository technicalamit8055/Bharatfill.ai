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
 *
 * The index also holds the citizen's family members (`lib/family/family.ts`). A document with a
 * `memberId` is that member's and is always "phone only": it is never uploaded, and filing an
 * already synced document under a member queues its cloud copy for deletion.
 */

import { DOCUMENT_FOLDERS, DOCUMENT_TYPES, keepsOnPhoneByDefault } from '@assistigo/core';
import { QR_CHECK_RESULTS } from '@assistigo/document-tools/qr';
import { z } from 'zod';

import {
  type FamilyMember,
  familyMemberSchema,
  MAX_FAMILY_MEMBERS,
  type MemberId,
} from '../family/family';
import { MAX_FIELD_VALUE, MAX_READ_FIELDS } from '../ocr/document-reading';
import { VAULT_CATEGORIES, type VaultCategoryKey } from './categories';
import { EVERYDAY_KINDS } from './everyday';

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
  /**
   * An everyday paper's kind (a bill, a bike's PUC, a warranty card; `lib/vault/everyday.ts`).
   * Kept on the phone only: it is never synced, and the document's type stays "Other".
   */
  everydayKind: z.enum(EVERYDAY_KINDS).optional(),
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
  /** The family member this document belongs to; absent for the citizen's own. */
  memberId: z.string().uuid().optional(),
  /**
   * The phone has read this document's text (`lib/ocr/document-reading.ts`): the details it
   * found (name, date of birth, roll number…), with Aadhaar-like numbers masked. Its text, for
   * search, is sealed beside the pages (`vault-storage.ts`). Absent until read; a document read
   * by an older `READING_VERSION` is read again. Never synced.
   */
  reading: z
    .object({
      version: z.number().int().positive(),
      fields: z
        .array(
          z.object({
            key: z
              .string()
              .max(80)
              .regex(/^customer\.[a-z0-9_.]+$/),
            value: z.string().min(1).max(MAX_FIELD_VALUE),
          }),
        )
        .max(MAX_READ_FIELDS),
    })
    .optional(),
  /**
   * What the document's QR code proved when it was last checked (`lib/scan/qr-scan.ts`): the
   * result, when, and for a link its host. Never the code's contents — no name, number or full
   * link is kept. Absent until checked. Never synced: a centre checks the document itself.
   */
  qrCheck: z
    .object({
      result: z.enum(QR_CHECK_RESULTS),
      checkedAt: z.string().datetime(),
      host: z.string().min(1).max(253).optional(),
    })
    .optional(),
  /**
   * The cloud copy of this document, once synced: its server id and the type, title and folder
   * it was last synced with, so a later rename, retype or move is noticed and sent
   * (`lib/cloud/sync-plan.ts`). `category` is absent on copies synced before folders synced;
   * the planner then sends the folder once.
   *
   * `centreReady` is what the server last said about the copy cyber cafes use: false when it
   * could not be made (the server retries on every sync), so the vault can show an error.
   * Absent until a server that reports it has been asked.
   */
  cloud: z
    .object({
      id: z.string().uuid(),
      title: z.string().min(1).max(120),
      documentType: z.enum(DOCUMENT_TYPES),
      category: z.enum(DOCUMENT_FOLDERS).optional(),
      centreReady: z.boolean().optional(),
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
  /** The citizen's family members, oldest first. Absent until the first one is added. */
  members: z.array(familyMemberSchema).max(MAX_FAMILY_MEMBERS).optional(),
});

export type VaultDocument = z.infer<typeof vaultDocumentSchema>;
export type VaultIndex = z.infer<typeof vaultIndexSchema>;

/** What the citizen chose on the Save Document screen. */
export type DocumentDetails = Pick<
  VaultDocument,
  | 'title'
  | 'documentType'
  | 'everydayKind'
  | 'category'
  | 'tags'
  | 'expiresOn'
  | 'reminderId'
  | 'phoneOnly'
  | 'phoneOnlyChosen'
  | 'memberId'
  | 'reading'
  | 'qrCheck'
>;

/** What a document's QR code proved (`VaultDocument['qrCheck']`). */
export type StoredQrCheck = NonNullable<VaultDocument['qrCheck']>;

/** Records a QR check on a document; null clears it. An unknown id leaves the index as it was. */
export function withQrCheck(
  index: VaultIndex,
  id: string,
  qrCheck: StoredQrCheck | null,
): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) => {
      if (document.id !== id) return document;
      const { qrCheck: _previous, ...rest } = document;
      return vaultDocumentSchema.parse(qrCheck ? { ...rest, qrCheck } : rest);
    }),
  };
}

/** What the phone read off a document (`VaultDocument['reading']`). */
export type StoredReading = NonNullable<VaultDocument['reading']>;

/** Records what the phone read off a document. An unknown id leaves the index as it was. */
export function withReading(index: VaultIndex, id: string, reading: StoredReading): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) =>
      document.id === id ? vaultDocumentSchema.parse({ ...document, reading }) : document,
    ),
  };
}

/** Documents the phone has not read yet, or read with an older version of the reader. */
export function documentsToRead(index: VaultIndex, version: number): readonly VaultDocument[] {
  return index.documents.filter((document) => (document.reading?.version ?? 0) < version);
}

/**
 * Whether a new document stays on the phone: what the citizen chose, otherwise the default for
 * its type and folder (design §15). Every save writes the answer, so the sync that runs straight
 * after a save can never upload an everyday scan before the choice is recorded.
 */
export function phoneOnlyForNewDocument(details: DocumentDetails): boolean {
  if (details.memberId) return true;
  return details.phoneOnly ?? keepsOnPhoneByDefault(details.documentType, details.category);
}

/** A document may only be filed under a member this vault holds. */
export class UnknownMemberError extends Error {
  constructor() {
    super('That family member is not in this vault.');
    this.name = 'UnknownMemberError';
  }
}

function hasMember(index: VaultIndex, memberId: string): boolean {
  return (index.members ?? []).some((member) => member.id === memberId);
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
  if (document.memberId && !hasMember(index, document.memberId)) throw new UnknownMemberError();
  const parsed = vaultDocumentSchema.parse(
    document.memberId ? { ...document, phoneOnly: true } : document,
  );
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
        rest.memberId === undefined &&
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

// ---- Family members (lib/family/family.ts) ---------------------------------------------------

export function membersOf(index: VaultIndex): readonly FamilyMember[] {
  return index.members ?? [];
}

/** Adds a member at the end. Throws a RangeError when the family is full. */
export function withMemberAdded(index: VaultIndex, member: FamilyMember): VaultIndex {
  const members = membersOf(index);
  if (members.some((existing) => existing.id === member.id)) return index;
  if (members.length >= MAX_FAMILY_MEMBERS) throw new RangeError('The family is full.');
  return { ...index, members: [...members, familyMemberSchema.parse(member)] };
}

/** What can change about a member: the relation, and the name (null removes it). */
export type MemberChange = {
  readonly relation?: FamilyMember['relation'];
  readonly name?: string | null;
};

export function withMemberChanged(index: VaultIndex, id: string, change: MemberChange): VaultIndex {
  return {
    ...index,
    members: membersOf(index).map((member) => {
      if (member.id !== id) return member;
      const { name: previous, ...rest } = member;
      const name = change.name === undefined ? previous : change.name;
      return familyMemberSchema.parse({
        ...rest,
        ...(change.relation ? { relation: change.relation } : {}),
        ...(name ? { name } : {}),
      });
    }),
  };
}

/**
 * Removes a member and every document filed under them: their documents are never quietly
 * handed to the citizen, where they would start syncing. The caller deletes the pages and
 * reminders of the documents it returns.
 */
export function withoutMember(
  index: VaultIndex,
  id: string,
): { readonly index: VaultIndex; readonly removed: readonly VaultDocument[] } {
  const removed = index.documents.filter((document) => document.memberId === id);
  let next: VaultIndex = {
    ...index,
    members: membersOf(index).filter((member) => member.id !== id),
  };
  for (const document of removed) next = withoutDocument(next, document.id);
  return { index: next, removed };
}

/**
 * Files a document under a family member, or back under the citizen (`null`).
 *
 * To a member: it becomes phone-only and a synced copy is queued for deletion. Back to the
 * citizen: it follows its type's default again (an Aadhaar becomes ready for centres), unless
 * the citizen chose "phone only" themselves. An unknown document leaves the index as it was;
 * an unknown member throws `UnknownMemberError`.
 */
export function withDocumentMember(index: VaultIndex, id: string, memberId: MemberId): VaultIndex {
  if (memberId !== null && !hasMember(index, memberId)) throw new UnknownMemberError();
  const target = index.documents.find((document) => document.id === id);
  if (!target || (target.memberId ?? null) === memberId) return index;

  const { cloud, memberId: _previous, ...rest } = target;
  const replace = (updated: VaultDocument): VaultIndex => ({
    ...index,
    documents: index.documents.map((document) => (document.id === id ? updated : document)),
  });

  if (memberId !== null) {
    // A choice to share no longer applies; one to keep it on the phone still does, later.
    const { phoneOnlyChosen, ...kept } = rest;
    const keepChoice = phoneOnlyChosen === true && rest.phoneOnly === true;
    const next = replace(
      vaultDocumentSchema.parse({
        ...kept,
        memberId,
        phoneOnly: true,
        ...(keepChoice ? { phoneOnlyChosen: true } : {}),
      }),
    );
    return cloud ? withCloudDeleteQueued(next, cloud.id) : next;
  }

  const phoneOnly =
    rest.phoneOnlyChosen === true
      ? rest.phoneOnly === true
      : keepsOnPhoneByDefault(rest.documentType, rest.category);
  return replace(vaultDocumentSchema.parse({ ...rest, phoneOnly }));
}

/** Records a document's new expiry reminder, or that it has none (`null`). */
export function withReminder(index: VaultIndex, id: string, reminderId: string | null): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) => {
      if (document.id !== id) return document;
      const { reminderId: _old, ...rest } = document;
      return reminderId ? { ...rest, reminderId } : rest;
    }),
  };
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
    documents: index.documents.map((document) => {
      if (document.id !== id) return document;
      // A rename or move says nothing about the cyber cafe copy: keep what is known.
      const centreReady = cloud.centreReady ?? document.cloud?.centreReady;
      return vaultDocumentSchema.parse({
        ...document,
        cloud: centreReady === undefined ? cloud : { ...cloud, centreReady },
      });
    }),
  };
}

/**
 * Records what the server listed about each cloud copy's cyber cafe side (`centreReady`).
 * Returns the same index when nothing changed, so a sync writes nothing on a quiet run.
 */
export function withCentreReadiness(
  index: VaultIndex,
  readiness: ReadonlyMap<string, boolean>,
): VaultIndex {
  let changed = false;
  const documents = index.documents.map((document) => {
    const cloud = document.cloud;
    if (!cloud) return document;
    const centreReady = readiness.get(cloud.id);
    if (centreReady === undefined || centreReady === cloud.centreReady) return document;
    changed = true;
    return { ...document, cloud: { ...cloud, centreReady } };
  });
  return changed ? { ...index, documents } : index;
}

/** A synced document cyber cafes cannot use yet, because the server's copy failed. */
export function centreCopyFailed(document: Pick<VaultDocument, 'cloud' | 'phoneOnly'>): boolean {
  return document.phoneOnly !== true && document.cloud?.centreReady === false;
}

/**
 * The citizen turns "Keep on this phone only" on or off. Turning it on for a synced document
 * forgets its cloud copy here and queues that copy for deletion. Either way it is now their
 * choice, which a folder move no longer overrides.
 */
export function withPhoneOnly(index: VaultIndex, id: string, phoneOnly: boolean): VaultIndex {
  const target = index.documents.find((document) => document.id === id);
  if (!target) return index;
  // A family member's document stays on the phone; nothing here can share it.
  if (!phoneOnly && target.memberId) return index;
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

/** File name of a document's sealed text (what the phone read off it), in its folder. */
export const TEXT_FILE_NAME = 'text.enc';

/** Additional authenticated data for a document's text, before base64. */
export function textAssociatedData(documentId: string): string {
  return `bharatfill-vault/v${VAULT_INDEX_VERSION}/text/${documentId}`;
}

/**
 * A document's text as ASCII JSON (every other character `\uXXXX`-escaped, like the index), so
 * it round-trips through base64 without a text encoder.
 */
export function serialiseSearchText(text: string): string {
  return JSON.stringify(text).replace(
    /[\u0080-￿]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** A document's text from `serialiseSearchText`; null when the file holds anything else. */
export function parseSearchText(json: string): string | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
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
