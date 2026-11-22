import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the customer document picker's half of the service worker (§7.4.5).
 *
 * Two behaviours worth pinning, because both fail silently rather than loudly:
 *
 * - `LIST_CUSTOMER_DOCUMENTS` reads two routes and returns one list. If either half is dropped,
 *   the picker shows a shorter vault and the operator concludes the customer never uploaded the
 *   document they are looking at on the counter.
 * - `APPLY_FILL` routes each attachment's signed-URL request by its `kind`. Send an original
 *   upload's id to `/api/derivatives/:id/signed-url` and the answer is a 404 — the file is
 *   reported unavailable while it sits on the profile.
 *
 * Same harness as `roaming.test.ts`: the background module registers its listener as an import
 * side effect, so a minimal in-memory `chrome` is built first and the real listener is driven the
 * way `chrome.runtime.sendMessage` would drive it.
 */

type StorageArea = {
  get: (keys?: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function fakeStorageArea(): StorageArea {
  const store = new Map<string, unknown>();
  return {
    get: async (keys) => {
      if (keys === undefined) return Object.fromEntries(store);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) if (store.has(key)) out[key] = store.get(key);
      return out;
    },
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
    },
    remove: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) store.delete(key);
    },
  };
}

const EXTENSION_ID = 'testextensionidaaaaaaaaaaaaaaaaa';
const TAB_ID = 7;

type MessageListener = (
  raw: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let messageListener: MessageListener | undefined;

const fetchMock = vi.fn();
/** Everything the worker forwarded to the content script, in order. */
let toContentScript: unknown[] = [];

beforeEach(() => {
  vi.resetModules();
  messageListener = undefined;
  toContentScript = [];
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      onInstalled: { addListener: () => undefined },
      onMessage: {
        addListener: (listener: MessageListener) => {
          messageListener = listener;
        },
      },
      onMessageExternal: { addListener: () => undefined },
    },
    tabs: {
      onRemoved: { addListener: () => undefined },
      query: vi.fn().mockResolvedValue([{ id: TAB_ID }]),
      sendMessage: vi.fn(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'PING') return { ok: true, data: { alive: true } };
        toContentScript.push(message);
        return { ok: true, data: { results: [] } };
      }),
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    storage: { session: fakeStorageArea(), local: fakeStorageArea() },
  });
});

async function dispatch(message: unknown): Promise<unknown> {
  await import('../src/background/index');
  if (!messageListener) throw new Error('background did not register a message listener');
  return new Promise((resolve) => {
    const returned = messageListener?.(message, { id: EXTENSION_ID }, resolve);
    expect(returned).toBe(true);
  });
}

function sessionStorage(): StorageArea {
  return (globalThis as unknown as { chrome: { storage: { session: StorageArea } } }).chrome.storage
    .session;
}

async function seedSession(): Promise<void> {
  await sessionStorage().set({
    session: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 60 * 60_000,
    },
  });
}

/** Three bytes stand in for a file's contents; base64 of 0x01 0x02 0x03 is "AQID". */
const ATTACHMENT_BYTES = new Uint8Array([1, 2, 3]);
const ATTACHMENT_BASE64 = 'AQID';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CUSTOMER_ID = '99999999-9999-4999-8999-999999999999';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const DERIVATIVE_ID = '44444444-4444-4444-8444-444444444444';

async function selectCustomer(patch: Record<string, unknown> = {}): Promise<void> {
  await sessionStorage().set({
    selectedCustomer: {
      id: CUSTOMER_ID,
      displayName: 'Sunita D.',
      customerCode: null,
      mobileLast4: '4321',
      ...patch,
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SOURCE_DOCUMENT = {
  id: DOCUMENT_ID,
  customerId: CUSTOMER_ID,
  filename: 'aadhaar_scan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 240_000,
  documentType: 'aadhaar_like',
  status: 'verified',
  label: null,
  expiresAt: null,
  createdAt: '2026-02-01T10:00:00.000Z',
};

const DERIVATIVE = {
  id: DERIVATIVE_ID,
  customerId: CUSTOMER_ID,
  sourceDocumentId: DOCUMENT_ID,
  toolType: 'photo',
  filename: 'aadhaar_photo_35x45.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 41_000,
  width: 413,
  height: 531,
  metadata: {},
  createdAt: '2026-03-04T09:30:00.000Z',
};

/** Answers each list route by URL, so the two parallel requests cannot be mixed up by order. */
function mockVaultRoutes(options: { documents?: unknown[]; derivatives?: unknown[] } = {}): void {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/documents?')) {
      return jsonResponse({ documents: options.documents ?? [], total: 0 });
    }
    if (url.includes('/api/derivatives?')) {
      return jsonResponse({ derivatives: options.derivatives ?? [] });
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

describe('LIST_CUSTOMER_DOCUMENTS', () => {
  it('returns the customer’s prepared files and original uploads as one list', async () => {
    await seedSession();
    await selectCustomer();
    mockVaultRoutes({ documents: [SOURCE_DOCUMENT], derivatives: [DERIVATIVE] });

    const response = (await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: CUSTOMER_ID,
    })) as { ok: true; data: { documents: Array<Record<string, unknown>> } };

    expect(response.ok).toBe(true);
    expect(response.data.documents).toHaveLength(2);

    // Newest first, across both halves.
    expect(response.data.documents.map((doc) => doc.id)).toEqual([DERIVATIVE_ID, DOCUMENT_ID]);

    expect(response.data.documents[0]).toMatchObject({
      id: DERIVATIVE_ID,
      kind: 'derivative',
      filename: 'aadhaar_photo_35x45.jpg',
      toolType: 'photo',
      width: 413,
      height: 531,
      // Inherited from the document it was prepared from, so the picker files it under Identity
      // rather than under "Other".
      documentType: 'aadhaar_like',
    });

    expect(response.data.documents[1]).toMatchObject({
      id: DOCUMENT_ID,
      kind: 'source_document',
      filename: 'aadhaar_scan.pdf',
      documentType: 'aadhaar_like',
      toolType: null,
      width: null,
      height: null,
    });

    const requested = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requested.some((url) => url.includes(`/api/documents?customerId=${CUSTOMER_ID}`))).toBe(
      true,
    );
    expect(
      requested.some((url) => url.includes(`/api/derivatives?customerId=${CUSTOMER_ID}`)),
    ).toBe(true);
  });

  it('still lists what it could read when one of the two routes refuses', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/documents?')) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', messageKey: 'errors.forbidden' } }),
          { status: 403 },
        );
      }
      return jsonResponse({ derivatives: [DERIVATIVE] });
    });

    const response = (await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: CUSTOMER_ID,
    })) as { ok: true; data: { documents: Array<Record<string, unknown>> } };

    expect(response.ok).toBe(true);
    expect(response.data.documents).toHaveLength(1);
    // No source document was readable, so there is no type to inherit — reported as unknown
    // rather than guessed.
    expect(response.data.documents[0]).toMatchObject({
      id: DERIVATIVE_ID,
      kind: 'derivative',
      documentType: null,
    });
  });

  it('reports a failure when neither route can be read, rather than an empty vault', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', messageKey: 'errors.forbidden' } }),
        { status: 403 },
      ),
    );

    const response = await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: CUSTOMER_ID,
    });

    expect(response).toMatchObject({ ok: false, messageKey: 'errors.forbidden' });
  });

  it('refuses a customer other than the one selected at this counter', async () => {
    await seedSession();
    await selectCustomer();
    mockVaultRoutes({ documents: [SOURCE_DOCUMENT] });

    const response = await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: OTHER_CUSTOMER_ID,
    });

    expect(response).toMatchObject({ ok: false, error: 'customer_not_selected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a roaming customer whose consent window is not open', async () => {
    await seedSession();
    await selectCustomer({ isRoaming: true, accessStatus: 'locked', grantExpiresAt: null });
    mockVaultRoutes({ documents: [SOURCE_DOCUMENT] });

    const response = await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: CUSTOMER_ID,
    });

    expect(response).toMatchObject({ ok: false, error: 'roaming_access_locked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists a roaming customer’s files once the grant is live', async () => {
    await seedSession();
    await selectCustomer({
      isRoaming: true,
      accessStatus: 'granted',
      grantExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    mockVaultRoutes({ documents: [SOURCE_DOCUMENT] });

    const response = (await dispatch({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId: CUSTOMER_ID,
    })) as { ok: true; data: { documents: unknown[] } };

    expect(response.ok).toBe(true);
    expect(response.data.documents).toHaveLength(1);
  });
});

/** A signed URL plus the three bytes behind it, keyed by which route asked. */
function mockAttachmentRoutes(): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith(`/api/documents/${DOCUMENT_ID}/signed-url`) && init?.method === 'POST') {
      return jsonResponse({
        url: 'https://storage.example/original.pdf?token=abc',
        mimeType: 'application/pdf',
        filename: 'aadhaar_scan.pdf',
      });
    }
    if (url.endsWith(`/api/derivatives/${DERIVATIVE_ID}/signed-url`) && init?.method === 'POST') {
      return jsonResponse({
        url: 'https://storage.example/prepared.jpg?token=abc',
        mimeType: 'image/jpeg',
        filename: 'aadhaar_photo_35x45.jpg',
      });
    }
    if (url.startsWith('https://storage.example/')) {
      return new Response(ATTACHMENT_BYTES);
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

describe('APPLY_FILL — attachment routing by kind', () => {
  it('fetches an original upload through the documents route', async () => {
    await seedSession();
    mockAttachmentRoutes();

    const response = await dispatch({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [{ signature: 'input#proof|file', targetId: DOCUMENT_ID, kind: 'source_document' }],
    });

    expect(response).toMatchObject({ ok: true });

    const signedUrlCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/signed-url'));
    expect(signedUrlCalls).toEqual([
      `http://localhost:3000/api/documents/${DOCUMENT_ID}/signed-url`,
    ]);

    // The page gets bytes and a filename, and never the document's id.
    expect(toContentScript).toHaveLength(1);
    const forwarded = toContentScript[0] as Record<string, unknown>;
    expect(forwarded.attachments).toBeUndefined();
    expect(forwarded.fileInstructions).toEqual([
      {
        signature: 'input#proof|file',
        filename: 'aadhaar_scan.pdf',
        mimeType: 'application/pdf',
        dataBase64: ATTACHMENT_BASE64,
      },
    ]);
  });

  it('fetches a prepared file through the derivatives route', async () => {
    await seedSession();
    mockAttachmentRoutes();

    await dispatch({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [{ signature: 'input#photo|file', targetId: DERIVATIVE_ID, kind: 'derivative' }],
    });

    const signedUrlCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/signed-url'));
    expect(signedUrlCalls).toEqual([
      `http://localhost:3000/api/derivatives/${DERIVATIVE_ID}/signed-url`,
    ]);
  });

  it('treats an omitted kind as a derivative, so an older panel build still attaches', async () => {
    await seedSession();
    mockAttachmentRoutes();

    await dispatch({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [{ signature: 'input#photo|file', derivativeId: DERIVATIVE_ID }],
    });

    const signedUrlCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/signed-url'));
    expect(signedUrlCalls).toEqual([
      `http://localhost:3000/api/derivatives/${DERIVATIVE_ID}/signed-url`,
    ]);
  });

  it('reports the box as failed when its file cannot be fetched, and still fills the rest', async () => {
    await seedSession();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/signed-url')) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', messageKey: 'errors.not_found' } }),
          { status: 404 },
        );
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const response = (await dispatch({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [{ signature: 'input#proof|file', targetId: DOCUMENT_ID, kind: 'source_document' }],
    })) as { ok: true; data: { results: unknown[] } };

    expect(response.ok).toBe(true);
    expect(response.data.results).toEqual([
      { signature: 'input#proof|file', action: 'failed', error: 'attachment_unavailable' },
    ]);
    // Nothing to attach reached the page, but the fill itself still ran.
    expect(toContentScript).toHaveLength(1);
    expect((toContentScript[0] as Record<string, unknown>).fileInstructions).toBeUndefined();
  });
});
