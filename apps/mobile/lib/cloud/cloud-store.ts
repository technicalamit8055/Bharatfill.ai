/**
 * Where the citizen's cloud session and cloud document key live on the phone.
 * docs/VAULT_BRIDGE_DESIGN.md §3.2.
 *
 * Platform keystore only (`expo-secure-store`, this-device-only, unlocked-only), each value in its
 * own entry so none comes near SecureStore's ~2 KB comfort limit. Kept apart from the local vault
 * key (`bharatfill.vault.key.v1`): signing out of the cloud never touches the on-phone vault.
 *
 * The document key is stored per account id, so a phone that signs in as a different number
 * never reuses — or overwrites — another account's key.
 */

import * as SecureStore from 'expo-secure-store';

import type { CloudSession } from './auth-client';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const ACCESS = 'bharatfill.cloud.access.v1';
const REFRESH = 'bharatfill.cloud.refresh.v1';
const META = 'bharatfill.cloud.session.v1';
const keyEntry = (userId: string) => `bharatfill.cloud.key.v1.${userId}`;

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveCloudSession(session: CloudSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS, session.accessToken, OPTIONS);
  await SecureStore.setItemAsync(REFRESH, session.refreshToken, OPTIONS);
  await SecureStore.setItemAsync(
    META,
    JSON.stringify({ userId: session.userId, expiresAt: session.expiresAt }),
    OPTIONS,
  );
}

export async function loadCloudSession(): Promise<CloudSession | null> {
  try {
    const [accessToken, refreshToken, meta] = await Promise.all([
      SecureStore.getItemAsync(ACCESS, OPTIONS),
      SecureStore.getItemAsync(REFRESH, OPTIONS),
      SecureStore.getItemAsync(META, OPTIONS),
    ]);
    if (!accessToken || !refreshToken || !meta) return null;
    const parsed: unknown = JSON.parse(meta);
    if (!parsed || typeof parsed !== 'object') return null;
    const { userId, expiresAt } = parsed as { userId?: unknown; expiresAt?: unknown };
    if (typeof userId !== 'string' || !UUID.test(userId) || typeof expiresAt !== 'number') {
      return null;
    }
    return { userId, accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export async function clearCloudSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS, OPTIONS),
    SecureStore.deleteItemAsync(REFRESH, OPTIONS),
    SecureStore.deleteItemAsync(META, OPTIONS),
  ]);
}

export async function saveCloudDocumentKey(userId: string, keyBase64: string): Promise<void> {
  if (!UUID.test(userId)) throw new Error('Invalid account id.');
  await SecureStore.setItemAsync(keyEntry(userId), keyBase64, OPTIONS);
}

export async function hasCloudDocumentKey(userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  try {
    return (await SecureStore.getItemAsync(keyEntry(userId), OPTIONS)) !== null;
  } catch {
    return false;
  }
}

export async function clearCloudDocumentKey(userId: string): Promise<void> {
  if (!UUID.test(userId)) return;
  await SecureStore.deleteItemAsync(keyEntry(userId), OPTIONS);
}

const deviceEntry = (userId: string) => `bharatfill.cloud.device.v1.${userId}`;

/** The `citizen_devices` id the server gave this phone with its key; sent on sync calls. */
export async function saveCloudDeviceId(userId: string, deviceId: string): Promise<void> {
  if (!UUID.test(userId) || !UUID.test(deviceId)) throw new Error('Invalid id.');
  await SecureStore.setItemAsync(deviceEntry(userId), deviceId, OPTIONS);
}

export async function loadCloudDeviceId(userId: string): Promise<string | null> {
  if (!UUID.test(userId)) return null;
  try {
    const value = await SecureStore.getItemAsync(deviceEntry(userId), OPTIONS);
    return value && UUID.test(value) ? value : null;
  } catch {
    return null;
  }
}

export async function clearCloudDeviceId(userId: string): Promise<void> {
  if (!UUID.test(userId)) return;
  await SecureStore.deleteItemAsync(deviceEntry(userId), OPTIONS);
}

/** The vault's document key (base64), or null when this phone does not hold it. */
export async function loadCloudDocumentKey(userId: string): Promise<string | null> {
  if (!UUID.test(userId)) return null;
  try {
    return await SecureStore.getItemAsync(keyEntry(userId), OPTIONS);
  } catch {
    return null;
  }
}
