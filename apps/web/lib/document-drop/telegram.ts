import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { MAX_UPLOAD_BYTES, isDoneCommand, parseDropCommand } from '@assistigo/core';
import type { TelegramUpdate } from '@assistigo/core';
import { logger } from '../api/logger';
import { serverEnv } from '../env';
import { createSupabaseAdminClient } from '../supabase/server';
import type { PlatformChannelSettingsRow } from '../supabase/database.types';

/**
 * Telegram Bot API — the second intake transport.
 * Master spec §9.1; docs/SECURITY.md §4.
 *
 * Worth having alongside WhatsApp for one concrete reason an operator will notice: a Telegram
 * *document* upload is not recompressed. WhatsApp re-encodes every photo, and a marksheet that
 * has been through that is measurably harder to read — which is one of the pain points this
 * feature exists to remove, not something to reintroduce.
 *
 * Same three properties as the WhatsApp adapter: fails closed when unconfigured, verifies every
 * delivery, and sends nothing derived from a customer record.
 *
 * Credentials resolve database-first, environment-fallback — see the equivalent note atop
 * whatsapp.ts. A Super Admin's saved, enabled row in `platform_channel_settings` wins; otherwise
 * this reads `TELEGRAM_*` exactly as before this feature existed.
 */

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;

const CHANNEL_AAD = 'telegram:platform_channel_secret';

/** Ceiling on the settings lookup — see the equivalent note in whatsapp.ts. */
const SETTINGS_TIMEOUT_MS = 2_000;

type ResolvedTelegramConfig = {
  botUsername: string | null;
  webhookSecret: string | null;
  botToken: string | null;
};

async function loadDbRow(): Promise<PlatformChannelSettingsRow | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('platform_channel_settings')
      .select('*')
      .eq('channel', 'telegram')
      .abortSignal(AbortSignal.timeout(SETTINGS_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw error;
    return (data as PlatformChannelSettingsRow | null) ?? null;
  } catch (thrown) {
    logger.warn('document_drop.telegram_settings_read_failed', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return null;
  }
}

async function decryptSecret(ciphertext: string | null): Promise<string | null> {
  if (!ciphertext) return null;
  try {
    const { decryptField } = await import('@assistigo/core/privacy/crypto');
    return decryptField(ciphertext, CHANNEL_AAD);
  } catch {
    return null;
  }
}

async function resolveConfig(): Promise<ResolvedTelegramConfig> {
  const env = serverEnv();
  const row = await loadDbRow();

  if (row?.is_enabled) {
    const config = (row.config ?? {}) as { botUsername?: string; webhookSecret?: string };
    const botToken = await decryptSecret(row.bot_token_encrypted);
    if (botToken) {
      return {
        botUsername: config.botUsername ?? env.TELEGRAM_BOT_USERNAME ?? null,
        webhookSecret: config.webhookSecret ?? env.TELEGRAM_WEBHOOK_SECRET ?? null,
        botToken,
      };
    }
  }

  return {
    botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? null,
    botToken: env.TELEGRAM_BOT_TOKEN ?? null,
  };
}

export async function isTelegramConfigured(): Promise<boolean> {
  return Boolean((await resolveConfig()).botToken);
}

export async function telegramBotUsername(): Promise<string | null> {
  return (await resolveConfig()).botUsername;
}

/**
 * Confirms the delivery came from Telegram.
 *
 * Telegram has no request signature; the documented mechanism is a secret token chosen at
 * `setWebhook` time and echoed in `X-Telegram-Bot-Api-Secret-Token`. Unset means every delivery
 * is refused, for the same reason as the WhatsApp signature check: without it, anyone who learns
 * the URL can push documents into a real centre's queue.
 */
export async function verifyTelegramSecret(header: string | null): Promise<boolean> {
  const expected = (await resolveConfig()).webhookSecret;
  if (!expected || !header) return false;

  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Inbound normalisation
// ---------------------------------------------------------------------------

export type TelegramIntent =
  | { kind: 'start'; code: string }
  | { kind: 'done' }
  | {
      kind: 'media';
      fileId: string;
      filename: string;
      declaredMimeType: string | null;
      caption: string | null;
      declaredSize: number | null;
    }
  | { kind: 'ignored' };

export type InboundTelegramMessage = {
  chatId: string;
  senderName: string | null;
  intent: TelegramIntent;
};

/**
 * Reduces an update to the one message intake might act on.
 *
 * Edited messages, callback queries, poll answers and channel posts all arrive on this webhook
 * and none is a document, so anything without a `message` is ignored rather than treated as an
 * error — returning a non-2xx to Telegram earns a retry, not a fix.
 */
export function parseTelegramUpdate(update: TelegramUpdate): InboundTelegramMessage | null {
  const message = update.message;
  if (!message) return null;

  const chatId = String(message.chat.id);
  const senderName = message.from?.first_name ?? message.from?.username ?? null;

  const text = message.text ?? null;
  if (text) {
    const code = parseDropCommand(text);
    if (code) return { chatId, senderName, intent: { kind: 'start', code } };
    if (isDoneCommand(text)) return { chatId, senderName, intent: { kind: 'done' } };
  }

  // A photo arrives in several renditions, smallest first. The last is the one worth keeping:
  // a downscaled marksheet is not a readable marksheet.
  const largestPhoto = message.photo?.at(-1);
  if (largestPhoto) {
    return {
      chatId,
      senderName,
      intent: {
        kind: 'media',
        fileId: largestPhoto.file_id,
        filename: `telegram-${largestPhoto.file_id.slice(0, 24)}.jpg`,
        declaredMimeType: 'image/jpeg',
        caption: message.caption ?? null,
        declaredSize: largestPhoto.file_size ?? null,
      },
    };
  }

  if (message.document) {
    return {
      chatId,
      senderName,
      intent: {
        kind: 'media',
        fileId: message.document.file_id,
        filename: message.document.file_name ?? `telegram-${message.document.file_id.slice(0, 24)}`,
        declaredMimeType: normalizeMime(message.document.mime_type),
        caption: message.caption ?? null,
        declaredSize: message.document.file_size ?? null,
      },
    };
  }

  // Text that was neither a code nor DONE, or a message type that carries no document.
  return { chatId, senderName, intent: { kind: 'ignored' } };
}

function normalizeMime(value: string | undefined): string | null {
  if (!value) return null;
  const bare = value.split(';')[0]?.trim().toLowerCase();
  return bare && bare !== '' ? bare : null;
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

/**
 * Fetches a Telegram file's bytes.
 *
 * `getFile` resolves the id to a path, then the file lives under `/file/bot<token>/<path>` — so
 * the token is in the URL rather than a header, which is why nothing here is ever logged.
 * The size ceiling is applied to Telegram's declared size, the `content-length`, and the actual
 * body, in that order: the first two are hints from outside and only the third is a fact.
 */
export async function fetchTelegramFile(
  fileId: string,
  declaredSize: number | null,
): Promise<{ bytes: Uint8Array; filePath: string } | null> {
  const token = (await resolveConfig()).botToken;
  if (!token) return null;

  if (declaredSize !== null && declaredSize > MAX_UPLOAD_BYTES) return null;

  try {
    const lookup = await fetch(
      `${API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );

    if (!lookup.ok) {
      logger.warn('document_drop.telegram_getfile_failed', { status: lookup.status });
      return null;
    }

    const payload = (await lookup.json()) as { ok?: unknown; result?: { file_path?: unknown } };
    const filePath = payload.result?.file_path;
    if (payload.ok !== true || typeof filePath !== 'string') return null;

    const download = await fetch(`${API_BASE}/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!download.ok) {
      logger.warn('document_drop.telegram_download_failed', { status: download.status });
      return null;
    }

    if (Number(download.headers.get('content-length') ?? '0') > MAX_UPLOAD_BYTES) return null;

    const buffer = await download.arrayBuffer();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return null;

    return { bytes: new Uint8Array(buffer), filePath };
  } catch (thrown) {
    logger.warn('document_drop.telegram_file_error', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

/** Sends a text reply. Never throws — see the note on `sendWhatsappText`. */
export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const token = (await resolveConfig()).botToken;
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn('document_drop.telegram_send_failed', { status: response.status });
    }
  } catch (thrown) {
    logger.warn('document_drop.telegram_send_error', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
  }
}
