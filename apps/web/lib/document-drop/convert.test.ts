/**
 * Tests for saving a walk-in drop to a customer — the revamped intake (§9.1, §11).
 *
 * The properties worth pinning down here are the ones that would be expensive to get wrong:
 *
 *   - a partial save takes only the files that were asked for, and leaves the session claimable
 *     so the rest can go to somebody else;
 *   - a file id that is not actually staged cannot widen a save;
 *   - a roaming save writes into the citizen's HOME organization, never the caller's, and is
 *     refused outright without a live consent grant;
 *   - a roaming save queues no extraction and does not stamp another centre's customer onto this
 *     centre's session row;
 *   - previewing staged bytes is audited, and a converted file is no longer reachable that way.
 *
 * The Supabase stub answers only the calls these functions actually make. A general-purpose fake
 * would be a second implementation to keep in sync, and the existing service.test.ts makes the
 * same choice for the same reason.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const enqueueJob = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: unknown[]) => enqueueJob(...args),
}));

const { convertDropSession, signDropFile } = await import('./service');

const ORG = '11111111-1111-4111-8111-111111111111';
const HOME_ORG = 'aaaaaaaa-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const USER = '44444444-4444-4444-8444-444444444444';
const CUSTOMER = '55555555-5555-4555-8555-555555555555';
const GRANT = '66666666-6666-4666-8666-666666666666';
const FILE_A = '33333333-3333-4333-8333-333333333331';
const FILE_B = '33333333-3333-4333-8333-333333333332';

type StagedFile = {
  id: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  suggested_document_type: string;
};

function stagedFile(id: string, name: string): StagedFile {
  return {
    id,
    original_filename: name,
    storage_bucket: 'customer-documents',
    storage_path: `org/${ORG}/drop/${SESSION}/${id}-${name}`,
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    suggested_document_type: 'generic',
  };
}

type Capture = {
  documentInserts: Record<string, unknown>[];
  sessionUpdates: Record<string, unknown>[];
  audits: Record<string, unknown>[];
  copies: { from: string; to: string }[];
};

/**
 * A stub built around what each table is asked for, because the service reaches several tables
 * through the same chained builder and the table name is the only thing that distinguishes them.
 */
function stubContext(options: {
  files?: StagedFile[];
  /** The row `customers` returns for a select by id — null means "not visible to this caller". */
  customer?: { id: string; organization_id: string } | null;
  /** The row `customer_access_grants` returns — null means no live consent. */
  grant?: { id: string } | null;
  sessionStatus?: string;
}) {
  const capture: Capture = { documentInserts: [], sessionUpdates: [], audits: [], copies: [] };
  const files = options.files ?? [stagedFile(FILE_A, 'a.jpg'), stagedFile(FILE_B, 'b.jpg')];

  function builder(table: string) {
    const state: { payload?: Record<string, unknown> } = {};

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,

      maybeSingle: () => {
        if (table === 'document_drop_sessions') {
          return Promise.resolve({
            data: {
              id: SESSION,
              status: options.sessionStatus ?? 'ready',
              sender_id: '919000000001',
              sender_name: 'Test Sender',
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
            error: null,
          });
        }
        if (table === 'customers') {
          return Promise.resolve({ data: options.customer ?? null, error: null });
        }
        if (table === 'customer_access_grants') {
          return Promise.resolve({ data: options.grant ?? null, error: null });
        }
        if (table === 'document_drop_files') {
          // `signDropFile` reads one row; the id filter is applied by the real query, so the
          // stub stands in with the first staged file.
          return Promise.resolve({ data: files[0] ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },

      // The staged-file listing resolves the builder itself.
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'document_drop_files') {
          return resolve({ data: files, error: null });
        }
        return resolve({ data: [], error: null });
      },

      insert(payload: Record<string, unknown>) {
        if (table === 'documents') capture.documentInserts.push(payload);
        if (table === 'audit_logs') capture.audits.push(payload);
        state.payload = payload;
        const result = { data: { id: payload.id ?? CUSTOMER }, error: null };
        return {
          select: () => ({
            single: () => Promise.resolve(result),
            maybeSingle: () => Promise.resolve(result),
          }),
          then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
        };
      },

      update(payload: Record<string, unknown>) {
        if (table === 'document_drop_sessions') capture.sessionUpdates.push(payload);
        const claimed = { data: { id: SESSION }, error: null };
        const inner: Record<string, unknown> = {
          eq: () => inner,
          in: () => inner,
          is: () => inner,
          select: () => ({ maybeSingle: () => Promise.resolve(claimed) }),
          then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
        };
        return inner;
      },
    };

    return chain;
  }

  const supabase = {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        copy: (from: string, to: string) => {
          capture.copies.push({ from, to });
          return Promise.resolve({ data: { path: to }, error: null });
        },
        remove: () => Promise.resolve({ data: null, error: null }),
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `https://signed.test/${path}` }, error: null }),
      }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const context = {
    supabase,
    userId: USER,
    email: 'operator@example.test',
    actorType: 'user',
    organization: { id: ORG, name: 'Test Centre' },
    membership: {},
    role: 'operator',
    permissions: new Set(),
    ipAddress: null,
    userAgent: null,
  };

  // The service is typed against the real client and context; the stub answers the subset used.
  return { context: context as never, capture };
}

beforeEach(() => {
  enqueueJob.mockClear();
});

describe('convertDropSession — per-file selection', () => {
  it('saves only the selected file and leaves the session open for the rest', async () => {
    const { context, capture } = stubContext({});

    const result = await convertDropSession(context, SESSION, {
      fileIds: [FILE_A],
      target: 'local',
    });

    expect(result.documentIds).toHaveLength(1);
    expect(capture.documentInserts).toHaveLength(1);
    expect(capture.documentInserts[0]?.original_filename).toBe('a.jpg');

    // The whole point of a partial save: the second file is still claimable by somebody else.
    expect(result.sessionRemainsOpen).toBe(true);
    expect(capture.sessionUpdates).toContainEqual(
      expect.objectContaining({ status: 'ready', converted_at: null }),
    );
  });

  it('takes the whole session when no selection is given, and closes it', async () => {
    const { context, capture } = stubContext({});

    const result = await convertDropSession(context, SESSION, { target: 'local' });

    expect(result.documentIds).toHaveLength(2);
    expect(result.sessionRemainsOpen).toBe(false);
    expect(capture.sessionUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('refuses a selection that matches nothing still staged', async () => {
    const { context } = stubContext({});

    // A stale id from an old poll must not silently fall back to "everything".
    await expect(
      convertDropSession(context, SESSION, {
        fileIds: ['77777777-7777-4777-8777-777777777777'],
        target: 'local',
      }),
    ).rejects.toMatchObject({ messageKey: 'documentDrop.errors.noFiles' });
  });
});

describe('convertDropSession — roaming target', () => {
  it('writes the document into the citizen home organization, not the caller one', async () => {
    const { context, capture } = stubContext({
      customer: { id: CUSTOMER, organization_id: HOME_ORG },
      grant: { id: GRANT },
    });

    const result = await convertDropSession(context, SESSION, {
      customerId: CUSTOMER,
      target: 'roaming',
    });

    expect(result.target).toBe('roaming');
    expect(capture.documentInserts).toHaveLength(2);
    for (const row of capture.documentInserts) {
      // The property migration 0025 exists to permit, and the one that keeps the citizen's file
      // in one piece rather than forked across two centres.
      expect(row.organization_id).toBe(HOME_ORG);
      expect(row.customer_id).toBe(CUSTOMER);
      expect(row.uploaded_by).toBe(USER);
      expect(String(row.storage_path)).toContain(`org/${HOME_ORG}/customer/${CUSTOMER}/`);
    }
  });

  it('refuses when the caller holds no live consent grant', async () => {
    const { context, capture } = stubContext({
      customer: { id: CUSTOMER, organization_id: HOME_ORG },
      grant: null,
    });

    await expect(
      convertDropSession(context, SESSION, { customerId: CUSTOMER, target: 'roaming' }),
    ).rejects.toMatchObject({ messageKey: 'documentDrop.errors.roamingConsentRequired' });

    expect(capture.documentInserts).toHaveLength(0);
  });

  it('refuses a customer the caller cannot see at all', async () => {
    const { context } = stubContext({ customer: null, grant: { id: GRANT } });

    // Same answer a made-up uuid gets, which is the answer a probe deserves.
    await expect(
      convertDropSession(context, SESSION, { customerId: CUSTOMER, target: 'roaming' }),
    ).rejects.toMatchObject({ messageKey: 'errors.not_found' });
  });

  it('refuses a customer who is actually in the caller own organization', async () => {
    const { context } = stubContext({
      customer: { id: CUSTOMER, organization_id: ORG },
      grant: { id: GRANT },
    });

    await expect(
      convertDropSession(context, SESSION, { customerId: CUSTOMER, target: 'roaming' }),
    ).rejects.toMatchObject({ messageKey: 'errors.validation_failed' });
  });

  it('queues no extraction and does not stamp the session with another centre customer', async () => {
    const { context, capture } = stubContext({
      customer: { id: CUSTOMER, organization_id: HOME_ORG },
      grant: { id: GRANT },
    });

    const result = await convertDropSession(context, SESSION, {
      customerId: CUSTOMER,
      target: 'roaming',
    });

    // document_extractions was never opened to a grant holder (0024), so a queued job would
    // spend the home centre's quota on a transcript this operator could not read.
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(result.queuedExtractions).toBe(0);
    expect(capture.sessionUpdates).not.toContainEqual(
      expect.objectContaining({ customer_id: CUSTOMER }),
    );
  });

  it('queues extraction for an ordinary local save', async () => {
    const { context } = stubContext({});

    const result = await convertDropSession(context, SESSION, { target: 'local' });

    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(result.queuedExtractions).toBe(2);
  });
});

describe('signDropFile', () => {
  it('mints a signed url for a staged file and audits the read', async () => {
    const { context, capture } = stubContext({});

    const signed = await signDropFile(context, SESSION, FILE_A);

    expect(signed.url).toContain('https://signed.test/');
    expect(signed.filename).toBe('a.jpg');

    const audit = capture.audits.at(-1);
    expect(audit?.action).toBe('drop_file.previewed');
    // The filename is the citizen's data and has no business in an audit row.
    expect(JSON.stringify(audit)).not.toContain('a.jpg');
  });
});
