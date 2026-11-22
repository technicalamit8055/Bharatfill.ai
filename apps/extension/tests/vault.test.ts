import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The citizen's BharatDoc vault in the side panel (docs/VAULT_BRIDGE_DESIGN.md §4): the service
 * worker's VAULT_* handlers, driven through the real registered listener as in roaming.test.ts.
 *
 * What must hold: each call reaches the right route with the operator's token; a content script
 * (a sender with a tab) is refused before any request; document bytes come back for an in-memory
 * preview and nothing is written to extension storage. Made-up ids and numbers only.
 */

type StorageArea = {
  get: (keys?: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function fakeStorageArea(): StorageArea & { size: () => number } {
  const store = new Map<string, unknown>();
  return {
    size: () => store.size,
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
const MOBILE = '9000000001';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const GRANT_ID = '44444444-4444-4444-8444-444444444444';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';

type Sender = { id?: string; tab?: { id: number } };
type MessageListener = (
  raw: unknown,
  sender: Sender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let messageListener: MessageListener | undefined;
let local: ReturnType<typeof fakeStorageArea>;
let session: ReturnType<typeof fakeStorageArea>;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  messageListener = undefined;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  local = fakeStorageArea();
  session = fakeStorageArea();

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
    tabs: { onRemoved: { addListener: () => undefined }, query: vi.fn().mockResolvedValue([]) },
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    storage: { session, local },
  });

  await session.set({
    session: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 60 * 60_000,
    },
  });
});

async function dispatch(message: unknown, sender: Sender = { id: EXTENSION_ID }) {
  await import('../src/background/index');
  if (!messageListener) throw new Error('background did not register a message listener');
  return new Promise<unknown>((resolve) => {
    const returned = messageListener?.(message, sender, resolve);
    // A refused message answers synchronously; an accepted one keeps the channel open.
    if (returned !== true) return;
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('VAULT_REQUEST', () => {
  it('asks the lookup route with the operator token and returns the request to poll', async () => {
    fetchMock.mockResolvedValueOnce(json({ requestId: REQUEST_ID, expiresAt: 'later' }));
    const response = await dispatch({ type: 'VAULT_REQUEST', mobile: MOBILE });
    expect(response).toEqual({ ok: true, data: { requestId: REQUEST_ID, expiresAt: 'later' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/vault/lookup');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init.body))).toEqual({ mobile: MOBILE });
  });

  it('is refused from a content script before any request is made', async () => {
    const response = await dispatch(
      { type: 'VAULT_REQUEST', mobile: MOBILE },
      { id: EXTENSION_ID, tab: { id: 7 } },
    );
    expect(response).toMatchObject({ ok: false, error: 'invalid_message' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('VAULT_UNLOCK', () => {
  it('only accepts a 6-digit code', async () => {
    const response = await dispatch({ type: 'VAULT_UNLOCK', mobile: MOBILE, code: '1234' });
    expect(response).toMatchObject({ ok: false, error: 'invalid_message' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the server reason through when the code is wrong', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'PERMISSION_DENIED', messageKey: 'errors.vault.code_wrong' },
        }),
        { status: 403 },
      ),
    );
    const response = await dispatch({ type: 'VAULT_UNLOCK', mobile: MOBILE, code: '849201' });
    expect(response).toMatchObject({ ok: false, messageKey: 'errors.vault.code_wrong' });
  });
});

describe('VAULT_VIEW_DOCUMENT', () => {
  it('returns the bytes for an in-memory preview and stores nothing', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );
    const localBefore = local.size();
    const sessionBefore = session.size();

    const response = await dispatch({
      type: 'VAULT_VIEW_DOCUMENT',
      grantId: GRANT_ID,
      documentId: DOCUMENT_ID,
    });
    expect(response).toEqual({
      ok: true,
      data: { mimeType: 'application/pdf', dataBase64: 'JVBERg==' },
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      `http://localhost:3000/api/vault/grants/${GRANT_ID}/documents/${DOCUMENT_ID}/file?purpose=viewed`,
    );
    expect(local.size()).toBe(localBefore);
    expect(session.size()).toBe(sessionBefore);
  });
});

describe('VAULT_END_GRANT', () => {
  it('ends access on the server', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await dispatch({ type: 'VAULT_END_GRANT', grantId: GRANT_ID });
    expect(response).toEqual({ ok: true, data: null });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:3000/api/vault/grants/${GRANT_ID}/end`);
    expect(init.method).toBe('POST');
  });
});
