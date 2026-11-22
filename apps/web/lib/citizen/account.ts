import 'server-only';

import {
  CITIZEN_TERMS_VERSION,
  VAULT_PIN_MAX_FAILURES,
  afterPinFailure,
  conflict,
  isPinDisabled,
  isPinLocked,
  notFound,
  permissionDenied,
  rateLimited,
  type CitizenAccountCreateInput,
  type CitizenVaultPinChangeInput,
  type PinState,
  type citizenAccountUpdateSchema,
  type citizenRestorePinSchema,
} from '@assistigo/core';
import type { z } from 'zod';
import { logger } from '../api/logger';
import type {
  CitizenAccountRow as CitizenAccountDbRow,
  CitizenVaultKeyRow,
} from '../supabase/database.types';
import type { CitizenContext } from './context';
import {
  assertVaultConfigured,
  matchesVaultPin,
  newDocumentKey,
  unwrapDocumentKey,
  vaultPinHmac,
  wrapDocumentKey,
} from './secrets';

/**
 * Citizen account lifecycle: sign-up, read, update, restore on a new phone, delete.
 * docs/VAULT_BRIDGE_DESIGN.md §3; migration 0038.
 *
 * Every function receives a context whose `citizenId` was proved by `resolveCitizen`, and every
 * query it makes is pinned to that id. Log lines carry ids and reason codes only — never the
 * phone, the name, the PIN or the key (docs/SECURITY.md §5).
 */

export const VAULT_BUCKET = 'citizen-vault';

export type CitizenAccountView = {
  id: string;
  displayName: string;
  preferredLocale: 'en' | 'hi';
  cloudEnabled: boolean;
  createdAt: string;
};

type CitizenAccountRow = Pick<
  CitizenAccountDbRow,
  'id' | 'display_name' | 'preferred_locale' | 'cloud_enabled' | 'created_at'
>;

type CitizenKeyRow = Pick<
  CitizenVaultKeyRow,
  | 'citizen_id'
  | 'wrapped_key'
  | 'pin_hmac'
  | 'pin_failures'
  | 'pin_failures_total'
  | 'pin_locked_until'
>;

function toView(row: CitizenAccountRow): CitizenAccountView {
  return {
    id: row.id,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale,
    cloudEnabled: row.cloud_enabled,
    createdAt: row.created_at,
  };
}

/** What the phone receives once it may hold the vault: the account and its document key. */
export type VaultUnlock = { account: CitizenAccountView; documentKey: string; deviceId: string };

async function loadAccountRow(context: CitizenContext): Promise<CitizenAccountRow | null> {
  const { data, error } = await context.admin
    .from('citizen_accounts')
    .select('id, display_name, preferred_locale, cloud_enabled, created_at')
    .eq('id', context.citizenId)
    .maybeSingle();
  if (error) throw error;
  return (data as CitizenAccountRow | null) ?? null;
}

/**
 * The signed-in citizen's account, or null before sign-up has finished.
 *
 * Deliberately does NOT touch `last_active_at`. Anyone holding the number can pass OTP and call
 * this — including a stranger who was given a recycled number. If reading the account counted as
 * activity, that stranger would reset the 60-day inactivity guard on the 7-day hold restore
 * (design §3.3) just by signing in. Activity is recorded only by sign-up, a successful restore,
 * and (step 2) sync calls from a device that already holds the document key.
 */
export async function getCitizenAccount(
  context: CitizenContext,
): Promise<CitizenAccountView | null> {
  const row = await loadAccountRow(context);
  return row ? toView(row) : null;
}

export async function createCitizenAccount(
  context: CitizenContext,
  input: CitizenAccountCreateInput,
): Promise<VaultUnlock> {
  assertVaultConfigured();
  if (await loadAccountRow(context)) throw conflict('errors.vault.account_exists');

  const key = newDocumentKey();
  const { data: deviceId, error } = await context.admin.rpc('create_citizen_account', {
    p_citizen_id: context.citizenId,
    p_display_name: input.displayName,
    p_locale: input.preferredLocale,
    p_cloud_enabled: input.cloudSync,
    p_wrapped_key: wrapDocumentKey(context.citizenId, key),
    p_pin_hmac: vaultPinHmac(context.citizenId, input.vaultPin),
    p_platform: input.device.platform,
    p_device_label: input.device.label ?? null,
    p_terms_version: CITIZEN_TERMS_VERSION,
  });
  if (error) {
    // Two taps of "Create" racing each other: the second loses on the primary key.
    if (error.code === '23505') throw conflict('errors.vault.account_exists');
    throw error;
  }

  const row = await loadAccountRow(context);
  if (!row) throw notFound('errors.vault.account_missing');
  logger.info('citizen.account_created', { citizenId: context.citizenId });
  return { account: toView(row), documentKey: key.toString('base64'), deviceId: String(deviceId) };
}

export async function updateCitizenAccount(
  context: CitizenContext,
  patch: z.output<typeof citizenAccountUpdateSchema>,
): Promise<CitizenAccountView> {
  const current = await loadAccountRow(context);
  if (!current) throw notFound('errors.vault.account_missing');

  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.preferredLocale !== undefined) update.preferred_locale = patch.preferredLocale;
  if (patch.cloudSync !== undefined) update.cloud_enabled = patch.cloudSync;

  const { error } = await context.admin
    .from('citizen_accounts')
    .update(update)
    .eq('id', context.citizenId);
  if (error) throw error;

  // Sync consent is purpose-specific (DPDP): turning it off withdraws, turning it on grants anew.
  if (patch.cloudSync !== undefined && patch.cloudSync !== current.cloud_enabled) {
    if (patch.cloudSync) {
      await context.admin.from('citizen_consent_records').insert({
        citizen_id: context.citizenId,
        subject: 'cloud_sync',
        text_version: CITIZEN_TERMS_VERSION,
      });
    } else {
      const now = new Date().toISOString();
      await context.admin
        .from('citizen_consent_records')
        .update({ status: 'withdrawn', withdrawn_at: now })
        .eq('citizen_id', context.citizenId)
        .eq('subject', 'cloud_sync')
        .eq('status', 'granted');
    }
  }

  const row = await loadAccountRow(context);
  if (!row) throw notFound('errors.vault.account_missing');
  return toView(row);
}

/**
 * Checks `pin` against the stored Vault PIN under the restore limits (design §3.3): five wrong in
 * a row lock it for 24 hours; ten in the account's life switch it off. A wrong PIN is counted and
 * written to the citizen's own history; a right one clears the run of failures. Shared by restore
 * and PIN change, so neither is a way around the other's limits.
 */
async function checkVaultPin(context: CitizenContext, pin: string): Promise<CitizenKeyRow> {
  const { data, error } = await context.admin
    .from('citizen_vault_keys')
    .select('citizen_id, wrapped_key, pin_hmac, pin_failures, pin_failures_total, pin_locked_until')
    .eq('citizen_id', context.citizenId)
    .single();
  if (error) throw error;
  const keys = data as CitizenKeyRow;

  const state: PinState = {
    failures: keys.pin_failures,
    totalFailures: keys.pin_failures_total,
    lockedUntil: keys.pin_locked_until,
  };
  if (isPinDisabled(state)) throw rateLimited('errors.vault.pin_disabled');
  if (isPinLocked(state)) {
    throw rateLimited('errors.vault.pin_locked', { lockedUntil: state.lockedUntil });
  }

  if (!matchesVaultPin(context.citizenId, pin, keys.pin_hmac)) {
    const next = afterPinFailure(state);
    await context.admin
      .from('citizen_vault_keys')
      .update({
        pin_failures: next.failures,
        pin_failures_total: next.totalFailures,
        pin_locked_until: next.lockedUntil,
      })
      .eq('citizen_id', context.citizenId);
    await context.admin
      .from('vault_access_events')
      .insert({ citizen_id: context.citizenId, action: 'restore_refused' });
    logger.warn('citizen.vault_pin_refused', { citizenId: context.citizenId });

    if (isPinDisabled(next)) throw rateLimited('errors.vault.pin_disabled');
    if (next.lockedUntil)
      throw rateLimited('errors.vault.pin_locked', { lockedUntil: next.lockedUntil });
    throw permissionDenied('errors.vault.pin_wrong', {
      attemptsBeforeLock: VAULT_PIN_MAX_FAILURES - next.failures,
    });
  }

  await context.admin
    .from('citizen_vault_keys')
    .update({ pin_failures: 0, pin_locked_until: null })
    .eq('citizen_id', context.citizenId);
  return keys;
}

/**
 * New phone, option 2 of design §3.3: the Vault PIN. Five wrong in a row lock it for 24 hours;
 * ten in the account's life switch it off (old phone or the 7-day hold remain). Each wrong PIN
 * is also an event in the citizen's own history, so they see someone tried.
 */
export async function restoreWithPin(
  context: CitizenContext,
  input: z.output<typeof citizenRestorePinSchema>,
): Promise<VaultUnlock> {
  assertVaultConfigured();
  const account = await loadAccountRow(context);
  if (!account) throw notFound('errors.vault.account_missing');

  const keys = await checkVaultPin(context, input.vaultPin);

  const documentKey = unwrapDocumentKey(context.citizenId, keys.wrapped_key);

  const { data: device, error: deviceError } = await context.admin
    .from('citizen_devices')
    .insert({
      citizen_id: context.citizenId,
      platform: input.device.platform,
      label: input.device.label ?? null,
      key_issued_via: 'pin',
    })
    .select('id')
    .single();
  if (deviceError) throw deviceError;

  await context.admin
    .from('vault_access_events')
    .insert({ citizen_id: context.citizenId, action: 'restored' });
  await context.admin
    .from('citizen_accounts')
    .update({ last_active_at: new Date().toISOString(), restore_hold_until: null })
    .eq('id', context.citizenId);

  logger.info('citizen.restored', { citizenId: context.citizenId, via: 'pin' });
  return {
    account: toView(account),
    documentKey: documentKey.toString('base64'),
    deviceId: (device as { id: string }).id,
  };
}

/**
 * Changes the Vault PIN from a signed-in phone (design D17). The current PIN is checked under the
 * restore limits, so this is never a way to guess it. The new PIN replaces the HMAC; the
 * lifetime failure count stays, so a change does not reset the "switched off for good" cap.
 * The route then signs out every other session, so a phone someone else set up loses the vault.
 */
export async function changeVaultPin(
  context: CitizenContext,
  input: CitizenVaultPinChangeInput,
): Promise<void> {
  assertVaultConfigured();
  if (!(await loadAccountRow(context))) throw notFound('errors.vault.account_missing');

  await checkVaultPin(context, input.currentPin);

  const { error } = await context.admin
    .from('citizen_vault_keys')
    .update({ pin_hmac: vaultPinHmac(context.citizenId, input.newPin) })
    .eq('citizen_id', context.citizenId);
  if (error) throw error;

  await context.admin
    .from('vault_access_events')
    .insert({ citizen_id: context.citizenId, action: 'pin_changed' });
  logger.info('citizen.vault_pin_changed', { citizenId: context.citizenId });
}

/**
 * Deletes the citizen and everything they synced (design §3.4).
 *
 * Order matters: the wrapped key goes first, so even if a later step fails every uploaded byte is
 * already unreadable. Then the bytes, then the auth user — whose deletion cascades to
 * citizen_accounts and every row hanging off it, while access events and consent records keep
 * their history with the citizen link nulled (0038 note 5).
 */
export async function deleteCitizenAccount(context: CitizenContext): Promise<void> {
  const { error: keyError } = await context.admin
    .from('citizen_vault_keys')
    .delete()
    .eq('citizen_id', context.citizenId);
  if (keyError) throw keyError;

  const prefix = `citizen/${context.citizenId}`;
  const storage = context.admin.storage.from(VAULT_BUCKET);
  for (;;) {
    const { data: objects, error } = await storage.list(prefix, { limit: 100 });
    if (error) {
      // Ciphertext with no key left; the retention sweep will catch it. Not worth failing for.
      logger.warn('citizen.delete_storage_list_failed', { citizenId: context.citizenId });
      break;
    }
    if (!objects || objects.length === 0) break;
    const { error: removeError } = await storage.remove(objects.map((o) => `${prefix}/${o.name}`));
    if (removeError) {
      logger.warn('citizen.delete_storage_remove_failed', { citizenId: context.citizenId });
      break;
    }
    if (objects.length < 100) break;
  }

  const { error: userError } = await context.admin.auth.admin.deleteUser(context.citizenId);
  if (userError) throw userError;
  logger.info('citizen.account_deleted', { citizenId: context.citizenId });
}
