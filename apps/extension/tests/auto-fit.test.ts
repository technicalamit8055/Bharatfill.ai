import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Auto-fit, worker and offscreen halves (docs/EXTENSION.md §6c).
 *
 * What is pinned here is the part that fails silently rather than loudly:
 *
 * - A confirmed fitted copy is what gets attached — and if it has gone, the box fails. It never
 *   falls back to downloading the original, which is the file the portal would refuse.
 * - The worker re-plans on the real download and does not spin up the offscreen document for a
 *   file that already fits or can never fit.
 * - The offscreen document answers the worker and nobody else, holds a copy for one use, and
 *   reports an over-limit result as a failure instead of handing it over.
 *
 * Same harness as `customer-documents.test.ts`: a minimal in-memory `chrome`, then the real
 * listener driven the way `chrome.runtime.sendMessage` would drive it.
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
const WORKER_URL = `chrome-extension://${EXTENSION_ID}/background.js`;
const PANEL_URL = `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`;

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const FIT_TOKEN = '55555555-5555-4555-8555-555555555555';
const KB = 1024;

type MessageListener = (
  raw: unknown,
  sender: { id?: string; url?: string; tab?: unknown },
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let messageListener: MessageListener | undefined;
const fetchMock = vi.fn();
let toContentScript: unknown[] = [];
/** What the worker sent towards the offscreen document, in order. */
let toOffscreen: Array<Record<string, unknown>> = [];
let offscreenOpen = false;
let offscreenReply: (request: Record<string, unknown>) => unknown = () => undefined;
const createDocument = vi.fn();

beforeEach(() => {
  vi.resetModules();
  messageListener = undefined;
  toContentScript = [];
  toOffscreen = [];
  offscreenOpen = false;
  offscreenReply = () => undefined;
  fetchMock.mockReset();
  createDocument.mockReset();
  createDocument.mockImplementation(async () => {
    offscreenOpen = true;
  });
  vi.stubGlobal('fetch', fetchMock);

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getContexts: vi.fn(async () =>
        offscreenOpen ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [],
      ),
      sendMessage: vi.fn(async (request: Record<string, unknown>) => {
        toOffscreen.push(request);
        return offscreenReply(request);
      }),
      onInstalled: { addListener: () => undefined },
      onMessage: {
        addListener: (listener: MessageListener) => {
          messageListener = listener;
        },
      },
      onMessageExternal: { addListener: () => undefined },
    },
    offscreen: {
      Reason: { BLOBS: 'BLOBS', WORKERS: 'WORKERS' },
      createDocument,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The original behind the documents route: `size` bytes of a file called `filename`. */
function mockOriginal(filename: string, mimeType: string, size: number): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith(`/api/documents/${DOCUMENT_ID}/signed-url`) && init?.method === 'POST') {
      return jsonResponse({
        url: 'https://storage.example/original?token=abc',
        mimeType,
        filename,
      });
    }
    if (url.startsWith('https://storage.example/')) return new Response(new Uint8Array(size));
    throw new Error(`unexpected request: ${url}`);
  });
}

function signedUrlCalls(): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/signed-url'));
}

async function dispatchToWorker(message: unknown): Promise<unknown> {
  await import('../src/background/index');
  if (!messageListener) throw new Error('background did not register a message listener');
  return new Promise((resolve) => {
    const returned = messageListener?.(message, { id: EXTENSION_ID }, resolve);
    expect(returned).toBe(true);
  });
}

describe('PREPARE_AUTO_FIT — worker', () => {
  it('reports a file that already fits without opening the offscreen document', async () => {
    await seedSession();
    mockOriginal('photo.jpg', 'image/jpeg', 35 * KB);

    const response = await dispatchToWorker({
      type: 'PREPARE_AUTO_FIT',
      targetId: DOCUMENT_ID,
      kind: 'source_document',
      accept: '.jpg,.jpeg',
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
    });

    expect(response).toEqual({ ok: true, data: { status: 'already_fits' } });
    expect(createDocument).not.toHaveBeenCalled();
    expect(toOffscreen).toHaveLength(0);
    // The download still went through the audited route.
    expect(signedUrlCalls()).toEqual([
      `http://localhost:3000/api/documents/${DOCUMENT_ID}/signed-url`,
    ]);
  });

  it('refuses to turn a PDF into an image for a JPEG-only box', async () => {
    await seedSession();
    mockOriginal('aadhaar.pdf', 'application/pdf', 300 * KB);

    const response = await dispatchToWorker({
      type: 'PREPARE_AUTO_FIT',
      targetId: DOCUMENT_ID,
      kind: 'source_document',
      accept: '.jpg',
      minBytes: null,
      maxBytes: 200 * KB,
    });

    expect(response).toEqual({
      ok: true,
      data: { status: 'cannot_fit', reason: 'type_not_accepted' },
    });
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('sends an oversized PDF to the offscreen document and relays only its summary', async () => {
    await seedSession();
    mockOriginal('aadhaar.pdf', 'application/pdf', 1228 * KB);
    const fitted = {
      status: 'fitted',
      token: FIT_TOKEN,
      filename: 'aadhaar.pdf',
      mimeType: 'application/pdf',
      previewUrl: `blob:chrome-extension://${EXTENSION_ID}/preview`,
      width: null,
      height: null,
      report: {
        fromBytes: 1228 * KB,
        toBytes: 186 * KB,
        converted: false,
        scale: null,
        padded: false,
        rasterised: true,
        dpi: 100,
      },
    };
    offscreenReply = () => ({ ok: true, data: fitted });

    const response = await dispatchToWorker({
      type: 'PREPARE_AUTO_FIT',
      targetId: DOCUMENT_ID,
      kind: 'source_document',
      accept: 'application/pdf',
      minBytes: null,
      maxBytes: 200 * KB,
    });

    expect(response).toEqual({ ok: true, data: fitted });
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'src/offscreen/index.html', reasons: ['BLOBS', 'WORKERS'] }),
    );
    expect(toOffscreen).toHaveLength(1);
    expect(toOffscreen[0]).toMatchObject({
      target: 'assistigo-offscreen',
      type: 'AUTO_FIT_RUN',
      job: { action: 'pdf', filename: 'aadhaar.pdf', maxBytes: 200 * KB },
      sourceMimeType: 'application/pdf',
    });
    // The panel's answer carries no bytes.
    expect(JSON.stringify(response)).not.toContain('dataBase64');
  });

  it('treats a malformed offscreen answer as a failed fit, not as a fitted file', async () => {
    await seedSession();
    mockOriginal('photo.png', 'image/png', 150 * KB);
    offscreenReply = () => ({ ok: true, data: { status: 'fitted', token: 'not-a-uuid' } });

    const response = await dispatchToWorker({
      type: 'PREPARE_AUTO_FIT',
      targetId: DOCUMENT_ID,
      kind: 'source_document',
      accept: '.jpg',
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
    });

    expect(response).toEqual({
      ok: true,
      data: { status: 'cannot_fit', reason: 'processing_failed' },
    });
  });
});

describe('APPLY_FILL — confirmed fitted copies', () => {
  it('attaches the fitted copy and does not download the original again', async () => {
    await seedSession();
    offscreenOpen = true;
    offscreenReply = (request) =>
      request.type === 'AUTO_FIT_TAKE'
        ? { ok: true, data: { filename: 'photo.jpg', mimeType: 'image/jpeg', dataBase64: 'AQID' } }
        : undefined;

    const response = await dispatchToWorker({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [
        {
          signature: 'input#photo|file',
          targetId: DOCUMENT_ID,
          kind: 'source_document',
          fitToken: FIT_TOKEN,
        },
      ],
    });

    expect(response).toMatchObject({ ok: true });
    expect(signedUrlCalls()).toEqual([]);
    expect(toOffscreen).toEqual([
      { target: 'assistigo-offscreen', type: 'AUTO_FIT_TAKE', token: FIT_TOKEN },
    ]);
    expect((toContentScript[0] as Record<string, unknown>).fileInstructions).toEqual([
      {
        signature: 'input#photo|file',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        dataBase64: 'AQID',
      },
    ]);
  });

  it('fails the box when the fitted copy has gone, instead of falling back to the original', async () => {
    await seedSession();
    offscreenOpen = false;

    const response = (await dispatchToWorker({
      type: 'APPLY_FILL',
      instructions: [],
      attachments: [
        {
          signature: 'input#photo|file',
          targetId: DOCUMENT_ID,
          kind: 'source_document',
          fitToken: FIT_TOKEN,
        },
      ],
    })) as { ok: true; data: { results: unknown[] } };

    expect(response.data.results).toEqual([
      { signature: 'input#photo|file', action: 'failed', error: 'attach_fit_expired' },
    ]);
    expect(signedUrlCalls()).toEqual([]);
    expect((toContentScript[0] as Record<string, unknown>).fileInstructions).toBeUndefined();
  });
});

describe('DISCARD_AUTO_FIT — worker', () => {
  it('never opens the offscreen document just to empty it', async () => {
    await seedSession();
    const response = await dispatchToWorker({ type: 'DISCARD_AUTO_FIT', token: FIT_TOKEN });
    expect(response).toEqual({ ok: true, data: null });
    expect(createDocument).not.toHaveBeenCalled();
    expect(toOffscreen).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Offscreen document
// ---------------------------------------------------------------------------

const encodeToWindow = vi.fn();
const compressPdf = vi.fn();

vi.mock('@assistigo/document-tools/browser/image', () => ({
  decodeImage: vi.fn(async () => ({
    source: {},
    width: 800,
    height: 1000,
    release: () => undefined,
  })),
  renderImage: vi.fn(() => ({ width: 800, height: 1000 })),
  encodeToWindow: (...args: unknown[]) => encodeToWindow(...args),
}));
vi.mock('@assistigo/document-tools/browser/pdf', () => ({
  compressPdf: (...args: unknown[]) => compressPdf(...args),
}));

async function dispatchToOffscreen(
  message: unknown,
  sender: { id?: string; url?: string; tab?: unknown } = { id: EXTENSION_ID, url: WORKER_URL },
): Promise<{ returned: boolean | undefined; response: Promise<unknown> }> {
  await import('../src/offscreen/main');
  if (!messageListener) throw new Error('offscreen did not register a message listener');
  let resolve: (value: unknown) => void = () => undefined;
  const response = new Promise((done) => {
    resolve = done;
  });
  const returned = messageListener(message, sender, resolve);
  return { returned, response };
}

const IMAGE_JOB = {
  target: 'assistigo-offscreen',
  type: 'AUTO_FIT_RUN',
  job: {
    action: 'image',
    outputMimeType: 'image/jpeg',
    filename: 'photo.jpg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    converted: true,
  },
  sourceMimeType: 'image/png',
  dataBase64: 'AQID',
} as const;

describe('offscreen document', () => {
  beforeEach(() => {
    encodeToWindow.mockReset();
    compressPdf.mockReset();
    URL.createObjectURL = vi.fn(() => `blob:chrome-extension://${EXTENSION_ID}/preview`);
    URL.revokeObjectURL = vi.fn();
  });

  it('leaves the worker’s own traffic alone', async () => {
    const { returned } = await dispatchToOffscreen(
      { type: 'GET_SESSION' },
      { id: EXTENSION_ID, url: PANEL_URL },
    );
    expect(returned).toBeUndefined();
  });

  it('answers the worker only — a side panel asking for bytes is refused', async () => {
    const { response } = await dispatchToOffscreen(
      { target: 'assistigo-offscreen', type: 'AUTO_FIT_TAKE', token: FIT_TOKEN },
      { id: EXTENSION_ID, url: PANEL_URL },
    );
    expect(await response).toEqual({ ok: false, error: 'invalid_sender' });
  });

  it('fits an image, hands the copy over once, and then forgets it', async () => {
    encodeToWindow.mockResolvedValue({
      bytes: new Uint8Array(48 * KB),
      mimeType: 'image/jpeg',
      width: 560,
      height: 700,
      quality: 0.8,
      scale: 0.7,
      padded: false,
      overLimit: false,
    });

    const run = await dispatchToOffscreen(IMAGE_JOB);
    expect(run.returned).toBe(true);
    const fitted = (await run.response) as {
      ok: true;
      data: { status: string; token: string; report: Record<string, unknown> };
    };
    expect(fitted.data).toMatchObject({
      status: 'fitted',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      width: 560,
      height: 700,
      report: { fromBytes: 3, toBytes: 48 * KB, converted: true, scale: 0.7, rasterised: false },
    });
    expect(encodeToWindow).toHaveBeenCalledWith(expect.anything(), {
      mimeType: 'image/jpeg',
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
    });

    const take = { target: 'assistigo-offscreen', type: 'AUTO_FIT_TAKE', token: fitted.data.token };
    const first = (await (
      await dispatchToOffscreen(take)
    ).response) as {
      ok: true;
      data: { filename: string; dataBase64: string };
    };
    expect(first.ok).toBe(true);
    expect(first.data.filename).toBe('photo.jpg');
    expect(first.data.dataBase64.length).toBeGreaterThan(0);

    expect(await (await dispatchToOffscreen(take)).response).toEqual({
      ok: false,
      error: 'fit_expired',
    });
  });

  it('reports a result still over the limit as a failure and holds nothing', async () => {
    compressPdf.mockResolvedValue({
      bytes: new Uint8Array(260 * KB),
      dpi: 72,
      jpegQuality: 0.45,
      overLimit: true,
      rasterised: true,
    });

    const { response } = await dispatchToOffscreen({
      target: 'assistigo-offscreen',
      type: 'AUTO_FIT_RUN',
      job: { action: 'pdf', filename: 'aadhaar.pdf', maxBytes: 200 * KB },
      sourceMimeType: 'application/pdf',
      dataBase64: 'AQID',
    });

    expect(await response).toEqual({
      ok: true,
      data: { status: 'cannot_fit', reason: 'still_over_limit' },
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('turns an encoder crash into a failed fit, with nothing about the file in the answer', async () => {
    encodeToWindow.mockRejectedValue(new Error('decode failed for aadhaar-1234-5678.png'));
    const { response } = await dispatchToOffscreen(IMAGE_JOB);
    const answer = await response;
    expect(answer).toEqual({
      ok: true,
      data: { status: 'cannot_fit', reason: 'processing_failed' },
    });
    expect(JSON.stringify(answer)).not.toContain('aadhaar');
  });
});
