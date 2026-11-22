/**
 * The decisions in cloud sign-in, kept pure so they are tested without a device.
 * docs/VAULT_BRIDGE_DESIGN.md §3.1 (sign-up) and §3.3 (new phone).
 */

import { isWeakVaultPin, VAULT_PIN_LENGTH } from '@assistigo/core';

/**
 * Where the citizen goes once the OTP is verified:
 *   - no account yet          → profile (finish sign-up)
 *   - account, key on phone   → done (this phone already holds the vault)
 *   - account, no key here    → restore (a new or reset phone: Vault PIN)
 */
export type AfterSignIn = 'profile' | 'restore' | 'done';

export function nextStepAfterSignIn(hasAccount: boolean, hasKeyOnPhone: boolean): AfterSignIn {
  if (!hasAccount) return 'profile';
  return hasKeyOnPhone ? 'done' : 'restore';
}

export type PinFormError = 'incomplete' | 'weak' | 'mismatch';

/** What stops "Create my vault": `null` when the PIN is good and both entries match. */
export function vaultPinFormError(pin: string, confirm: string): PinFormError | null {
  if (pin.length < VAULT_PIN_LENGTH || confirm.length < VAULT_PIN_LENGTH) return 'incomplete';
  if (isWeakVaultPin(pin)) return 'weak';
  if (pin !== confirm) return 'mismatch';
  return null;
}

/** Bare digits, at most four: what a PIN box keeps of whatever was typed or pasted. */
export function normalisePinInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, VAULT_PIN_LENGTH);
}

/**
 * Translation key for a server error. The server sends catalogue keys (`errors.vault.*`); any
 * key this app does not carry falls back to a generic message rather than showing a raw key.
 */
export function serverMessageKey(messageKey: string, known: (key: string) => boolean): string {
  return known(messageKey) ? messageKey : 'cloud.errors.unavailable';
}
