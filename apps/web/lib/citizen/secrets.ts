import 'server-only';

import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { SHARE_CODE_LENGTH, providerUnavailable } from '@assistigo/core';
import { decryptField, encryptField, safeEqual } from '@assistigo/core/privacy/crypto';
import { serverEnv } from '../env';

/**
 * Citizen Vault secrets (migration 0038, docs/VAULT_BRIDGE_DESIGN.md §5).
 *
 * One deployment secret, `VAULT_MASTER_KEY`, and everything else derived from it:
 *
 *   document key   random 32 bytes per citizen, wrapped with the master key (core `v1.` AES-GCM,
 *                  AAD `<citizen_id>:vault_key`) and handed to the citizen's phone, which encrypts
 *                  every page before upload. Deleting the wrapped row destroys the vault.
 *   PIN HMAC       HMAC-SHA256 under a key derived from the master key, over `<citizen_id>:<pin>`
 *                  — a leaked table alone cannot be brute-forced, and equal PINs never match.
 *   mobile HMAC    the same, over the 10-digit number, so lookup limits can count per number
 *                  without storing numbers of people who never signed up.
 *   share code     six random digits; only a salted HMAC is stored (as roaming OTPs, 0024).
 *
 * Every function takes an optional explicit master key for tests; production reads the env.
 * Unset or malformed key → `errors.vault.unavailable`: the feature fails closed.
 */

const KEY_BYTES = 32;

function masterKeyBase64(explicit?: string): string {
  const raw = explicit ?? serverEnv().VAULT_MASTER_KEY;
  if (!raw) throw providerUnavailable('errors.vault.unavailable');
  if (Buffer.from(raw, 'base64').length !== KEY_BYTES) {
    throw providerUnavailable('errors.vault.unavailable');
  }
  return raw;
}

function derivedKey(label: string, explicit?: string): Buffer {
  return createHmac('sha256', Buffer.from(masterKeyBase64(explicit), 'base64'))
    .update(label, 'utf8')
    .digest();
}

const PIN_LABEL = 'assistigo.vault.pin.v1';
const MOBILE_LABEL = 'assistigo.vault.mobile.v1';

const keyAad = (citizenId: string) => `${citizenId}:vault_key`;

/** Throws `errors.vault.unavailable` unless a usable master key is configured. */
export function assertVaultConfigured(explicit?: string): void {
  masterKeyBase64(explicit);
}

export function newDocumentKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrapDocumentKey(citizenId: string, key: Buffer, explicit?: string): string {
  return encryptField(key.toString('base64'), keyAad(citizenId), masterKeyBase64(explicit));
}

/** Throws core `DecryptionError` if the row was moved to another citizen or tampered with. */
export function unwrapDocumentKey(citizenId: string, wrapped: string, explicit?: string): Buffer {
  return Buffer.from(decryptField(wrapped, keyAad(citizenId), masterKeyBase64(explicit)), 'base64');
}

export function vaultPinHmac(citizenId: string, pin: string, explicit?: string): string {
  return createHmac('sha256', derivedKey(PIN_LABEL, explicit))
    .update(`${citizenId}:${pin}`, 'utf8')
    .digest('hex');
}

export function matchesVaultPin(
  citizenId: string,
  pin: string,
  expected: string,
  explicit?: string,
): boolean {
  return safeEqual(vaultPinHmac(citizenId, pin, explicit), expected);
}

/** `mobile` is the normalised 10-digit number. */
export function mobileHmac(mobile: string, explicit?: string): string {
  return createHmac('sha256', derivedKey(MOBILE_LABEL, explicit))
    .update(mobile, 'utf8')
    .digest('hex');
}

export function generateShareCode(): string {
  return String(randomInt(0, 10 ** SHARE_CODE_LENGTH)).padStart(SHARE_CODE_LENGTH, '0');
}

export function newCodeSalt(): string {
  return randomBytes(24).toString('hex');
}

export function shareCodeHmac(code: string, salt: string): string {
  return createHmac('sha256', salt).update(code, 'utf8').digest('hex');
}

export function matchesShareCode(code: string, salt: string, expected: string): boolean {
  return safeEqual(shareCodeHmac(code, salt), expected);
}
