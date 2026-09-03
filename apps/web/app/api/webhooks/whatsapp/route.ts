import { NextResponse } from 'next/server';
import { handler, ok } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { whatsappWebhookSchema } from '@assistigo/core';
import { handleDone, handleMedia, handleStart } from '@/lib/document-drop/intake';
import {
  fetchWhatsappMedia,
  isWhatsappConfigured,
  parseInboundMessages,
  sendWhatsappText,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from '@/lib/document-drop/whatsapp';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * WhatsApp Cloud API webhook — walk-in document intake (§9.1).
 *
 * No user session: the caller is Meta. So this route runs with the service-role client and is
 * gated entirely by the signature check, the same fail-closed shape as `/api/billing/webhook`
 * and `/api/jobs/run`. Unconfigured means 404 rather than a half-working endpoint.
 *
 * It always answers 200 once the delivery is authenticated. Meta retries a non-2xx, and a retry
 * re-delivers messages already processed — which would mean downloading and storing the same
 * citizen's documents twice. A message that fails is logged and dropped; the citizen is told
 * plainly and can send it again, which is a far better failure than a duplicate.
 */

/** Meta's subscription handshake. */
export const GET = handler('api.webhooks.whatsapp.verify', async (request) => {
  if (!(await isWhatsappConfigured())) {
    return new NextResponse('Not found', { status: 404 });
  }

  const challenge = await verifyWebhookChallenge(new URL(request.url));
  if (challenge === null) {
    logger.warn('document_drop.whatsapp_verify_rejected', {});
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Meta expects the bare challenge string, not JSON.
  return new NextResponse(challenge, { status: 200 });
});

export const POST = handler('api.webhooks.whatsapp', async (request) => {
  if (!(await isWhatsappConfigured())) {
    return new NextResponse('Not found', { status: 404 });
  }

  // The raw bytes, because the HMAC is over exactly what was sent. Re-serialising the parsed
  // JSON would produce different bytes and a signature that never matches.
  const raw = await request.text();

  if (!(await verifyWebhookSignature(raw, request.headers.get('x-hub-signature-256')))) {
    logger.warn('document_drop.whatsapp_signature_rejected', {});
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // A signed body that is not JSON is not something a retry will fix.
    return ok({ received: true, handled: 0 });
  }

  const parsed = whatsappWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn('document_drop.whatsapp_payload_unrecognised', {});
    return ok({ received: true, handled: 0 });
  }

  const admin = createSupabaseAdminClient();
  const deps = { admin, channel: 'whatsapp' as const };
  let handled = 0;

  for (const message of parseInboundMessages(parsed.data)) {
    try {
      const reply = await route(deps, message);
      if (reply) await sendWhatsappText(message.senderId, reply.text);
      handled += 1;
    } catch (thrown) {
      // Per message, so one failure does not cost the rest of a batch — and, crucially, does not
      // turn the whole delivery into a retry.
      logger.error('document_drop.whatsapp_message_failed', {
        intent: message.intent.kind,
        reason: thrown instanceof Error ? thrown.message : 'unknown',
      });
    }
  }

  return ok({ received: true, handled });
});

type Deps = { admin: ReturnType<typeof createSupabaseAdminClient>; channel: 'whatsapp' };

async function route(
  deps: Deps,
  message: ReturnType<typeof parseInboundMessages>[number],
): Promise<{ text: string } | null> {
  const { intent } = message;

  if (intent.kind === 'start') {
    return handleStart(deps, {
      code: intent.code,
      senderId: message.senderId,
      senderName: message.senderName,
    });
  }

  if (intent.kind === 'done') {
    return handleDone(deps, message.senderId);
  }

  if (intent.kind === 'media') {
    return handleMedia(deps, {
      senderId: message.senderId,
      senderName: message.senderName,
      media: {
        filename: intent.filename,
        declaredMimeType: intent.declaredMimeType,
        caption: intent.caption,
        // Lazy: `handleMedia` resolves the session first, so a stranger with no live session
        // never causes a download from Meta's CDN.
        download: async () => (await fetchWhatsappMedia(intent.mediaId))?.bytes ?? null,
      },
    });
  }

  // Ordinary chatter. Answering every "namaste" would be noise, and answering nothing is what a
  // citizen expects from a document drop box.
  return null;
}
