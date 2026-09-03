import 'server-only';

import type {
  ChannelSettingsResponse,
  RegisterWebhookResult,
  TelegramChannelConfigInput,
  TestConnectionResult,
  WhatsappChannelConfigInput,
} from '@assistigo/core';
import { publicEnv, serverEnv } from '../../env';
import type { AssistigoSupabaseClient } from '../../supabase/server';
import type { PlatformChannelSettingsRow } from '../../supabase/database.types';

/**
 * Server-side reads and writes for the Super Admin "Channels & Bots" screen (§9.1, §6.1).
 *
 * Shaped after apps/web/lib/ai/vendor-settings.ts: one module is the sanctioned path for every
 * encrypt, decrypt and vendor-API call this feature makes, rather than open-coding
 * `encryptField`/`fetch` at each admin route. Two things this module is NOT:
 *
 *   - It is not the credential resolver the webhooks use at intake time. That stays in
 *     lib/document-drop/whatsapp.ts and telegram.ts, which read the same table directly — this
 *     module only serves the admin screen (load/save/test/register-webhook).
 *   - It never returns a decrypted secret to a caller outside this file except the resolved
 *     token needed to make the one outbound call being asked for (test / setWebhook).
 */

const AAD_SUFFIX = 'platform_channel_secret';
const GRAPH_VERSION = 'v20.0';
const REQUEST_TIMEOUT_MS = 15_000;

type WhatsappConfigJson = {
  phoneNumberId?: string;
  botNumber?: string;
  verifyToken?: string;
};

type TelegramConfigJson = {
  botUsername?: string;
  webhookSecret?: string;
};

function aad(channel: 'whatsapp' | 'telegram'): string {
  return `${channel}:${AAD_SUFFIX}`;
}

async function encryptSecret(channel: 'whatsapp' | 'telegram', plaintext: string): Promise<string> {
  const { encryptField } = await import('@assistigo/core/privacy/crypto');
  return encryptField(plaintext, aad(channel));
}

async function decryptSecret(
  channel: 'whatsapp' | 'telegram',
  ciphertext: string | null,
): Promise<string | null> {
  if (!ciphertext) return null;
  try {
    const { decryptField } = await import('@assistigo/core/privacy/crypto');
    return decryptField(ciphertext, aad(channel));
  } catch {
    // A corrupted ciphertext or a rotated FIELD_ENCRYPTION_KEY degrades to "not configured"
    // rather than throwing — same choice as loadOrgAiSettings, for the same reason: a bad key
    // must surface as "channel not configured", not a 500 on every admin page load or webhook.
    return null;
  }
}

async function loadRow(
  supabase: AssistigoSupabaseClient,
  channel: 'whatsapp' | 'telegram',
): Promise<PlatformChannelSettingsRow | null> {
  const { data, error } = await supabase
    .from('platform_channel_settings')
    .select('*')
    .eq('channel', channel)
    .maybeSingle();
  if (error) throw error;
  return data as PlatformChannelSettingsRow | null;
}

function webhookUrlFor(channel: 'whatsapp' | 'telegram'): string {
  return `${publicEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/${channel}`;
}

// ---------------------------------------------------------------------------
// Load — the admin screen's GET
// ---------------------------------------------------------------------------

export async function loadAllChannelSettings(
  supabase: AssistigoSupabaseClient,
): Promise<ChannelSettingsResponse> {
  const [waRow, tgRow] = await Promise.all([
    loadRow(supabase, 'whatsapp'),
    loadRow(supabase, 'telegram'),
  ]);
  const env = serverEnv();

  const waConfig = (waRow?.config ?? {}) as WhatsappConfigJson;
  const waDbConfigured = Boolean(waRow?.is_enabled && waRow.access_token_encrypted && waConfig.phoneNumberId);
  const waEnvConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

  const tgConfig = (tgRow?.config ?? {}) as TelegramConfigJson;
  const tgDbConfigured = Boolean(tgRow?.is_enabled && tgRow.bot_token_encrypted);
  const tgEnvConfigured = Boolean(env.TELEGRAM_BOT_TOKEN);

  return {
    whatsapp: {
      channel: 'whatsapp',
      isEnabled: waRow?.is_enabled ?? false,
      source: waDbConfigured ? 'database' : waEnvConfigured ? 'environment' : 'unconfigured',
      phoneNumberId: waConfig.phoneNumberId ?? (waDbConfigured ? null : env.WHATSAPP_PHONE_NUMBER_ID ?? null),
      botNumber: waConfig.botNumber ?? (waDbConfigured ? null : env.WHATSAPP_BOT_NUMBER ?? null),
      verifyToken: waConfig.verifyToken ?? null,
      hasAccessToken: Boolean(waRow?.access_token_encrypted) || (!waRow && waEnvConfigured),
      hasAppSecret: Boolean(waRow?.app_secret_encrypted) || (!waRow && Boolean(env.WHATSAPP_APP_SECRET)),
      webhookUrl: webhookUrlFor('whatsapp'),
    },
    telegram: {
      channel: 'telegram',
      isEnabled: tgRow?.is_enabled ?? false,
      source: tgDbConfigured ? 'database' : tgEnvConfigured ? 'environment' : 'unconfigured',
      botUsername: tgConfig.botUsername ?? (tgDbConfigured ? null : env.TELEGRAM_BOT_USERNAME ?? null),
      webhookSecret: tgConfig.webhookSecret ?? null,
      hasBotToken: Boolean(tgRow?.bot_token_encrypted) || (!tgRow && tgEnvConfigured),
      webhookUrl: webhookUrlFor('telegram'),
    },
  };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveWhatsAppChannel(
  supabase: AssistigoSupabaseClient,
  input: WhatsappChannelConfigInput,
  userId: string,
): Promise<void> {
  const existing = await loadRow(supabase, 'whatsapp');
  const existingConfig = (existing?.config ?? {}) as WhatsappConfigJson;

  const nextConfig: WhatsappConfigJson = {
    phoneNumberId: input.phoneNumberId !== undefined ? input.phoneNumberId : existingConfig.phoneNumberId,
    botNumber: input.botNumber !== undefined ? input.botNumber : existingConfig.botNumber,
    verifyToken: input.verifyToken !== undefined ? input.verifyToken : existingConfig.verifyToken,
  };

  const patch: Record<string, unknown> = {
    channel: 'whatsapp',
    is_enabled: input.isEnabled,
    config: nextConfig,
    updated_by: userId,
  };

  if (input.accessToken !== undefined) {
    patch.access_token_encrypted =
      input.accessToken === '' ? null : await encryptSecret('whatsapp', input.accessToken);
  }
  if (input.appSecret !== undefined) {
    patch.app_secret_encrypted =
      input.appSecret === '' ? null : await encryptSecret('whatsapp', input.appSecret);
  }

  const { error } = await supabase
    .from('platform_channel_settings')
    .upsert(patch, { onConflict: 'channel' });
  if (error) throw error;
}

export async function saveTelegramChannel(
  supabase: AssistigoSupabaseClient,
  input: TelegramChannelConfigInput,
  userId: string,
): Promise<void> {
  const existing = await loadRow(supabase, 'telegram');
  const existingConfig = (existing?.config ?? {}) as TelegramConfigJson;

  const nextConfig: TelegramConfigJson = {
    botUsername: input.botUsername !== undefined ? input.botUsername : existingConfig.botUsername,
    webhookSecret: input.webhookSecret !== undefined ? input.webhookSecret : existingConfig.webhookSecret,
  };

  const patch: Record<string, unknown> = {
    channel: 'telegram',
    is_enabled: input.isEnabled,
    config: nextConfig,
    updated_by: userId,
  };

  if (input.botToken !== undefined) {
    patch.bot_token_encrypted = input.botToken === '' ? null : await encryptSecret('telegram', input.botToken);
  }

  const { error } = await supabase
    .from('platform_channel_settings')
    .upsert(patch, { onConflict: 'channel' });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

/** Verifies a WhatsApp access token by reading the phone number resource it grants access to. */
export async function testWhatsAppCredentials(
  phoneNumberId: string,
  accessToken: string,
): Promise<TestConnectionResult> {
  if (!phoneNumberId || !accessToken) {
    return { ok: false, reason: 'errors.channel_credentials_required' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=verified_name`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) return { ok: false, reason: 'errors.channel_test_failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'errors.channel_test_failed' };
  }
}

/** Verifies a Telegram bot token via getMe. */
export async function testTelegramCredentials(botToken: string): Promise<TestConnectionResult> {
  if (!botToken) return { ok: false, reason: 'errors.channel_credentials_required' };

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'errors.channel_test_failed' };
    const payload = (await response.json()) as { ok?: unknown };
    if (payload.ok !== true) return { ok: false, reason: 'errors.channel_test_failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'errors.channel_test_failed' };
  }
}

/**
 * Runs the test-connection flow for whichever channel is configured, resolving the credential
 * from the stored row (decrypted here, never returned) so the admin screen does not have to
 * resend a secret it never received back from GET.
 */
export async function runChannelTest(
  supabase: AssistigoSupabaseClient,
  channel: 'whatsapp' | 'telegram',
): Promise<TestConnectionResult> {
  const row = await loadRow(supabase, channel);

  if (channel === 'whatsapp') {
    const config = (row?.config ?? {}) as WhatsappConfigJson;
    const phoneNumberId = config.phoneNumberId ?? serverEnv().WHATSAPP_PHONE_NUMBER_ID ?? '';
    const accessToken =
      (await decryptSecret('whatsapp', row?.access_token_encrypted ?? null)) ??
      serverEnv().WHATSAPP_ACCESS_TOKEN ??
      '';
    return testWhatsAppCredentials(phoneNumberId, accessToken);
  }

  const botToken =
    (await decryptSecret('telegram', row?.bot_token_encrypted ?? null)) ??
    serverEnv().TELEGRAM_BOT_TOKEN ??
    '';
  return testTelegramCredentials(botToken);
}

// ---------------------------------------------------------------------------
// Register Telegram webhook
// ---------------------------------------------------------------------------

/** Calls Telegram's setWebhook directly, so an operator never has to run curl by hand. */
export async function executeSetTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken: string,
): Promise<RegisterWebhookResult> {
  if (!botToken || !secretToken) {
    return { ok: false, reason: 'errors.channel_credentials_required' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message'],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, reason: 'errors.channel_webhook_failed' };
    const payload = (await response.json()) as { ok?: unknown; description?: unknown };
    if (payload.ok !== true) return { ok: false, reason: 'errors.channel_webhook_failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'errors.channel_webhook_failed' };
  }
}

/** Resolves the stored (or draft) bot token and webhook secret, then registers with Telegram. */
export async function registerTelegramWebhook(
  supabase: AssistigoSupabaseClient,
): Promise<RegisterWebhookResult> {
  const row = await loadRow(supabase, 'telegram');
  const config = (row?.config ?? {}) as TelegramConfigJson;

  const botToken =
    (await decryptSecret('telegram', row?.bot_token_encrypted ?? null)) ??
    serverEnv().TELEGRAM_BOT_TOKEN ??
    '';
  const secretToken = config.webhookSecret ?? serverEnv().TELEGRAM_WEBHOOK_SECRET ?? '';

  if (!botToken || !secretToken) {
    return { ok: false, reason: 'errors.channel_webhook_secret_missing' };
  }

  return executeSetTelegramWebhook(botToken, webhookUrlFor('telegram'), secretToken);
}
