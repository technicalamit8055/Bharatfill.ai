/**
 * The signed-in cloud session, kept fresh, and the citizen API bound to it.
 *
 * One refresh at a time: concurrent callers share the in-flight refresh, because Supabase
 * rotates refresh tokens and a second refresh with the old token would sign the citizen out.
 */

import { needsRefresh, refreshCloudSession, type CloudSession } from './auth-client';
import { type CitizenApi, createCitizenApi } from './citizen-api';
import {
  clearCloudSession,
  loadCloudDeviceId,
  loadCloudSession,
  saveCloudSession,
} from './cloud-store';
import { cloudConfig } from './config';

let inFlight: Promise<CloudSession | null> | null = null;

async function refreshOnce(): Promise<CloudSession | null> {
  const config = cloudConfig();
  const current = await loadCloudSession();
  if (!config || !current) return null;
  const result = await refreshCloudSession(config, current.refreshToken);
  if (result.ok) {
    await saveCloudSession(result.value);
    return result.value;
  }
  // Only a definite "no" signs the citizen out; a network blip keeps the session for later.
  if (result.reason === 'signed_out') await clearCloudSession();
  return null;
}

export function refreshSession(): Promise<CloudSession | null> {
  inFlight ??= refreshOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** The current session, refreshed first when it is about to expire. */
export async function currentSession(): Promise<CloudSession | null> {
  const session = await loadCloudSession();
  if (!session) return null;
  return needsRefresh(session, Date.now()) ? refreshSession() : session;
}

let api: CitizenApi | null = null;

/** The citizen API for this build, or null when the build has no cloud configured. */
export function citizenApi(): CitizenApi | null {
  const config = cloudConfig();
  if (!config) return null;
  api ??= createCitizenApi({
    apiUrl: config.apiUrl,
    accessToken: async () => (await currentSession())?.accessToken ?? null,
    refresh: async () => (await refreshSession())?.accessToken ?? null,
  });
  return api;
}

/**
 * This phone's device id for the signed-in account, or null when the phone does not hold the
 * vault (signed out, or signed in but not yet unlocked with the Vault PIN).
 */
export async function currentDeviceId(): Promise<string | null> {
  const session = await loadCloudSession();
  return session ? loadCloudDeviceId(session.userId) : null;
}
