import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VAULT_FILE_OVERHEAD_BYTES, vaultFileAad } from '@assistigo/core';
import { VaultFileError, openVaultFile, sealVaultFile } from './vault-file';

const CITIZEN = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const OTHER_DOCUMENT = '44444444-4444-4444-8444-444444444444';
const KEY = randomBytes(32);
const PDF = Buffer.from('%PDF-1.4\n% DEMO ONLY\n');

/**
 * Builds the bytes exactly as expo-crypto does on the phone, independently of sealVaultFile:
 * IV ‖ ciphertext ‖ tag, 12-byte IV, 16-byte tag, the AAD string as ASCII. If the server ever
 * drifted from the phone's layout, this is the test that fails.
 */
function phoneStyleSeal(plaintext: Buffer, aad: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'ascii'));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]);
}

describe('vault file format v1', () => {
  it('opens a file sealed in the phone’s layout', () => {
    const sealed = phoneStyleSeal(PDF, vaultFileAad(CITIZEN, DOCUMENT), KEY);
    expect(sealed.length).toBe(PDF.length + VAULT_FILE_OVERHEAD_BYTES);
    expect(openVaultFile(CITIZEN, DOCUMENT, sealed, KEY).equals(PDF)).toBe(true);
  });

  it('round-trips through sealVaultFile', () => {
    const sealed = sealVaultFile(CITIZEN, DOCUMENT, PDF, KEY);
    expect(openVaultFile(CITIZEN, DOCUMENT, sealed, KEY).equals(PDF)).toBe(true);
  });

  it('refuses a file moved to another document row', () => {
    const sealed = sealVaultFile(CITIZEN, DOCUMENT, PDF, KEY);
    expect(() => openVaultFile(CITIZEN, OTHER_DOCUMENT, sealed, KEY)).toThrow(VaultFileError);
  });

  it('refuses the wrong key, a flipped bit and a truncated file', () => {
    const sealed = sealVaultFile(CITIZEN, DOCUMENT, PDF, KEY);
    expect(() => openVaultFile(CITIZEN, DOCUMENT, sealed, randomBytes(32))).toThrow(VaultFileError);

    const flipped = Buffer.from(sealed);
    flipped[20] = (flipped[20] ?? 0) ^ 1;
    expect(() => openVaultFile(CITIZEN, DOCUMENT, flipped, KEY)).toThrow(VaultFileError);

    expect(() => openVaultFile(CITIZEN, DOCUMENT, sealed.subarray(0, 20), KEY)).toThrow(
      VaultFileError,
    );
  });
});
