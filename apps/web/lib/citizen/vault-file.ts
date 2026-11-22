import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  VAULT_FILE_IV_BYTES,
  VAULT_FILE_OVERHEAD_BYTES,
  VAULT_FILE_TAG_BYTES,
  vaultFileAad,
} from '@assistigo/core';

/**
 * Synced file format v1 (`@assistigo/core` citizen-vault; docs/VAULT_BRIDGE_DESIGN.md §3.2):
 * AES-256-GCM, IV ‖ ciphertext ‖ tag, AAD `<citizen_id>:<document_id>:vault_document` — the
 * layout expo-crypto's `AESSealedData.combined()` produces on the phone.
 *
 * The server never encrypts a citizen's document in production (the phone does); `sealVaultFile`
 * exists so tests can prove the server opens exactly what the phone's format describes.
 * `openVaultFile` is what the operator file route uses (step 4) after checking the grant.
 */

export class VaultFileError extends Error {
  constructor() {
    // One message for every cause: "wrong key", "moved to another row" and "tampered" must not
    // be distinguishable from outside.
    super('The vault file could not be opened.');
    this.name = 'VaultFileError';
  }
}

export function sealVaultFile(
  citizenId: string,
  documentId: string,
  plaintext: Buffer,
  documentKey: Buffer,
): Buffer {
  const iv = randomBytes(VAULT_FILE_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', documentKey, iv, {
    authTagLength: VAULT_FILE_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(vaultFileAad(citizenId, documentId), 'ascii'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

export function openVaultFile(
  citizenId: string,
  documentId: string,
  sealed: Buffer,
  documentKey: Buffer,
): Buffer {
  if (sealed.length <= VAULT_FILE_OVERHEAD_BYTES || documentKey.length !== 32) {
    throw new VaultFileError();
  }
  try {
    const iv = sealed.subarray(0, VAULT_FILE_IV_BYTES);
    const tag = sealed.subarray(sealed.length - VAULT_FILE_TAG_BYTES);
    const ciphertext = sealed.subarray(VAULT_FILE_IV_BYTES, sealed.length - VAULT_FILE_TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', documentKey, iv, {
      authTagLength: VAULT_FILE_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(vaultFileAad(citizenId, documentId), 'ascii'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new VaultFileError();
  }
}
