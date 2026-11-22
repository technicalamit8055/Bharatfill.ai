/**
 * App lock on the phone: the config and wrong-PIN count in the platform keystore
 * (`expo-secure-store`, this device only, readable only while the phone is unlocked), and the
 * system's fingerprint / face / screen-lock prompt (`expo-local-authentication`).
 * Rules are `app-lock.ts`.
 *
 * Nothing here logs. The PIN never leaves this module: it is hashed with a random salt and only
 * the hash is kept.
 */

import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import {
  type AppLockConfig,
  FREE_PIN_ATTEMPTS,
  NO_ATTEMPTS,
  parseAppLockConfig,
  parsePinAttempts,
  type PinAttempts,
  pinDigestInput,
  remainingWait,
  withFailedPin,
} from './app-lock';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const CONFIG_ENTRY = 'bharatfill.app-lock.config.v1';
const ATTEMPTS_ENTRY = 'bharatfill.app-lock.attempts.v1';

export async function loadAppLock(): Promise<AppLockConfig | null> {
  try {
    return parseAppLockConfig(await SecureStore.getItemAsync(CONFIG_ENTRY, OPTIONS));
  } catch {
    return null;
  }
}

async function writeConfig(config: AppLockConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_ENTRY, JSON.stringify(config), OPTIONS);
  await SecureStore.deleteItemAsync(ATTEMPTS_ENTRY, OPTIONS);
}

export function enableDeviceLock(): Promise<void> {
  return writeConfig({ version: 1, method: 'device' });
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digestPin(salt: string, pin: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, pinDigestInput(salt, pin));
}

export async function enablePinLock(pin: string): Promise<void> {
  const salt = hex(getRandomBytes(16));
  await writeConfig({ version: 1, method: 'pin', salt, hash: await digestPin(salt, pin) });
}

export async function disableAppLock(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(CONFIG_ENTRY, OPTIONS),
    SecureStore.deleteItemAsync(ATTEMPTS_ENTRY, OPTIONS),
  ]);
}

async function loadAttempts(): Promise<PinAttempts> {
  try {
    return parsePinAttempts(await SecureStore.getItemAsync(ATTEMPTS_ENTRY, OPTIONS));
  } catch {
    return parsePinAttempts('unreadable');
  }
}

export type PinCheck =
  | { readonly result: 'ok' }
  /** `triesLeft`: wrong PINs still allowed before a wait (0 once waits have begun). */
  | { readonly result: 'wrong'; readonly waitMs: number; readonly triesLeft: number }
  /** Still waiting from earlier wrong PINs; this one was not checked. */
  | { readonly result: 'wait'; readonly waitMs: number };

/** Milliseconds before a PIN may be tried; 0 when it may be tried now. */
export async function pinWaitRemaining(now: number = Date.now()): Promise<number> {
  return remainingWait(await loadAttempts(), now);
}

export async function checkAppPin(
  config: Extract<AppLockConfig, { method: 'pin' }>,
  pin: string,
  now: number = Date.now(),
): Promise<PinCheck> {
  const attempts = await loadAttempts();
  const waiting = remainingWait(attempts, now);
  if (waiting > 0) return { result: 'wait', waitMs: waiting };

  if ((await digestPin(config.salt, pin)) === config.hash) {
    await SecureStore.setItemAsync(ATTEMPTS_ENTRY, JSON.stringify(NO_ATTEMPTS), OPTIONS);
    return { result: 'ok' };
  }
  const next = withFailedPin(attempts, now);
  await SecureStore.setItemAsync(ATTEMPTS_ENTRY, JSON.stringify(next), OPTIONS);
  return {
    result: 'wrong',
    waitMs: remainingWait(next, now),
    triesLeft: Math.max(0, FREE_PIN_ATTEMPTS - next.failures),
  };
}

// ---- The phone's own lock ---------------------------------------------------------------------

/** True when the phone has a screen lock (PIN, pattern, password) or enrolled biometrics. */
export async function deviceAuthAvailable(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export type DevicePromptCopy = { readonly promptMessage: string; readonly cancelLabel: string };

/**
 * Shows the system prompt: fingerprint or face where enrolled, falling back to the phone's
 * screen lock. True only when the citizen passed it.
 */
export async function authenticateWithDevice(copy: DevicePromptCopy): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: copy.promptMessage,
      cancelLabel: copy.cancelLabel,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
