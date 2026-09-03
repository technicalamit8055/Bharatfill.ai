/**
 * Tests for the WhatsApp adapter.
 *
 * Two things matter here and nothing else does. **Authentication**, because this webhook is
 * reachable by anyone who learns the URL and the only thing standing between them and a real
 * centre's intake queue is the signature check. And **normalisation**, because a message
 * misclassified as chatter is a citizen's Aadhaar that silently never arrives.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/*
 * Credentials resolve database-first, environment-fallback. These tests are about the *env*
 * half — the behaviour every existing deployment relies on — so the settings table is stubbed
 * as empty rather than left to time out against a Supabase that is not running. Stubbing it
 * keeps the suite fast and deterministic, and asserts the fallback explicitly instead of by
 * accident.
 */
vi.mock('../supabase/server', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          abortSignal: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

// serverEnv() validates the whole server schema on first call, and caches it — so the channel
// credentials have to exist before the module under test is imported.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const APP_SECRET = 'test-whatsapp-app-secret-0001';
const VERIFY_TOKEN = 'test-whatsapp-verify-token-01';

process.env.WHATSAPP_APP_SECRET = APP_SECRET;
process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.WHATSAPP_ACCESS_TOKEN = 'test-whatsapp-access-token-1';
process.env.WHATSAPP_PHONE_NUMBER_ID = '111111111111111';
process.env.WHATSAPP_BOT_NUMBER = '919900000000';

const { whatsappWebhookSchema } = await import('@assistigo/core');
const {
  isWhatsappConfigured,
  parseInboundMessages,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  whatsappBotNumber,
} = await import('./whatsapp');

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

function messageBody(message: Record<string, unknown>, profileName = 'Test Person') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: profileName }, wa_id: '919900000123' }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

function parse(body: unknown) {
  return parseInboundMessages(whatsappWebhookSchema.parse(body));
}

describe('configuration', () => {
  it('reports configured only with a token and a phone number id', async () => {
    expect(await isWhatsappConfigured()).toBe(true);
    expect(await whatsappBotNumber()).toBe('919900000000');
  });
});

describe('verifyWebhookChallenge', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const url = new URL(
      `https://app.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`,
    );
    expect(await verifyWebhookChallenge(url)).toBe('1158201444');
  });

  it('refuses a wrong token, a wrong mode, or a missing challenge', async () => {
    const base = 'https://app.test/api/webhooks/whatsapp';
    expect(
      await verifyWebhookChallenge(
        new URL(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`),
      ),
    ).toBeNull();
    expect(
      await verifyWebhookChallenge(
        new URL(`${base}?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`),
      ),
    ).toBeNull();
    expect(
      await verifyWebhookChallenge(
        new URL(`${base}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`),
      ),
    ).toBeNull();
    expect(await verifyWebhookChallenge(new URL(base))).toBeNull();
  });
});

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify(messageBody({ id: 'wamid.1', from: '919900000123', type: 'text' }));

  it('accepts a body signed with the app secret', async () => {
    expect(await verifyWebhookSignature(body, sign(body))).toBe(true);
    // Meta sends the `sha256=` prefix; tolerate a bare digest too rather than reject a valid one.
    expect(await verifyWebhookSignature(body, sign(body).slice(7))).toBe(true);
  });

  it('rejects a body signed with the wrong secret', async () => {
    expect(await verifyWebhookSignature(body, sign(body, 'not-the-app-secret-000000'))).toBe(false);
  });

  it('rejects a tampered body', async () => {
    // The exact attack the check exists for: a valid-looking delivery with the sender swapped.
    const signature = sign(body);
    const tampered = body.replace('919900000123', '919900000999');
    expect(await verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a missing or malformed header rather than throwing', async () => {
    expect(await verifyWebhookSignature(body, null)).toBe(false);
    expect(await verifyWebhookSignature(body, '')).toBe(false);
    expect(await verifyWebhookSignature(body, 'sha256=short')).toBe(false);
  });
});

describe('parseInboundMessages', () => {
  it('reads a start command and the sender profile name', () => {
    const [message] = parse(
      messageBody({
        id: 'wamid.1',
        from: '919900000123',
        type: 'text',
        text: { body: 'START DROP-7429' },
      }),
    );

    expect(message?.senderId).toBe('919900000123');
    expect(message?.senderName).toBe('Test Person');
    expect(message?.intent).toEqual({ kind: 'start', code: 'DROP-7429' });
  });

  it('reads a DONE command', () => {
    const [message] = parse(
      messageBody({ id: 'wamid.2', from: '919900000123', type: 'text', text: { body: 'done' } }),
    );
    expect(message?.intent.kind).toBe('done');
  });

  it('treats ordinary chatter as nothing to do', () => {
    const [message] = parse(
      messageBody({ id: 'wamid.3', from: '919900000123', type: 'text', text: { body: 'namaste' } }),
    );
    expect(message?.intent.kind).toBe('ignored');
  });

  it('reads an image, carrying the caption through as a type hint', () => {
    const [message] = parse(
      messageBody({
        id: 'wamid.4',
        from: '919900000123',
        type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Aadhaar card' },
      }),
    );

    expect(message?.intent).toEqual({
      kind: 'media',
      mediaId: 'media-1',
      filename: 'whatsapp-media-1.jpg',
      declaredMimeType: 'image/jpeg',
      caption: 'Aadhaar card',
    });
  });

  it('strips the codec parameters Meta appends to a mime type', () => {
    const [message] = parse(
      messageBody({
        id: 'wamid.5',
        from: '919900000123',
        type: 'image',
        image: { id: 'media-2', mime_type: 'image/jpeg; codecs=avc1' },
      }),
    );

    // `isAllowedUploadMimeType` compares exactly, so an unstripped parameter would make every
    // WhatsApp image fall through to byte sniffing.
    if (message?.intent.kind !== 'media') throw new Error('expected media');
    expect(message.intent.declaredMimeType).toBe('image/jpeg');
  });

  it('reads a document, keeping the sender-supplied filename', () => {
    const [message] = parse(
      messageBody({
        id: 'wamid.6',
        from: '919900000123',
        type: 'document',
        document: { id: 'media-3', mime_type: 'application/pdf', filename: 'marksheet.pdf' },
      }),
    );

    if (message?.intent.kind !== 'media') throw new Error('expected media');
    expect(message.intent.filename).toBe('marksheet.pdf');
    expect(message.intent.declaredMimeType).toBe('application/pdf');
  });

  it('falls back to a synthetic filename when the document has none', () => {
    const [message] = parse(
      messageBody({
        id: 'wamid.7',
        from: '919900000123',
        type: 'document',
        document: { id: 'media-4' },
      }),
    );

    if (message?.intent.kind !== 'media') throw new Error('expected media');
    expect(message.intent.filename).toBe('whatsapp-media-4');
    expect(message.intent.declaredMimeType).toBeNull();
  });

  it.each(['audio', 'video', 'sticker', 'location', 'contacts', 'reaction'])(
    'ignores a %s message',
    (type) => {
      const [message] = parse(messageBody({ id: 'wamid.8', from: '919900000123', type }));
      expect(message?.intent.kind).toBe('ignored');
    },
  );

  it('flattens a batched delivery across entries and changes', () => {
    // Meta batches, and a parser that only reads entry[0].changes[0] drops documents silently.
    const messages = parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'a', from: '911', type: 'text', text: { body: 'START DROP-7429' } },
                  { id: 'b', from: '911', type: 'text', text: { body: 'DONE' } },
                ],
              },
            },
            {
              value: {
                messages: [{ id: 'c', from: '922', type: 'image', image: { id: 'm' } }],
              },
            },
          ],
        },
        {
          changes: [
            { value: { messages: [{ id: 'd', from: '933', type: 'text', text: { body: 'hi' } }] } },
          ],
        },
      ],
    });

    expect(messages.map((message) => message.messageId)).toEqual(['a', 'b', 'c', 'd']);
    expect(messages.map((message) => message.intent.kind)).toEqual([
      'start',
      'done',
      'media',
      'ignored',
    ]);
  });

  it('returns nothing for a status-only delivery', () => {
    // Delivery and read receipts arrive on the same webhook and are not messages.
    expect(
      parse({
        object: 'whatsapp_business_account',
        entry: [
          { changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] },
        ],
      }),
    ).toEqual([]);
  });
});
