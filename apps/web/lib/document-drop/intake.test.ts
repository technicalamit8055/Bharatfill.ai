/**
 * Tests for the channel-independent intake pipeline.
 *
 * These cover the decisions that would otherwise only be visible in production:
 *
 *   - a stranger with no live session never causes a media download (the bot's number would
 *     otherwise be a free bandwidth amplifier for anyone who found it),
 *   - an unknown code and an expired one get the same reply, so the bot is not an oracle for
 *     which codes are live at which centre,
 *   - the sender's profile name and number are bound to the session, because pre-filling them
 *     is the time saving the whole feature exists for.
 */

import { describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const { handleDone, handleMedia, handleStart } = await import('./intake');

const ORG = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

type StubOptions = {
  /** A live session found by code. */
  sessionByCode?: Record<string, unknown> | null;
  /** A live session found by sender — the returning-sender path. */
  sessionBySender?: Record<string, unknown> | null;
  /** An organization matching a counter code. */
  organization?: Record<string, unknown> | null;
  fileCount?: number;
};

function liveSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION,
    organization_id: ORG,
    session_code: 'DROP-7429',
    channel: 'whatsapp',
    status: 'active',
    sender_id: null,
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    organizations: { id: ORG, name: 'Test Seva Kendra', preferred_locale: 'en' },
    ...overrides,
  };
}

/**
 * A stub covering the queries intake makes. Tracks which table each chain started from, so
 * "resolve by code" and "resolve by sender" can return different rows.
 */
function stubClient(options: StubOptions = {}) {
  const captured = { updates: [] as Record<string, unknown>[], selects: [] as string[] };

  const client = {
    from(table: string) {
      const state = { table, byCode: false, bySender: false };

      const builder: Record<string, unknown> = {
        select: (columns?: string) => {
          captured.selects.push(`${table}:${columns ?? ''}`);
          return builder;
        },
        eq: (column: string, _value: unknown) => {
          if (column === 'session_code' || column === 'counter_drop_code') state.byCode = true;
          if (column === 'sender_id') state.bySender = true;
          return builder;
        },
        in: () => builder,
        is: () => builder,
        gt: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => {
          if (table === 'organizations') {
            return Promise.resolve({ data: options.organization ?? null, error: null });
          }
          if (state.bySender) {
            return Promise.resolve({ data: options.sessionBySender ?? null, error: null });
          }
          return Promise.resolve({ data: options.sessionByCode ?? null, error: null });
        },
        // The head:true count query used to report how many files have arrived.
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ count: options.fileCount ?? 1, error: null, data: [] }),
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: 'new-id' }, error: null }) }),
        }),
        update(payload: Record<string, unknown>) {
          captured.updates.push({ table, ...payload });
          const chain: Record<string, unknown> = {
            eq: () => chain,
            in: () => Promise.resolve({ error: null }),
            then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'x' }, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  };

  return { client: client as never, captured };
}

describe('handleStart', () => {
  it('greets the citizen by the centre name and binds their number to the session', async () => {
    const { client, captured } = stubClient({ sessionByCode: liveSession() });

    const reply = await handleStart(
      { admin: client, channel: 'whatsapp' },
      { code: 'DROP-7429', senderId: '919900000123', senderName: 'Test Person' },
    );

    expect(reply?.text).toContain('Test Seva Kendra');
    // Both languages in one message: the operator's locale is not the citizen's, and asking a
    // stranger to pick a language before sending a photo is the friction this removes.
    expect(reply?.text).toContain('नमस्ते');
    expect(reply?.text).toContain('DONE');

    const bind = captured.updates.find((update) => update.table === 'document_drop_sessions');
    expect(bind?.sender_id).toBe('919900000123');
    expect(bind?.sender_name).toBe('Test Person');
  });

  it('gives an unknown code and an expired one the same answer', async () => {
    // Distinguishing them would let anyone with the bot's number enumerate live sessions.
    const unknown = await handleStart(
      { admin: stubClient({ sessionByCode: null, organization: null }).client, channel: 'whatsapp' },
      { code: 'DROP-2222', senderId: '919900000123', senderName: null },
    );

    const expired = await handleStart(
      { admin: stubClient({ sessionByCode: null, organization: null }).client, channel: 'whatsapp' },
      { code: 'KSK829', senderId: '919900000123', senderName: null },
    );

    expect(unknown?.text).toBe(expired?.text);
    expect(unknown?.text).toContain('QR');
    // Nothing about which centre, or whether the code ever existed.
    expect(unknown?.text).not.toContain('Kendra');
  });

  it('mints a session when the code is a permanent counter code', async () => {
    const { client } = stubClient({
      sessionByCode: null,
      organization: { id: ORG, name: 'Counter Centre', preferred_locale: 'hi' },
    });

    const reply = await handleStart(
      { admin: client, channel: 'whatsapp' },
      { code: 'CSC123', senderId: '919900000123', senderName: null },
    );

    // A standee is scanned by many people; each gets their own session, which is what stops two
    // citizens at one counter landing in one intake.
    expect(reply?.text).toContain('Counter Centre');
  });

  it('truncates an over-long profile name rather than failing the column check', async () => {
    const { client, captured } = stubClient({ sessionByCode: liveSession() });

    await handleStart(
      { admin: client, channel: 'whatsapp' },
      { code: 'DROP-7429', senderId: '919900000123', senderName: 'x'.repeat(400) },
    );

    const bind = captured.updates.find((update) => update.table === 'document_drop_sessions');
    expect(String(bind?.sender_name)).toHaveLength(120);
  });
});

describe('handleDone', () => {
  it('thanks the citizen and points them at the counter', async () => {
    const { client, captured } = stubClient({ sessionBySender: liveSession() });

    const reply = await handleDone({ admin: client, channel: 'whatsapp' }, '919900000123');

    expect(reply?.text).toContain('counter');
    expect(
      captured.updates.some((update) => update.status === 'ready'),
    ).toBe(true);
  });

  it('tells a sender with no live session to scan first', async () => {
    const { client } = stubClient({ sessionBySender: null });
    const reply = await handleDone({ admin: client, channel: 'whatsapp' }, '919900000123');
    expect(reply?.text).toContain('QR');
  });
});

describe('handleMedia', () => {
  it('stores the file and reports the running count back', async () => {
    const { client } = stubClient({ sessionBySender: liveSession(), fileCount: 2 });
    const download = vi.fn(() => Promise.resolve(JPEG));

    const reply = await handleMedia(
      { admin: client, channel: 'whatsapp' },
      {
        senderId: '919900000123',
        senderName: null,
        media: {
          filename: 'aadhaar.jpg',
          declaredMimeType: 'image/jpeg',
          caption: 'Aadhaar',
          download,
        },
      },
    );

    expect(download).toHaveBeenCalledTimes(1);
    expect(reply?.text).toContain('2');
  });

  it('never downloads media for a sender with no live session', async () => {
    const { client } = stubClient({ sessionBySender: null });
    const download = vi.fn(() => Promise.resolve(JPEG));

    const reply = await handleMedia(
      { admin: client, channel: 'telegram' },
      {
        senderId: '550123',
        senderName: null,
        media: {
          filename: 'whatever.jpg',
          declaredMimeType: 'image/jpeg',
          caption: null,
          download,
        },
      },
    );

    // The whole reason the download is a callback: a stranger messaging the bot should cost one
    // indexed lookup, not a fetch from a CDN.
    expect(download).not.toHaveBeenCalled();
    expect(reply?.text).toContain('QR');
  });

  it('tells the citizen plainly when the download fails', async () => {
    const { client } = stubClient({ sessionBySender: liveSession() });

    const reply = await handleMedia(
      { admin: client, channel: 'whatsapp' },
      {
        senderId: '919900000123',
        senderName: null,
        media: {
          filename: 'big.jpg',
          declaredMimeType: 'image/jpeg',
          caption: null,
          // What `fetchWhatsappMedia` returns for an oversized or unavailable object.
          download: () => Promise.resolve(null),
        },
      },
    );

    expect(reply?.text).toContain('15 MB');
  });

  it('tells the citizen plainly when the file is rejected, and says nothing about their file', async () => {
    const { client } = stubClient({ sessionBySender: liveSession() });

    const reply = await handleMedia(
      { admin: client, channel: 'whatsapp' },
      {
        senderId: '919900000123',
        senderName: null,
        media: {
          filename: 'note.ogg',
          declaredMimeType: null,
          caption: null,
          // A voice note: real bytes, not an accepted type.
          download: () => Promise.resolve(new Uint8Array([0x4f, 0x67, 0x67, 0x53])),
        },
      },
    );

    expect(reply?.text).toContain('JPG');
    expect(reply?.text).not.toContain('note.ogg');
  });
});
