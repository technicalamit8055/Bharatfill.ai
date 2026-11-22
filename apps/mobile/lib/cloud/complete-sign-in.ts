/**
 * The last step of sign-up or restore: keep the vault's document key on this phone and mark
 * the app as set up. Called with the server's unlock response, never with anything typed.
 */

import { updateAppSettings } from '../settings/settings-storage';
import type { VaultUnlock } from './citizen-api';
import { saveCloudDeviceId, saveCloudDocumentKey } from './cloud-store';
import { clearRegistrationDraft } from './registration-draft';

export async function completeSignIn(unlock: VaultUnlock): Promise<void> {
  await saveCloudDocumentKey(unlock.account.id, unlock.documentKey);
  await saveCloudDeviceId(unlock.account.id, unlock.deviceId);
  clearRegistrationDraft();
  // The language is already the one the citizen picked in the app; not overridden from here.
  await updateAppSettings({ onboardingComplete: true });
}
