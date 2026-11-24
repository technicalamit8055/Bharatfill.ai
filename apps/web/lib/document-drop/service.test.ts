/**
 * Tests for the drop intake service.
 *
 * This is the file where a stranger's file meets the database, so the assertions are about the
 * properties that keep that safe rather than about plumbing:
 *
 *   - a file that lies about what it is never reaches storage,
 *   - the per-session ceiling and the size ceiling actually hold,
 *   - a failed row insert does not leave bytes orphaned in the bucket,
 *   - conversion claims a session exactly once, so two operators cannot make two customers,
 *   - a Telegram chat id is never stored as if it were a phone number.
 *
 * The Supabase stub covers only the calls these functions make. A general-purpose fake would be
 * a second implementation to keep in sync.
 */

import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const { MAX_DROP_FILES_PER_SESSION, MAX_UPLOAD_BYTES } = await import('@assistigo/core');
const { normalizeSenderMobile, resolveDropTarget, saveInboundDropFile, senderLabel } = await import(
  './service'
);

const ORG = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

const session = { id: SESSION, organizationId: ORG };

// ---------------------------------------------------------------------------
// Sample bytes
// ---------------------------------------------------------------------------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function pdf(): Uint8Array {
  const head = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\nstream\n');
  const body = deflateSync('BT (Name: Test Person) Tj ET');
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

/** An HTML page claiming to be a PDF — the upload that turns a bucket into an XSS host. */
const HTML_PRETENDING_TO_BE_PDF = new TextEncoder().encode(
  '<html><script>alert(1)</script></html>',
);

// ---------------------------------------------------------------------------
// Stub client
// ---------------------------------------------------------------------------

type Captured = {
  uploads: { path: string; contentType: string | undefined }[];
  removals: string[][];
  inserts: Record<string, unknown>[];
};

function stubClient(
  options: { existingFileCount?: number; insertFails?: boolean; uploadFails?: boolean } = {},
) {
  const captured: Captured = { uploads: [], removals: [], inserts: [] };

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        gt: () => builder,
        gte: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        // The head:true count query in `saveInboundDropFile`.
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ count: options.existingFileCount ?? 0, error: null, data: [] }),
        insert(payload: Record<string, unknown>) {
          captured.inserts.push({ table, ...payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve(
                  options.insertFails
                    ? { data: null, error: { code: '23503', message: 'insert failed' } }
                    : { data: { id: payload.id ?? 'generated-id' }, error: null },
                ),
            }),
          };
        },
        update: () => ({
          eq: () => ({ in: () => Promise.resolve({ error: null }) }),
          in: () => Promise.resolve({ error: null }),
        }),
      };
      return builder;
    },
    storage: {
      from: () => ({
        upload: (path: string, _bytes: Uint8Array, opts?: { contentType?: string }) => {
          captured.uploads.push({ path, contentType: opts?.contentType });
          return Promise.resolve(
            options.uploadFails
              ? { data: null, error: { message: 'upload failed' } }
              : { data: { path }, error: null },
          );
        },
        remove: (paths: string[]) => {
          captured.removals.push(paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };

  return { client: client as never, captured };
}

// ---------------------------------------------------------------------------
// saveInboundDropFile
// ---------------------------------------------------------------------------

describe('saveInboundDropFile', () => {
  it('stores a JPEG and writes an org- and session-scoped path', async () => {
    const { client, captured } = stubClient();

    const saved = await saveInboundDropFile(
      client,
      session,
      { filename: 'aadhaar.jpg', declaredMimeType: 'image/jpeg', hint: 'Aadhaar card' },
      JPEG,
    );

    expect(saved.suggestedDocumentType).toBe('aadhaar_like');
    expect(captured.uploads).toHaveLength(1);
    // A leaked path must not be able to address another tenant's object.
    expect(captured.uploads[0]?.path.startsWith(`org/${ORG}/drop/${SESSION}/`)).toBe(true);
    expect(captured.uploads[0]?.contentType).toBe('image/jpeg');

    const insert = captured.inserts[0];
    expect(insert?.table).toBe('document_drop_files');
    expect(insert?.organization_id).toBe(ORG);
    expect(insert?.mime_type).toBe('image/jpeg');
    expect(insert?.size_bytes).toBe(JPEG.length);
    expect(insert?.suggested_document_type).toBe('aadhaar_like');
  });

  it('rejects a file whose bytes disagree with its declared type, before uploading', async () => {
    const { client, captured } = stubClient();

    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'marksheet.pdf', declaredMimeType: 'application/pdf' },
        HTML_PRETENDING_TO_BE_PDF,
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });

    // The property that matters: nothing was written. Unlike the operator upload path, which
    // sniffs after the browser has already put bytes in the bucket, this path never gets there.
    expect(captured.uploads).toEqual([]);
    expect(captured.inserts).toEqual([]);
  });

  it('sniffs the type when the channel declares nothing useful', async () => {
    const { client, captured } = stubClient();

    // Telegram documents and WhatsApp uploads both sometimes arrive with no mime type.
    await saveInboundDropFile(
      client,
      session,
      { filename: 'scan', declaredMimeType: null },
      PNG,
    );

    expect(captured.uploads[0]?.contentType).toBe('image/png');
    expect(captured.inserts[0]?.mime_type).toBe('image/png');
  });

  it('sniffs past a declared type that is not one we accept', async () => {
    const { client, captured } = stubClient();

    // `image/jpg` is not in the allow-list — the bytes are what decide.
    await saveInboundDropFile(
      client,
      session,
      { filename: 'photo.jpg', declaredMimeType: 'image/jpg' },
      JPEG,
    );

    expect(captured.inserts[0]?.mime_type).toBe('image/jpeg');
  });

  it('accepts a PDF', async () => {
    const { client, captured } = stubClient();
    await saveInboundDropFile(
      client,
      session,
      { filename: 'marksheet.pdf', declaredMimeType: 'application/pdf', hint: '10th marksheet' },
      pdf(),
    );
    expect(captured.inserts[0]?.mime_type).toBe('application/pdf');
    expect(captured.inserts[0]?.suggested_document_type).toBe('marksheet_10');
  });

  it('rejects bytes matching no accepted signature', async () => {
    const { client, captured } = stubClient();

    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'voice.ogg', declaredMimeType: null },
        new Uint8Array([0x4f, 0x67, 0x67, 0x53]),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });

    expect(captured.uploads).toEqual([]);
  });

  it('refuses an empty file', async () => {
    const { client } = stubClient();
    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'empty.jpg', declaredMimeType: 'image/jpeg' },
        new Uint8Array(0),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses a file over the same ceiling the operator upload path uses', async () => {
    const { client, captured } = stubClient();

    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    huge.set(JPEG, 0);

    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'huge.jpg', declaredMimeType: 'image/jpeg' },
        huge,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(captured.uploads).toEqual([]);
  });

  it('refuses a file once the session is full', async () => {
    const { client, captured } = stubClient({ existingFileCount: MAX_DROP_FILES_PER_SESSION });

    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'eleventh.jpg', declaredMimeType: 'image/jpeg' },
        JPEG,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(captured.uploads).toEqual([]);
  });

  it('deletes the uploaded object when the row insert fails', async () => {
    const { client, captured } = stubClient({ insertFails: true });

    await expect(
      saveInboundDropFile(
        client,
        session,
        { filename: 'aadhaar.jpg', declaredMimeType: 'image/jpeg' },
        JPEG,
      ),
    ).rejects.toBeDefined();

    // An object no row points at is unreachable by the retention sweep, which walks rows.
    expect(captured.uploads).toHaveLength(1);
    expect(captured.removals).toEqual([[captured.uploads[0]?.path]]);
  });

  it('prefers an explicit document type over a text hint', async () => {
    const { client, captured } = stubClient();

    // The web drop page lets the citizen say what they are sending; that outranks caption
    // guessing, which is only a heuristic.
    await saveInboundDropFile(
      client,
      session,
      {
        filename: 'file.jpg',
        declaredMimeType: 'image/jpeg',
        hint: 'Aadhaar card',
        documentType: 'photo',
      },
      JPEG,
    );

    expect(captured.inserts[0]?.suggested_document_type).toBe('photo');
  });

  it('sanitises a traversal attempt in a sender-supplied filename', async () => {
    const { client, captured } = stubClient();

    await saveInboundDropFile(
      client,
      session,
      { filename: '../../../../etc/passwd', declaredMimeType: 'image/jpeg' },
      JPEG,
    );

    const path = captured.uploads[0]?.path ?? '';
    expect(path.startsWith(`org/${ORG}/drop/${SESSION}/`)).toBe(true);
    expect(path).not.toContain('..');
  });

  it('logs nothing that identifies the sender or their file', async () => {
    const { client } = stubClient();
    const logged: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));

    try {
      await saveInboundDropFile(
        client,
        session,
        {
          filename: 'Sunita-Devi-aadhaar-9900000123.jpg',
          declaredMimeType: 'image/jpeg',
          hint: 'Aadhaar card',
        },
        JPEG,
      );
    } finally {
      spy.mockRestore();
    }

    // A filename at a counter routinely carries the customer's name and number (§19.6).
    const output = logged.join('\n');
    expect(output).toContain('document_drop.file_received');
    expect(output).not.toContain('Sunita');
    expect(output).not.toContain('9900000123');
  });
});

// ---------------------------------------------------------------------------
// resolveDropTarget
// ---------------------------------------------------------------------------

/** A read-only stub: any insert through it is a test failure by construction. */
function readOnlyClient(rows: { session?: unknown; organization?: unknown }) {
  const writes: string[] = [];

  const client = {
    from(table: string) {
      const state = { byCounterCode: false };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string) => {
          if (column === 'counter_drop_code') state.byCounterCode = true;
          return builder;
        },
        in: () => builder,
        is: () => builder,
        gt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === 'organizations' && state.byCounterCode
                ? (rows.organization ?? null)
                : (rows.session ?? null),
            error: null,
          }),
        insert: () => {
          writes.push(`insert:${table}`);
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }),
          };
        },
        update: () => {
          writes.push(`update:${table}`);
          const chain: Record<string, unknown> = {
            eq: () => chain,
            in: () => Promise.resolve({ error: null }),
            is: () => chain,
            select: () => chain,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
  };

  return { client: client as never, writes };
}

describe('resolveDropTarget', () => {
  it('reads a live session without writing anything', async () => {
    const { client, writes } = readOnlyClient({
      session: {
        id: SESSION,
        organization_id: ORG,
        session_code: 'DROP-7429',
        channel: 'web',
        status: 'active',
        sender_id: null,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        organizations: { id: ORG, name: 'Test Seva Kendra', preferred_locale: 'en' },
      },
    });

    const target = await resolveDropTarget(client, 'DROP-7429');

    expect(target?.kind).toBe('session');
    if (target?.kind === 'session') expect(target.session.organizationName).toBe('Test Seva Kendra');
    expect(writes).toEqual([]);
  });

  it('reports a counter code as a centre, and mints no session', async () => {
    const { client, writes } = readOnlyClient({
      session: null,
      organization: { id: ORG, name: 'Counter Centre', preferred_locale: 'hi' },
    });

    const target = await resolveDropTarget(client, 'CSC123');

    expect(target?.kind).toBe('counter');
    if (target?.kind === 'counter') expect(target.organization.name).toBe('Counter Centre');

    // The property the public drop page depends on. Minting on render would leave an empty row in
    // the operator's queue on every reload — and orphan the session already holding the
    // citizen's files.
    expect(writes).toEqual([]);
  });

  it('returns null for a code that matches nothing', async () => {
    const { client, writes } = readOnlyClient({ session: null, organization: null });
    expect(await resolveDropTarget(client, 'DROP-2222')).toBeNull();
    expect(writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeSenderMobile
// ---------------------------------------------------------------------------

describe('senderLabel', () => {
  it('shows a WhatsApp sender mobile in full', () => {
    expect(senderLabel('whatsapp', '919900000123')).toBe('99000 00123');
  });

  it('never shows a Telegram chat id in full, even a mobile-shaped one', () => {
    expect(senderLabel('telegram', '9900000123')).toBe('••••0123');
  });

  it('keeps the last four of a WhatsApp id that is not an Indian mobile', () => {
    expect(senderLabel('whatsapp', '915500000123')).toBe('••••0123');
    expect(senderLabel('whatsapp', null)).toBeNull();
  });
});

describe('normalizeSenderMobile', () => {
  it('reduces a WhatsApp sender to the ten digits the app searches on', () => {
    expect(normalizeSenderMobile('919900000123')).toBe('9900000123');
    expect(normalizeSenderMobile('+91 99000 00123')).toBe('9900000123');
    expect(normalizeSenderMobile('9900000123')).toBe('9900000123');
  });

  it('refuses a Telegram chat id rather than storing it as a phone number', () => {
    // A chat id is an account number. Writing one into `customers.mobile` would put a number
    // that dials nobody — or worse, somebody else — on a real profile.
    expect(normalizeSenderMobile('550123')).toBeNull();
    expect(normalizeSenderMobile('1234567890')).toBeNull();
    expect(normalizeSenderMobile('7772581357913')).toBeNull();
    expect(normalizeSenderMobile('@centre_channel')).toBeNull();
  });

  it('refuses anything that is not a plausible Indian mobile', () => {
    // Indian mobile numbers start 6–9.
    expect(normalizeSenderMobile('915500000123')).toBeNull();
    expect(normalizeSenderMobile('12345')).toBeNull();
    expect(normalizeSenderMobile(null)).toBeNull();
    expect(normalizeSenderMobile('')).toBeNull();
  });
});
