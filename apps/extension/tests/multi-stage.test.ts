import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the multi-stage form journey (main form → annexure → acknowledgement).
 *
 * Two behaviours worth pinning, because both fail silently and the failure mode is a database
 * full of disconnected rows rather than a thrown error:
 *
 * - `CREATE_APPLICATION` must not create a second `applications` row for the same tab. An
 *   operator can land on the stage-1 "done" screen more than once in one journey (a re-fill,
 *   `Back to review` and forward again), and each one must hand back the same application.
 * - `REQUEST_MAPPING` must carry the application id forward — either the one the side panel
 *   names explicitly, or the one this tab already linked earlier in the same journey — so a
 *   later stage's `fill_sessions` row lands under the same application instead of starting an
 *   unlinked one.
 *
 * Same harness as `customer-documents.test.ts`: the background module registers its listener as
 * an import side effect, so a minimal in-memory `chrome` is built first and the real listener is
 * driven the way `chrome.runtime.sendMessage` would drive it.
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
      query: vi.fn().mockResolvedValue([{ id: TAB_ID }]),
      create: vi.fn().mockResolvedValue({ id: TAB_ID + 1 }),
      sendMessage: vi.fn(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'PING') return { ok: true, data: { alive: true } };
        if (message.type === 'DETECT_FIELDS') {
          return {
            ok: true,
            data: {
              page: {
                origin: 'https://serviceonline.bihar.gov.in',
                path: '/service/serviceApply.do',
                title: 'RTPS annexure',
                blockedFrames: 0,
              },
              fields: [],
            },
          };
        }
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

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

async function selectCustomer(): Promise<void> {
  await sessionStorage().set({
    selectedCustomer: {
      id: CUSTOMER_ID,
      displayName: 'Pritam Kumar',
      customerCode: null,
      mobileLast4: '4321',
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Every request body this test's fetch mock received, keyed by the path it was sent to. */
function requestBodiesTo(path: string): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).includes(path))
    .map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body ?? '{}')));
}

describe('CREATE_APPLICATION — idempotent per tab', () => {
  it('creates one application row and hands the same id back on a second call', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/applications')) {
        return jsonResponse({ application: { id: APPLICATION_ID } }, 201);
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const first = (await dispatch({
      type: 'CREATE_APPLICATION',
      title: 'Income certificate — Pritam Kumar',
    })) as { ok: true; data: { id: string; existing: boolean } };

    expect(first).toMatchObject({ ok: true, data: { id: APPLICATION_ID, existing: false } });

    const second = (await dispatch({
      type: 'CREATE_APPLICATION',
      title: 'Income certificate — Pritam Kumar',
    })) as { ok: true; data: { id: string; existing: boolean } };

    expect(second).toMatchObject({ ok: true, data: { id: APPLICATION_ID, existing: true } });

    // Only the first call actually reached the server — the second was answered from this tab's
    // own memory, which is also what keeps a duplicate row from ever being created.
    const applicationRequests = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith('/api/applications'),
    );
    expect(applicationRequests).toHaveLength(1);
  });

  it('never sends a null fillSessionId or portalUrl — both are optional fields, not nullable ones', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/applications')) {
        return jsonResponse({ application: { id: APPLICATION_ID } }, 201);
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await dispatch({ type: 'CREATE_APPLICATION', title: 'Income certificate' });

    const [body] = requestBodiesTo('/api/applications');
    expect(body).not.toHaveProperty('fillSessionId');
    expect(body).not.toHaveProperty('portalUrl');
  });
});

describe('REQUEST_MAPPING — carries the application id forward across stages', () => {
  it('sends the applicationId the side panel names explicitly', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/forms/map')) {
        return jsonResponse({
          fillSessionId: 'fill-session-1',
          mappings: [],
          fillOrder: [],
          summary: {},
          documentSuggestions: [],
          values: {},
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await dispatch({ type: 'DETECT_FIELDS' });
    const response = await dispatch({ type: 'REQUEST_MAPPING', applicationId: APPLICATION_ID });

    expect(response).toMatchObject({ ok: true });
    const [body] = requestBodiesTo('/api/forms/map');
    expect(body).toMatchObject({ customerId: CUSTOMER_ID, applicationId: APPLICATION_ID });
  });

  it('remembers the application id from an earlier CREATE_APPLICATION on the same tab, even without one in the message', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/applications')) {
        return jsonResponse({ application: { id: APPLICATION_ID } }, 201);
      }
      if (url.endsWith('/api/forms/map')) {
        return jsonResponse({
          fillSessionId: 'fill-session-2',
          mappings: [],
          fillOrder: [],
          summary: {},
          documentSuggestions: [],
          values: {},
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    // Stage 1: the operator saves the application once the main form is filled.
    await dispatch({ type: 'CREATE_APPLICATION', title: 'Income certificate' });

    // Stage 2: a fresh scan of the annexure page, with no applicationId in the message at all.
    await dispatch({ type: 'DETECT_FIELDS' });
    await dispatch({ type: 'REQUEST_MAPPING' });

    const [mapCallBody] = requestBodiesTo('/api/forms/map');
    expect(mapCallBody).toMatchObject({ applicationId: APPLICATION_ID });
  });

  it('omits applicationId on the first stage of a journey, before anything has been saved', async () => {
    await seedSession();
    await selectCustomer();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/forms/map')) {
        return jsonResponse({
          fillSessionId: 'fill-session-1',
          mappings: [],
          fillOrder: [],
          summary: {},
          documentSuggestions: [],
          values: {},
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await dispatch({ type: 'DETECT_FIELDS' });
    await dispatch({ type: 'REQUEST_MAPPING' });

    const [body] = requestBodiesTo('/api/forms/map');
    expect(body).not.toHaveProperty('applicationId');
  });
});

describe('CREATE_APPLICATION — roaming customers', () => {
  it('refuses before reaching the server, even with a live grant', async () => {
    await seedSession();
    await sessionStorage().set({
      selectedCustomer: {
        id: CUSTOMER_ID,
        displayName: 'Pritam Kumar',
        customerCode: null,
        mobileLast4: '4321',
        isRoaming: true,
        accessStatus: 'granted',
        grantExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    });

    const response = await dispatch({ type: 'CREATE_APPLICATION', title: 'Income certificate' });

    // A grant never covers `applications` (migration 0024); the server would only answer 404.
    expect(response).toMatchObject({ ok: false, error: 'roaming_application_unsupported' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('page messages go to the top frame only', () => {
  it('addresses DETECT_FIELDS to frame 0, so an iframe cannot answer for the page', async () => {
    await seedSession();

    await dispatch({ type: 'DETECT_FIELDS' });

    const sendMessage = (
      globalThis as unknown as {
        chrome: { tabs: { sendMessage: ReturnType<typeof vi.fn> } };
      }
    ).chrome.tabs.sendMessage;
    expect(sendMessage).toHaveBeenCalled();
    for (const call of sendMessage.mock.calls) {
      expect(call[2]).toEqual({ frameId: 0 });
    }
  });
});

describe('OPEN_DASHBOARD — stays on the dashboard', () => {
  function tabsCreate(): ReturnType<typeof vi.fn> {
    return (globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } })
      .chrome.tabs.create;
  }

  it('opens an application on the dashboard from the "View" link', async () => {
    const response = await dispatch({
      type: 'OPEN_DASHBOARD',
      path: `/applications/${APPLICATION_ID}`,
    });

    expect(response).toMatchObject({ ok: true });
    expect(tabsCreate()).toHaveBeenCalledWith({
      url: `http://localhost:3000/applications/${APPLICATION_ID}`,
    });
  });

  it.each([
    '@evil.example/',
    '//evil.example/',
    String.raw`/\evil.example/`,
    'applications/x',
    '.evil.example',
  ])(
    'refuses %s, which would leave the dashboard origin',
    async (path) => {
      await import('../src/background/index');
      const reply = vi.fn();
      messageListener?.({ type: 'OPEN_DASHBOARD', path }, { id: EXTENSION_ID }, reply);

      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      expect(tabsCreate()).not.toHaveBeenCalled();
    },
  );
});
