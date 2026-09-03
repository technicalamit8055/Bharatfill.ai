import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { MAX_UPLOAD_BYTES, isDoneCommand, parseDropCommand } from '@assistigo/core';
import type { WhatsappMessage, WhatsappWebhookPayload } from '@assistigo/core';
import { logger } from '../api/logger';
import { serverEnv } from '../env';
import { createSupabaseAdminClient } from '../supabase/server';
import type { PlatformChannelSettingsRow } from '../supabase/database.types';

/**
 * WhatsApp Cloud API (Meta) — the transport half of walk-in intake.
 * Master spec §9.1; docs/SECURITY.md §4.
 *
 * This file talks to Meta and normalises what comes back. It holds no database access and makes
 * no authorization decision, so the route handler stays the single place where those two things
 * happen. Three properties it does enforce:
 *
 *   - **Fails closed.** Unconfigured means `isWhatsappConfigured()` is false and the route 404s.
 *     A half-configured channel that accepts webhooks but cannot reply would leave citizens
 *     sending documents into silence.
 *   - **Verifies every delivery.** The verify token authenticates Meta's one-time handshake and
 *     nothing after it. Each POST is checked against `X-Hub-Signature-256` instead.
 *   - **Sends nothing derived from a customer.** Outbound text comes from ./messages.ts, which
 *     takes only the centre's own name and a count.
 *
 * Credentials resolve database-first, environment-fallback (Super Admin "Channels & Bots" panel,
 * §6.1): a Super Admin's saved row in `platform_channel_settings` wins when present and enabled;
 * otherwise this reads the same `WHATSAPP_*` environment variables it always has, so a deployment
 * that has configured nothing in the database is completely unaffected. Every exported function
 * here re-resolves rather than caching across calls — this is deployment-wide config a Super
 * Admin can change at any time, and a webhook delivery is not frequent enough for one extra
 * indexed read to matter.
 */

const GRAPH_VERSION = 'v20.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Media fetches and replies are quick calls; a hung one must not hold a webhook open. */
const REQUEST_TIMEOUT_MS = 15_000;

const CHANNEL_AAD = 'whatsapp:platform_channel_secret';

/**
 * Ceiling on the settings lookup.
 *
 * The fallback to environment variables is only useful if it is *reached*. An unreachable or slow
 * database must not hold a webhook open past Meta's own timeout — at which point Meta retries and
 * re-delivers documents already stored. Losing a database-configured credential for one delivery
 * is recoverable; a duplicated intake is not.
 */
const SETTINGS_TIMEOUT_MS = 2_000;

type ResolvedWhatsappConfig = {
  phoneNumberId: string | null;
  botNumber: string | null;
  verifyToken: string | null;
  accessToken: string | null;
  appSecret: string | null;
};

async function loadDbRow(): Promise<PlatformChannelSettingsRow | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('platform_channel_settings')
      .select('*')
      .eq('channel', 'whatsapp')
      .abortSignal(AbortSignal.timeout(SETTINGS_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw error;
    return (data as PlatformChannelSettingsRow | null) ?? null;
  } catch (thrown) {
    // Database unavailable degrades to "use environment", not a failed webhook.
    logger.warn('document_drop.whatsapp_settings_read_failed', {
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

async function resolveConfig(): Promise<ResolvedWhatsappConfig> {
  const env = serverEnv();
  const row = await loadDbRow();

  if (row?.is_enabled) {
    const config = (row.config ?? {}) as { phoneNumberId?: string; botNumber?: string; verifyToken?: string };
    const accessToken = await decryptSecret(row.access_token_encrypted);
    if (config.phoneNumberId && accessToken) {
      return {
        phoneNumberId: config.phoneNumberId,
        botNumber: config.botNumber ?? env.WHATSAPP_BOT_NUMBER ?? null,
        verifyToken: config.verifyToken ?? env.WHATSAPP_VERIFY_TOKEN ?? null,
        accessToken,
        appSecret: (await decryptSecret(row.app_secret_encrypted)) ?? env.WHATSAPP_APP_SECRET ?? null,
      };
    }
  }

  return {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? null,
    botNumber: env.WHATSAPP_BOT_NUMBER ?? null,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? null,
    appSecret: env.WHATSAPP_APP_SECRET ?? null,
  };
}

export async function isWhatsappConfigured(): Promise<boolean> {
  const config = await resolveConfig();
  return Boolean(config.accessToken && config.phoneNumberId);
}

/** The number behind the QR. Absent means the WhatsApp channel cannot be offered at all. */
export async function whatsappBotNumber(): Promise<string | null> {
  return (await resolveConfig()).botNumber;
}

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

/**
 * Meta's subscription handshake: echo the challenge back if the verify token matches.
 *
 * Returns null when it does not, which the route turns into a 403. Compared in constant time —
 * the token is a shared secret and a timing oracle on it is free to exploit.
 */
export async function verifyWebhookChallenge(url: URL): Promise<string | null> {
  const expected = (await resolveConfig()).verifyToken;
  if (!expected) return null;

  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) return null;
  if (!constantTimeEquals(token, expected)) return null;

  return challenge;
}

/**
 * Confirms a delivery really came from Meta.
 *
 * `X-Hub-Signature-256` is an HMAC of the *raw* body under the app secret, so the caller must
 * hand over the exact bytes it read — re-serialising parsed JSON changes them and the signature
 * would never match.
 *
 * With no app secret configured this returns false, and the route refuses the delivery. That is
 * the fail-closed choice: an unverified webhook is an open door for anyone who learns the URL to
 * inject documents into a real centre's intake queue.
 */
export async function verifyWebhookSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = (await resolveConfig()).appSecret;
  if (!secret || !header) return false;

  const provided = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return constantTimeEquals(provided, expected);
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // timingSafeEqual throws on a length mismatch, and the throw itself would leak the length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Inbound normalisation
// ---------------------------------------------------------------------------

export type InboundKind =
  | { kind: 'start'; code: string }
  | { kind: 'done' }
  | { kind: 'media'; mediaId: string; filename: string; declaredMimeType: string | null; caption: string | null }
  | { kind: 'ignored' };

export type InboundWhatsappMessage = {
  messageId: string;
  senderId: string;
  senderName: string | null;
  intent: InboundKind;
};

/**
 * Flattens a delivery into the messages intake acts on.
 *
 * Meta batches: one POST can carry several entries, each with several changes, each with several
 * messages. Statuses (delivered/read receipts) ride the same channel and are dropped here.
 */
export function parseInboundMessages(
  payload: WhatsappWebhookPayload,
): InboundWhatsappMessage[] {
  const out: InboundWhatsappMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const profileName = change.value.contacts?.[0]?.profile?.name ?? null;

      for (const message of change.value.messages ?? []) {
        out.push({
          messageId: message.id,
          senderId: message.from,
          senderName: profileName,
          intent: classifyMessage(message),
        });
      }
    }
  }

  return out;
}

function classifyMessage(message: WhatsappMessage): InboundKind {
  if (message.type === 'text') {
    const body = message.text?.body ?? '';
    const code = parseDropCommand(body);
    if (code) return { kind: 'start', code };
    if (isDoneCommand(body)) return { kind: 'done' };
    return { kind: 'ignored' };
  }

  if (message.type === 'image' && message.image) {
    return {
      kind: 'media',
      mediaId: message.image.id,
      // WhatsApp images carry no filename; the media id keeps it unique inside the session.
      filename: `whatsapp-${message.image.id}.jpg`,
      declaredMimeType: normalizeMime(message.image.mime_type) ?? 'image/jpeg',
      caption: message.image.caption ?? null,
    };
  }

  if (message.type === 'document' && message.document) {
    return {
      kind: 'media',
      mediaId: message.document.id,
      filename: message.document.filename ?? `whatsapp-${message.document.id}`,
      declaredMimeType: normalizeMime(message.document.mime_type),
      caption: message.document.caption ?? null,
    };
  }

  // Audio, video, stickers, location, contacts, reactions: not documents.
  return { kind: 'ignored' };
}

/** Meta appends codec parameters (`image/jpeg; codecs=…`); the bare type is what we compare. */
function normalizeMime(value: string | undefined): string | null {
  if (!value) return null;
  const bare = value.split(';')[0]?.trim().toLowerCase();
  return bare && bare !== '' ? bare : null;
}

// ---------------------------------------------------------------------------
// Media download
// ---------------------------------------------------------------------------

/**
 * Fetches an inbound media object's bytes.
 *
 * Two hops, both authenticated: the media id resolves to a short-lived URL on Meta's CDN, and
 * that URL still requires the bearer token. The size is checked against the same 15 MB ceiling
 * as an operator upload *before* the body is read, so a hostile `content-length` cannot make
 * this buffer an arbitrary amount of memory.
 */
export async function fetchWhatsappMedia(
  mediaId: string,
): Promise<{ bytes: Uint8Array; mimeType: string | null } | null> {
  const token = (await resolveConfig()).accessToken;
  if (!token) return null;

  try {
    const lookup = await fetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!lookup.ok) {
      logger.warn('document_drop.whatsapp_media_lookup_failed', { status: lookup.status });
      return null;
    }

    const meta = (await lookup.json()) as { url?: unknown; mime_type?: unknown };
    if (typeof meta.url !== 'string') return null;

    const download = await fetch(meta.url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!download.ok) {
      logger.warn('document_drop.whatsapp_media_download_failed', { status: download.status });
      return null;
    }

    const declaredLength = Number(download.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_UPLOAD_BYTES) return null;

    const buffer = await download.arrayBuffer();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return null;

    return {
      bytes: new Uint8Array(buffer),
      mimeType: normalizeMime(
        typeof meta.mime_type === 'string' ? meta.mime_type : undefined,
      ),
    };
  } catch (thrown) {
    logger.warn('document_drop.whatsapp_media_error', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

/**
 * The actual Graph API call, reporting whether it worked.
 *
 * Split out so a non-webhook caller — `apps/web/lib/roaming/dispatch.ts` requesting a consent
 * OTP — can learn that a send failed and tell the operator, rather than the delivery vanishing
 * the way a walk-in-intake reply is allowed to (see `sendWhatsappText` below).
 */
export async function sendWhatsappTextResult(to: string, body: string): Promise<boolean> {
  const config = await resolveConfig();
  if (!config.accessToken || !config.phoneNumberId) return false;

  try {
    const response = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(config.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      // Status only. The body echoes the recipient's number back at us.
      logger.warn('document_drop.whatsapp_send_failed', { status: response.status });
      return false;
    }
    return true;
  } catch (thrown) {
    logger.warn('document_drop.whatsapp_send_error', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return false;
  }
}

/**
 * Sends a text reply.
 *
 * Never throws, and never fails a webhook: Meta retries a non-2xx delivery, and a retry would
 * re-download and re-store media the citizen already sent. A greeting that did not go out is
 * worth strictly less than a duplicated intake.
 *
 * `body` must come from ./messages.ts. Nothing derived from a customer record goes out here.
 */
export async function sendWhatsappText(to: string, body: string): Promise<void> {
  await sendWhatsappTextResult(to, body);
}
