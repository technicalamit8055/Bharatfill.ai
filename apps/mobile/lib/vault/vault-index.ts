/**
 * The on-device vault's index: which documents exist and how many pages each has.
 *
 * The index is stored encrypted like the pages (see `vault-storage.ts`) and parsed with Zod on
 * every read, so a damaged or tampered file is refused instead of trusted. It holds no citizen
 * data — ids, timestamps, counts and where a document came from — which also keeps it plain
 * ASCII, so it round-trips through base64 without a text encoder.
 *
 * Documents have no vault category yet: choosing or detecting one is the next step.
 */

import { z } from 'zod';

export const VAULT_INDEX_VERSION = 1;

/** Where a document's pages came from. */
export const DOCUMENT_SOURCES = ['scanner', 'gallery'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

/** Image types a page may be stored as, and so shown as. */
export const PAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export type PageMimeType = (typeof PAGE_MIME_TYPES)[number];

/** Upper bound on pages per document, above the scanner's own limit to allow gallery imports. */
export const MAX_PAGES_PER_DOCUMENT = 50;

const vaultDocumentSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  source: z.enum(DOCUMENT_SOURCES),
  pages: z
    .array(z.object({ mimeType: z.enum(PAGE_MIME_TYPES) }))
    .min(1)
    .max(MAX_PAGES_PER_DOCUMENT),
});

const vaultIndexSchema = z.object({
  version: z.literal(VAULT_INDEX_VERSION),
  documents: z.array(vaultDocumentSchema),
});

export type VaultDocument = z.infer<typeof vaultDocumentSchema>;
export type VaultIndex = z.infer<typeof vaultIndexSchema>;

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

export function serialiseVaultIndex(index: VaultIndex): string {
  return JSON.stringify(vaultIndexSchema.parse(index));
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
