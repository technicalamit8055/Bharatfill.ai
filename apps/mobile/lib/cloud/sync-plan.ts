/**
 * What document sync should do next, decided from the on-phone vault index alone.
 * docs/VAULT_BRIDGE_DESIGN.md §3.2. Pure, so it is tested without a device.
 *
 * Rules, in the order the actions run:
 *
 *   1. delete  every queued cloud copy (`cloudDeletes`): documents deleted here, or switched to
 *              "phone only", after they synced. Runs even with cloud backup off — removing a
 *              copy is always allowed.
 *   2. update  a synced document whose title, type or folder changed here since it synced (a
 *              copy synced before folders synced has no folder recorded, so it is sent once).
 *   3. upload  a document with no cloud copy, unless it is phone-only or cloud backup is off.
 *
 * Never: delete a cloud copy just because this phone does not have the document. A restored or
 * second phone starts with an empty local vault; reading absence as deletion would wipe the
 * citizen's cloud vault.
 */

import { DISPLAY_NAME_MAX_LENGTH, type DocumentFolder, type DocumentType } from '@assistigo/core';

import type { DocumentSource, VaultDocument, VaultIndex } from '../vault/vault-index';

export type SyncAction =
  | { readonly kind: 'delete'; readonly cloudId: string }
  | {
      readonly kind: 'update';
      readonly documentId: string;
      readonly cloudId: string;
      readonly title: string;
      readonly documentType: DocumentType;
      readonly category: DocumentFolder;
    }
  | {
      readonly kind: 'upload';
      readonly documentId: string;
      readonly title: string;
      readonly documentType: DocumentType;
      readonly category: DocumentFolder;
    };

/** The server's title limit (120) is under the display-name limit; the vault's own is 80. */
const MAX_CLOUD_TITLE = Math.min(120, DISPLAY_NAME_MAX_LENGTH);

/** The title the cloud copy carries: the citizen's, or what the vault shows for an untitled one. */
export function cloudTitle(
  document: VaultDocument,
  untitled: (source: DocumentSource) => string,
): string {
  const title = (document.title ?? '').trim() || untitled(document.source).trim() || 'Document';
  return title.slice(0, MAX_CLOUD_TITLE);
}

/**
 * The folder the cloud copy carries, so the operator dashboard shows the document where the
 * citizen filed it. A document in no folder is `other`.
 */
export function cloudCategory(document: VaultDocument): DocumentFolder {
  return document.category ?? 'other';
}

/** A document saved without a type is synced as `generic`. */
export function cloudDocumentType(document: VaultDocument): DocumentType {
  return document.documentType ?? 'generic';
}

export function planSync(
  index: VaultIndex,
  options: { cloudEnabled: boolean; untitled: (source: DocumentSource) => string },
): SyncAction[] {
  const actions: SyncAction[] = [];

  for (const cloudId of index.cloudDeletes ?? []) actions.push({ kind: 'delete', cloudId });

  for (const document of index.documents) {
    const title = cloudTitle(document, options.untitled);
    const documentType = cloudDocumentType(document);
    const category = cloudCategory(document);

    if (document.cloud) {
      if (document.phoneOnly) continue; // withPhoneOnly already queued the delete.
      if (
        document.cloud.title !== title ||
        document.cloud.documentType !== documentType ||
        document.cloud.category !== category
      ) {
        actions.push({
          kind: 'update',
          documentId: document.id,
          cloudId: document.cloud.id,
          title,
          documentType,
          category,
        });
      }
      continue;
    }

    if (!options.cloudEnabled || document.phoneOnly) continue;
    actions.push({ kind: 'upload', documentId: document.id, title, documentType, category });
  }

  return actions;
}

/**
 * The single file a document syncs as — what an operator later attaches to a portal: a lone
 * JPEG, PNG or WebP page as itself; anything else (several pages, or HEIC) as one PDF.
 */
export function syncFileKind(document: VaultDocument): 'image' | 'pdf' {
  const [first] = document.pages;
  if (document.pages.length === 1 && first && first.mimeType !== 'image/heic') return 'image';
  return 'pdf';
}
