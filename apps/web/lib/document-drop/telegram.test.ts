/**
 * Tests for the Telegram adapter.
 *
 * Same two concerns as the WhatsApp suite — the secret-token gate that is the only thing
 * protecting the webhook, and the normalisation that decides whether a citizen's marksheet
 * becomes a file or is silently ignored.
 *
 * The photo-rendition assertion is the one that matters most in practice: Telegram sends a
 * thumbnail and a full-size copy in the same array, and picking the wrong one means storing a
 * 90×120 marksheet that no OCR will ever read.
 */

import { describe, expect, it, vi } from 'vitest';

/*
 * Credentials resolve database-first, environment-fallback. These tests are about the *env*
 * half — the behaviour every existing deployment relies on — so the settings table is stubbed
 * as empty rather than left to time out against a Supabase that is not running.
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

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const WEBHOOK_SECRET = 'test-telegram-webhook-secret';

process.env.TELEGRAM_BOT_TOKEN = '111111:test-telegram-bot-token';
process.env.TELEGRAM_BOT_USERNAME = 'test_centre_bot';
process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { telegramUpdateSchema } = await import('@assistigo/core');
const { isTelegramConfigured, parseTelegramUpdate, telegramBotUsername, verifyTelegramSecret } =
  await import('./telegram');

function parse(update: Record<string, unknown>) {
  return parseTelegramUpdate(telegramUpdateSchema.parse(update));
}

function message(fields: Record<string, unknown>) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1700000000,
      chat: { id: 550123, type: 'private' },
      from: { id: 550123, first_name: 'Test', is_bot: false },
      ...fields,
    },
  };
}

describe('configuration', () => {
  it('reports configured with a bot token, and exposes the handle for the deep link', async () => {
    expect(await isTelegramConfigured()).toBe(true);
    expect(await telegramBotUsername()).toBe('test_centre_bot');
  });
});

describe('verifyTelegramSecret', () => {
  it('accepts the configured secret', async () => {
    expect(await verifyTelegramSecret(WEBHOOK_SECRET)).toBe(true);
  });

  it('refuses a wrong, missing or truncated secret', async () => {
    expect(await verifyTelegramSecret('wrong-secret-entirely-here')).toBe(false);
    expect(await verifyTelegramSecret(null)).toBe(false);
    expect(await verifyTelegramSecret('')).toBe(false);
    // A length mismatch must be a plain false, not a throw out of timingSafeEqual.
    expect(await verifyTelegramSecret(WEBHOOK_SECRET.slice(0, 10))).toBe(false);
  });
});

describe('parseTelegramUpdate', () => {
  it('reads the /start deep-link payload the QR produces', () => {
    const result = parse(message({ text: '/start DROP-7429' }));
    expect(result?.chatId).toBe('550123');
    expect(result?.senderName).toBe('Test');
    expect(result?.intent).toEqual({ kind: 'start', code: 'DROP-7429' });
  });

  it('reads /start sent from a group, where the bot handle is appended', () => {
    expect(parse(message({ text: '/start@test_centre_bot KSK829' }))?.intent).toEqual({
      kind: 'start',
      code: 'KSK829',
    });
  });

  it('reads DONE in either language', () => {
    expect(parse(message({ text: 'DONE' }))?.intent.kind).toBe('done');
    expect(parse(message({ text: 'हो गया' }))?.intent.kind).toBe('done');
  });

  it('picks the largest photo rendition', () => {
    const result = parse(
      message({
        caption: '10th marksheet',
        photo: [
          { file_id: 'thumb', file_size: 900, width: 90, height: 120 },
          { file_id: 'medium', file_size: 40_000, width: 320, height: 427 },
          { file_id: 'full', file_size: 240_000, width: 1280, height: 1707 },
        ],
      }),
    );

    if (result?.intent.kind !== 'media') throw new Error('expected media');
    // Storing the thumbnail would give the extractor an unreadable marksheet.
    expect(result.intent.fileId).toBe('full');
    expect(result.intent.declaredSize).toBe(240_000);
    expect(result.intent.declaredMimeType).toBe('image/jpeg');
    expect(result.intent.caption).toBe('10th marksheet');
  });

  it('reads an uncompressed document upload, keeping its filename', () => {
    const result = parse(
      message({
        document: {
          file_id: 'doc-1',
          file_name: 'aadhaar.pdf',
          mime_type: 'application/pdf',
          file_size: 120_000,
        },
      }),
    );

    if (result?.intent.kind !== 'media') throw new Error('expected media');
    expect(result.intent.filename).toBe('aadhaar.pdf');
    expect(result.intent.declaredMimeType).toBe('application/pdf');
  });

  it('prefers the photo array when a message somehow carries both', () => {
    const result = parse(
      message({
        photo: [{ file_id: 'photo-1', file_size: 1000 }],
        document: { file_id: 'doc-1', file_name: 'thumb.jpg' },
      }),
    );

    if (result?.intent.kind !== 'media') throw new Error('expected media');
    expect(result.intent.fileId).toBe('photo-1');
  });

  it('falls back to the username when the sender has no first name', () => {
    const result = parse({
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 550123 },
        from: { id: 550123, username: 'testperson' },
        text: '/start DROP-7429',
      },
    });
    expect(result?.senderName).toBe('testperson');
  });

  it('returns null for an update carrying no message', () => {
    // An edited message, a callback query, a poll answer: not an error, just nothing to do.
    expect(parse({ update_id: 3, edited_message: { message_id: 1 } })).toBeNull();
    expect(parse({ update_id: 4 })).toBeNull();
  });

  it('ignores chatter and message types that carry no document', () => {
    expect(parse(message({ text: 'namaste bhai' }))?.intent.kind).toBe('ignored');
    expect(parse(message({ voice: { file_id: 'v' } }))?.intent.kind).toBe('ignored');
    expect(parse(message({ sticker: { file_id: 's' } }))?.intent.kind).toBe('ignored');
  });

  it('handles a string chat id', () => {
    const result = parse({
      update_id: 5,
      message: { message_id: 1, chat: { id: '@centre_channel' }, text: 'DONE' },
    });
    expect(result?.chatId).toBe('@centre_channel');
  });
});
