import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the roaming message handlers in the service worker (§7.4.3, migration 0024).
 *
 * The background module registers its `chrome.runtime.onMessage` listener as a side effect of
 * being imported, and talks to `chrome.storage.session` and the network rather than exposing its
 * internal `route()` function. So this test builds a minimal in-memory `chrome` before import,
 * captures the registered listener, and drives it exactly the way `chrome.runtime.sendMessage`
 * would — real behaviour, not a re-implementation of it.
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

type MessageListener = (
  raw: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let messageListener: MessageListener | undefined;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  messageListener = undefined;
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
      query: vi.fn().mockResolvedValue([]),
    },
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    storage: {
      session: fakeStorageArea(),
      local: fakeStorageArea(),
    },
  });
});

/** Dispatches a message through the real registered listener and awaits its response. */
async function dispatch(message: unknown): Promise<unknown> {
  await import('../src/background/index');
  if (!messageListener) throw new Error('background did not register a message listener');
  return new Promise((resolve) => {
    const returned = messageListener?.(message, { id: EXTENSION_ID }, resolve);
    expect(returned).toBe(true); // the listener must keep the channel open for the async response
  });
}

/** A signed-in session far from expiry, so `apiFetch` never tries to refresh it. */
async function seedSession(): Promise<void> {
  const chromeGlobal = (globalThis as unknown as { chrome: { storage: { session: StorageArea } } })
    .chrome;
  await chromeGlobal.storage.session.set({
    session: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 60 * 60_000,
    },
  });
}

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('REQUEST_ROAMING_OTP', () => {
  it('posts the request to the roaming OTP endpoint with a bearer token and returns the masked mobile', async () => {
    await seedSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ mobileLast4: '3210', expiresInSeconds: 300 }));

    const response = await dispatch({
      type: 'REQUEST_ROAMING_OTP',
      customerId: CUSTOMER_ID,
      purpose: 'form_filling',
      durationMinutes: 120,
    });

    expect(response).toEqual({
      ok: true,
      data: { mobileLast4: '3210', expiresInSeconds: 300 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:3000/api/customers/${CUSTOMER_ID}/roaming/request-otp`);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init.body))).toMatchObject({
      purpose: 'form_filling',
      durationMinutes: 120,
      channel: 'whatsapp',
    });
  });

  it('surfaces a failure as a typed error rather than throwing across the message boundary', async () => {
    await seedSession();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'RATE_LIMITED', messageKey: 'errors.roaming_otp_rate_limited' },
        }),
        { status: 429 },
      ),
    );

    const response = await dispatch({
      type: 'REQUEST_ROAMING_OTP',
      customerId: CUSTOMER_ID,
      purpose: 'form_filling',
      durationMinutes: 120,
    });

    expect(response).toMatchObject({
      ok: false,
      messageKey: 'errors.roaming_otp_rate_limited',
    });
  });
});

describe('VERIFY_ROAMING_OTP', () => {
  it('verifies the code, returns the session, and marks the selected customer as granted', async () => {
    await seedSession();

    const chromeGlobal = (
      globalThis as unknown as { chrome: { storage: { session: StorageArea } } }
    ).chrome;
    await chromeGlobal.storage.session.set({
      selectedCustomer: {
        id: CUSTOMER_ID,
        displayName: 'Rahul S.',
        customerCode: null,
        mobileLast4: '3210',
        isRoaming: true,
        accessStatus: 'locked',
        grantExpiresAt: null,
      },
    });

    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        session: {
          grantId: '22222222-2222-4222-8222-222222222222',
          purpose: 'form_filling',
          targetSchemeSlug: null,
          authMethod: 'otp',
          grantedAt: new Date().toISOString(),
          expiresAt,
        },
      }),
    );

    const response = await dispatch({
      type: 'VERIFY_ROAMING_OTP',
      customerId: CUSTOMER_ID,
      otp: '849201',
    });

    expect(response).toMatchObject({ ok: true, data: { authMethod: 'otp', expiresAt } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:3000/api/customers/${CUSTOMER_ID}/roaming/verify-otp`);
    expect(JSON.parse(String(init.body))).toEqual({ otp: '849201' });

    // The stored selection unlocks without a second round trip to GET_SESSION.
    const stored = await chromeGlobal.storage.session.get('selectedCustomer');
    expect(stored.selectedCustomer).toMatchObject({
      id: CUSTOMER_ID,
      accessStatus: 'granted',
      grantExpiresAt: expiresAt,
    });
  });

  it('does not touch the stored selection when the verified customer is not the one selected', async () => {
    await seedSession();

    const chromeGlobal = (
      globalThis as unknown as { chrome: { storage: { session: StorageArea } } }
    ).chrome;
    await chromeGlobal.storage.session.set({
      selectedCustomer: {
        id: '99999999-9999-4999-8999-999999999999',
        displayName: 'Someone Else',
        customerCode: null,
        mobileLast4: '0000',
      },
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        session: {
          grantId: '22222222-2222-4222-8222-222222222222',
          purpose: 'form_filling',
          targetSchemeSlug: null,
          authMethod: 'otp',
          grantedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );

    await dispatch({ type: 'VERIFY_ROAMING_OTP', customerId: CUSTOMER_ID, otp: '849201' });

    const stored = await chromeGlobal.storage.session.get('selectedCustomer');
    expect(stored.selectedCustomer).toEqual({
      id: '99999999-9999-4999-8999-999999999999',
      displayName: 'Someone Else',
      customerCode: null,
      mobileLast4: '0000',
    });
  });

  it('rejects an incorrect code without minting a session', async () => {
    await seedSession();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'CONFLICT', messageKey: 'errors.roaming_otp_incorrect' } }),
        { status: 409 },
      ),
    );

    const response = await dispatch({
      type: 'VERIFY_ROAMING_OTP',
      customerId: CUSTOMER_ID,
      otp: '000000',
    });

    expect(response).toMatchObject({ ok: false, messageKey: 'errors.roaming_otp_incorrect' });
  });
});
