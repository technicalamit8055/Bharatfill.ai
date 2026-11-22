/**
 * The signed-in citizen's account on this phone: who is signed in (for Profile), changing the
 * name or language, Log out and Delete account. docs/VAULT_BRIDGE_DESIGN.md §2, §3.4, D10, D16.
 *
 * Everything here is PII (name, number): returned for display, never logged. Offline builds
 * (no cloud configured) are always signed out, and nothing here makes a call.
 */

import type { Locale } from '../i18n';
import { withCloudDetached, type DocumentSource } from '../vault/vault-index';
import { clearVault, updateVaultIndex } from '../vault/vault-storage';
import { phoneFromAccessToken, revokeCloudSession } from './auth-client';
import type { CitizenAccount } from './citizen-api';
import {
  clearCloudDeviceId,
  clearCloudDocumentKey,
  clearCloudSession,
  loadCloudSession,
} from './cloud-store';
import { cloudConfig } from './config';
import { citizenApi, currentSession } from './session';
import { requestVaultSync } from './sync';

export type CloudProfile =
  | {
      readonly status: 'signed_out';
      /**
       * A session is still on this phone although sign-up was never finished, so Log out is
       * offered — otherwise sign-in would resume that same number with no way to switch.
       */
      readonly sessionOnPhone?: true;
    }
  | {
      readonly status: 'signed_in';
      /** Null while offline before the account was ever read in this app session. */
      readonly account: CitizenAccount | null;
      /** 10 national digits, or null when the token does not carry a usable number. */
      readonly phoneNumber: string | null;
    };

/** The last account read, so Profile still shows a name when the phone goes offline. */
let lastAccount: CitizenAccount | null = null;

/**
 * Who is signed in. A session whose sign-up was never finished (no account yet) counts as
 * signed out, so Profile sends the citizen back through sign-in, which resumes sign-up.
 */
export async function loadCloudProfile(): Promise<CloudProfile> {
  const api = citizenApi();
  if (!api) return { status: 'signed_out' };
  const session = await currentSession();
  if (!session) return { status: 'signed_out' };

  const phoneNumber = phoneFromAccessToken(session.accessToken);
  const result = await api.getAccount();
  if (result.ok) {
    lastAccount = result.value;
    return result.value
      ? { status: 'signed_in', account: result.value, phoneNumber }
      : { status: 'signed_out', sessionOnPhone: true };
  }
  if (result.error.code === 'SIGNED_OUT') return { status: 'signed_out' };
  const cached = lastAccount?.id === session.userId ? lastAccount : null;
  return { status: 'signed_in', account: cached, phoneNumber };
}

export type AccountResult =
  | { readonly ok: true; readonly account: CitizenAccount }
  | { readonly ok: false; readonly messageKey: string };

/** Changes the name and/or language kept with the account. */
export async function updateCloudAccount(patch: {
  displayName?: string;
  preferredLocale?: Locale;
}): Promise<AccountResult> {
  const api = citizenApi();
  if (!api) return { ok: false, messageKey: 'cloud.errors.unavailable' };
  const result = await api.updateAccount(patch);
  if (!result.ok) return { ok: false, messageKey: result.error.messageKey };
  lastAccount = result.value;
  return { ok: true, account: result.value };
}

/** Forgets this phone's cloud credentials for `userId`. The on-phone vault is not touched. */
async function forgetCloudOnPhone(userId: string | null): Promise<void> {
  if (userId) {
    await Promise.allSettled([clearCloudDocumentKey(userId), clearCloudDeviceId(userId)]);
  }
  await clearCloudSession();
  lastAccount = null;
}

/** How long Log out waits for a last sync before giving up on it. */
const FINAL_SYNC_MS = 15_000;

/**
 * Log out of this phone. The session is revoked on the server (best effort) and forgotten here
 * with this account's document key and device id, so signing in again needs the Vault PIN.
 *
 * With `removeDocuments`, a last sync runs first (bounded), so deletions made while offline
 * reach the cloud; then every document is removed from the phone. Without it, the documents
 * stay — still bound to this account, so they never sync into anyone else's vault.
 */
export async function logOut(options: {
  removeDocuments: boolean;
  untitled: (source: DocumentSource) => string;
}): Promise<void> {
  const session = await loadCloudSession();

  if (options.removeDocuments && session) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      requestVaultSync(options.untitled),
      new Promise((resolve) => {
        timer = setTimeout(resolve, FINAL_SYNC_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  const config = cloudConfig();
  if (session && config) await revokeCloudSession(config, session.accessToken);
  await forgetCloudOnPhone(session?.userId ?? null);

  if (options.removeDocuments) await clearVault({ keepPendingCloudDeletes: true });
}

export type DeleteResult =
  { readonly ok: true } | { readonly ok: false; readonly messageKey: string };

/**
 * Deletes the account and its cloud vault (the server removes the rows and bytes within 24
 * hours and the sign-in itself), then signs this phone out. The documents on the phone are
 * removed, or kept as a plain offline vault no longer tied to any account.
 */
export async function deleteCloudAccount(options: {
  removeDocuments: boolean;
}): Promise<DeleteResult> {
  const api = citizenApi();
  if (!api) return { ok: false, messageKey: 'cloud.errors.unavailable' };
  const session = await loadCloudSession();

  const result = await api.deleteAccount();
  if (!result.ok) return { ok: false, messageKey: result.error.messageKey };

  // The account is gone on the server whatever happens next, so this phone signs out regardless.
  try {
    if (options.removeDocuments) await clearVault({ keepPendingCloudDeletes: false });
    else await updateVaultIndex(withCloudDetached);
  } finally {
    await forgetCloudOnPhone(session?.userId ?? null);
  }
  return { ok: true };
}
