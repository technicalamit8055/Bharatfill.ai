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

import { DOCUMENT_TYPES } from '@assistigo/core';
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
});

const vaultIndexSchema = z.object({
  version: z.literal(VAULT_INDEX_VERSION),
  documents: z.array(vaultDocumentSchema),
});

export type VaultDocument = z.infer<typeof vaultDocumentSchema>;
export type VaultIndex = z.infer<typeof vaultIndexSchema>;

/** What the citizen chose on the Save Document screen. */
export type DocumentDetails = Pick<
  VaultDocument,
  'title' | 'documentType' | 'category' | 'tags' | 'expiresOn' | 'reminderId'
>;

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
 */
export function withDetails(index: VaultIndex, id: string, change: DetailsChange): VaultIndex {
  return {
    ...index,
    documents: index.documents.map((document) => {
      if (document.id !== id) return document;
      const { category: previous, ...rest } = document;
      const category = change.category === undefined ? previous : change.category;
      return vaultDocumentSchema.parse({
        ...rest,
        ...(category ? { category } : {}),
        ...(change.title !== undefined ? { title: change.title } : {}),
        ...(change.tags !== undefined ? { tags: [...change.tags] } : {}),
      });
    }),
  };
}

export function withoutDocument(index: VaultIndex, id: string): VaultIndex {
  return { ...index, documents: index.documents.filter((document) => document.id !== id) };
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
