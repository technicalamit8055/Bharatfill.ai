/**
 * Runs the phone's text reader (`lib/vision/on-device-vision.ts`) over documents:
 *
 * - `readScannedPages` — the pages on the Save Document screen, still plaintext files in the
 *   app's cache, so the screen can suggest the type and name and show what it read.
 * - `readUnreadDocuments` — documents already in the vault that have not been read (saved
 *   before reading existed, imported, or added by a centre). Each page is decrypted into memory
 *   only and handed to the reader as base64; nothing is written in the clear. One document at a
 *   time, in the background, and it stops quietly when the phone cannot read text.
 *
 * Text and details stay on the phone (`vault-storage.ts`); nothing here logs or uploads.
 */

import type { DocumentType } from '@assistigo/core';

import type { VaultDocument } from '../vault/vault-index';
import { documentsToRead } from '../vault/vault-index';
import { readPageDataUri, readVaultIndex, saveDocumentReading } from '../vault/vault-storage';
import {
  isOnDeviceVisionAvailable,
  OnDeviceVisionUnavailableError,
  type PageText,
  readPageText,
} from '../vision/on-device-vision';
import {
  type DocumentReading,
  EMPTY_READING,
  MAX_READ_PAGES,
  readDocument,
  READING_VERSION,
} from './document-reading';

/** Types with no text worth reading: the picture is the document. */
const PICTURE_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>(['photo', 'signature']);

export function isPictureType(type: DocumentType | null | undefined): boolean {
  return type != null && PICTURE_TYPES.has(type);
}

/** Reads the scan's pages (local files). Null when the phone cannot read text. */
export async function readScannedPages(
  uris: readonly string[],
  chosenType: DocumentType | null,
): Promise<DocumentReading | null> {
  if (isPictureType(chosenType)) return EMPTY_READING;
  if (!isOnDeviceVisionAvailable()) return null;
  try {
    const pages: PageText[] = [];
    for (const uri of uris.slice(0, MAX_READ_PAGES)) pages.push(await readPageText({ uri }));
    return readDocument(pages, chosenType);
  } catch (error) {
    if (error instanceof OnDeviceVisionUnavailableError) return null;
    throw error;
  }
}

const DATA_URI_PREFIX = /^data:[^;,]+;base64,/;

async function readStoredDocument(document: VaultDocument): Promise<DocumentReading> {
  if (isPictureType(document.documentType)) return EMPTY_READING;
  const pages: PageText[] = [];
  for (let index = 0; index < Math.min(document.pages.length, MAX_READ_PAGES); index += 1) {
    const base64 = (await readPageDataUri(document, index)).replace(DATA_URI_PREFIX, '');
    pages.push(await readPageText({ base64 }));
  }
  // The citizen already chose the type: fields follow it, and nothing is re-filed.
  return readDocument(pages, document.documentType ?? null);
}

let running: Promise<number> | null = null;

/**
 * Reads every vault document not read yet, one at a time. Resolves with how many were read.
 * Only one run at a time: a call while one is running joins it. A document that fails to read
 * is skipped this run and tried again next time.
 */
export function readUnreadDocuments(): Promise<number> {
  running ??= (async () => {
    if (!isOnDeviceVisionAvailable()) return 0;
    let read = 0;
    const pending = documentsToRead(await readVaultIndex(), READING_VERSION);
    for (const document of pending) {
      let reading: DocumentReading;
      try {
        reading = await readStoredDocument(document);
      } catch (error) {
        // The reader is not ready on this phone (models still installing): stop until next time.
        if (error instanceof OnDeviceVisionUnavailableError) break;
        continue;
      }
      await saveDocumentReading(
        document.id,
        { version: READING_VERSION, fields: [...reading.fields] },
        reading.searchText,
      );
      read += 1;
    }
    return read;
  })().finally(() => {
    running = null;
  });
  return running;
}
