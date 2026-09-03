import { NextResponse } from 'next/server';
import { telegramUpdateSchema } from '@assistigo/core';
import { handler, ok } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { handleDone, handleMedia, handleStart } from '@/lib/document-drop/intake';
import {
  fetchTelegramFile,
  isTelegramConfigured,
  parseTelegramUpdate,
  sendTelegramText,
  verifyTelegramSecret,
} from '@/lib/document-drop/telegram';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * Telegram Bot API webhook — walk-in document intake (§9.1).
 *
 * Same shape as the WhatsApp webhook: no user session, service-role client, gated entirely by a
 * shared secret, 404 when unconfigured, and always 200 once authenticated so Telegram does not
 * retry a delivery whose files are already stored.
 *
 * Register it with:
 *   curl "https://api.telegram.org/bot<token>/setWebhook" \
 *     -d url=https://<host>/api/webhooks/telegram \
 *     -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 */
export const POST = handler('api.webhooks.telegram', async (request) => {
  if (!(await isTelegramConfigured())) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!(await verifyTelegramSecret(request.headers.get('x-telegram-bot-api-secret-token')))) {
    logger.warn('document_drop.telegram_secret_rejected', {});
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return ok({ received: true, handled: 0 });
  }

  const parsed = telegramUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn('document_drop.telegram_payload_unrecognised', {});
    return ok({ received: true, handled: 0 });
  }

  const message = parseTelegramUpdate(parsed.data);
  // An edited message, a callback query, a channel post: nothing to do, and not an error.
  if (!message) return ok({ received: true, handled: 0 });

  const deps = { admin: createSupabaseAdminClient(), channel: 'telegram' as const };

  try {
    const { intent } = message;
    let reply: { text: string } | null = null;

    if (intent.kind === 'start') {
      reply = await handleStart(deps, {
        code: intent.code,
        senderId: message.chatId,
        senderName: message.senderName,
      });
    } else if (intent.kind === 'done') {
      reply = await handleDone(deps, message.chatId);
    } else if (intent.kind === 'media') {
      reply = await handleMedia(deps, {
        senderId: message.chatId,
        senderName: message.senderName,
        media: {
          filename: intent.filename,
          declaredMimeType: intent.declaredMimeType,
          caption: intent.caption,
          download: async () =>
            (await fetchTelegramFile(intent.fileId, intent.declaredSize))?.bytes ?? null,
        },
      });
    }

    if (reply) await sendTelegramText(message.chatId, reply.text);
    return ok({ received: true, handled: reply ? 1 : 0 });
  } catch (thrown) {
    // Swallowed for the same reason as the WhatsApp route: a 500 here earns a retry that would
    // re-store the citizen's documents.
    logger.error('document_drop.telegram_message_failed', {
      intent: message.intent.kind,
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return ok({ received: true, handled: 0 });
  }
});
