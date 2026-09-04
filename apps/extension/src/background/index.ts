/**
 * Service worker.
 * Master spec §15.1.2, §15.4.
 *
 * The only component that talks to the API, and the only one that holds a token. It has no DOM
 * access by design, so a bug here cannot read or write a page.
 *
 * Flow (docs/EXTENSION.md §4):
 *   side panel → DETECT_FIELDS → content script → metadata
 *   metadata   → POST /api/forms/map → mapping proposal → side panel
 *   operator presses Fill
 *   side panel → APPLY_FILL (values, once) → content script → per-field results
 *   results    → PATCH /api/fill-sessions/:id
 */

import type { RoamingAccessView } from '@assistigo/core';
import { ApiError, apiFetch, pairWithCode } from '../shared/api';
import {
  fail,
  ok,
  parseMessage,
  type CustomerDocument,
  type CustomerSummary,
  type Message,
  type RoamingSearchResult,
  type SessionState,
} from '../shared/messages';
import {
  clearAllSensitive,
  recentCustomersStore,
  selectedCustomerStore,
  sessionStore,
  settingsStore,
} from '../shared/storage';
import { MAX_ATTACHMENT_BYTES } from '@assistigo/form-engine';
import type {
  AttachmentKind,
  DetectionPayload,
  DocumentSuggestion,
  FieldMapping,
  FileAttachmentRequest,
  FileFillInstruction,
  FillResult,
} from '@assistigo/form-engine';

/**
 * Per-tab working state. Held in memory only: it dies with the service worker, which is the
 * correct lifetime for a half-finished fill.
 */
type TabState = {
  detection: DetectionPayload | null;
  mappings: FieldMapping[] | null;
  fillSessionId: string | null;
};

const tabStates = new Map<number, TabState>();

function stateFor(tabId: number): TabState {
  let state = tabStates.get(tabId);
  if (!state) {
    state = { detection: null, mappings: null, fillSessionId: null };
    tabStates.set(tabId, state);
  }
  return state;
}

chrome.tabs.onRemoved.addListener((tabId) => tabStates.delete(tabId));

// Opening the side panel from the toolbar icon is the only entry point that needs no page access.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/**
 * Which tab a message is about.
 *
 * The sender's own tab comes first, falling back to whichever tab is active. A message from the
 * side panel or the popup carries no `sender.tab`, so the fallback is what resolves those.
 */
async function targetTabId(sender?: chrome.runtime.MessageSender): Promise<number | null> {
  return sender?.tab?.id ?? (await activeTabId());
}

/**
 * Injects the content script on demand.
 *
 * `activeTab` grants access only after a user gesture, which is why the extension asks for no
 * host permissions at install time (§15.2).
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (pong) return true;
  } catch {
    // Not injected yet.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function sendToTab<T>(tabId: number, message: Message): Promise<T | null> {
  const injected = await ensureContentScript(tabId);
  if (!injected) return null;
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as
      { ok: true; data: T } | { ok: false; error: string } | undefined;
    return response && response.ok ? response.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function buildSessionState(): Promise<SessionState> {
  const settings = await settingsStore.get();
  const session = await sessionStore.get();

  if (!session) {
    return {
      connected: false,
      organizationName: null,
      organizationId: null,
      role: null,
      canFill: false,
      selectedCustomer: null,
      locale: settings.locale,
    };
  }

  try {
    const me = await apiFetch<{
      organization: { id: string; name: string; locale: 'en' | 'hi' };
      membership: { role: string };
      permissions: string[];
    }>('/api/me');

    return {
      connected: true,
      organizationName: me.organization.name,
      organizationId: me.organization.id,
      role: me.membership.role,
      canFill: me.permissions.includes('fill.run'),
      selectedCustomer: await selectedCustomerStore.get<CustomerSummary>(),
      locale: settings.locale ?? me.organization.locale,
    };
  } catch {
    return {
      connected: false,
      organizationName: null,
      organizationId: null,
      role: null,
      canFill: false,
      selectedCustomer: null,
      locale: settings.locale,
    };
  }
}

/**
 * "Connect account" opens the dashboard, which mints a pairing code for the signed-in user.
 * No password is ever typed into extension UI (docs/EXTENSION.md §3).
 *
 * The extension names itself in `?ext=`, because an unpacked build's id differs from the store
 * build's. The dashboard does not trust that parameter — it checks it against its own allowlist
 * before minting anything.
 */
async function connectAccount(): Promise<{ opened: true }> {
  const { dashboardUrl } = await settingsStore.get();
  const url = `${dashboardUrl}/extension/connect?ext=${encodeURIComponent(chrome.runtime.id)}`;
  await chrome.tabs.create({ url });
  return { opened: true };
}

/** The configured dashboard's origin, for an exact comparison against a message sender. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The connect page posts the code back through an externally-connectable message. */
chrome.runtime.onMessageExternal.addListener((raw, sender, sendResponse) => {
  void (async () => {
    const { dashboardUrl } = await settingsStore.get();
    // Only the configured dashboard origin may pair this extension. Compared as whole origins:
    // a prefix test would let http://localhost:300 pass for http://localhost:3000.
    const expected = originOf(dashboardUrl);
    if (!sender.origin || !expected || sender.origin !== expected) {
      sendResponse(fail('untrusted_origin'));
      return;
    }

    const code = (raw as { code?: unknown })?.code;
    if (typeof code !== 'string' || code.length < 10) {
      sendResponse(fail('invalid_code'));
      return;
    }

    try {
      await sessionStore.set(await pairWithCode(code));
      sendResponse(ok({ connected: true }));
    } catch {
      sendResponse(fail('pairing_failed'));
    }
  })();
  return true;
});

// ---------------------------------------------------------------------------
// Prepared file attachments (spec §7.4.5; docs/EXTENSION.md §6a)
// ---------------------------------------------------------------------------

type SignedDerivative = { url: string; mimeType: string; filename: string };

/**
 * Which signed-URL route reaches a file's bytes.
 *
 * A customer's files live in two tables — `document_derivatives` for what Document Tools Studio
 * prepared, `documents` for what the customer uploaded — and each has its own route. Asking the
 * wrong one is not a soft failure: the id simply is not there, so it answers 404 and the
 * operator is told the file is unavailable when it is sitting right there on the profile.
 */
function signedUrlPath(kind: AttachmentKind, id: string): string {
  return kind === 'source_document'
    ? `/api/documents/${id}/signed-url`
    : `/api/derivatives/${id}/signed-url`;
}

/**
 * Strips anything a file name could smuggle into the download folder: a path separator, a
 * parent-directory hop, or a leading dot that would hide the file. The name is written by an
 * operator in the document tools, so this guards against a mistake more than an attack — but
 * `chrome.downloads` rejects the whole call on a bad name, and the button would simply fail.
 */
function safeDownloadName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 150) : 'assistigo-document';
}

/** Base64 for a `Uint8Array`, chunked so a large file cannot blow the argument limit. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * Turns the panel's "attach this file here" requests into instructions carrying bytes.
 *
 * Every signed URL comes from the route `signedUrlPath` picks for the request's `kind`, and both
 * of those re-check `document.download` and write an audit row — so an operator allowed to see
 * that a file exists, but not to download the customer's documents, cannot attach one either.
 * The bytes live in this worker for the length of the fill and are never stored.
 *
 * A file that cannot be fetched, or that is over the size ceiling, does not fail the whole fill
 * — the typed fields are still worth writing. It does produce a `failed` result for its own
 * upload box, because a box the operator ticked and heard nothing about would be read as
 * attached, and an incomplete application submitted on the strength of it.
 */
type AttachmentBatch = {
  instructions: FileFillInstruction[];
  /** One per request that never reached the page, in the shape the panel already renders. */
  failures: FillResult[];
};

async function fetchAttachments(
  requests: readonly FileAttachmentRequest[],
): Promise<AttachmentBatch> {
  const batch: AttachmentBatch = { instructions: [], failures: [] };

  for (const request of requests) {
    const unavailable = (error: string): void => {
      batch.failures.push({ signature: request.signature, action: 'failed', error });
    };

    try {
      const signed = await apiFetch<SignedDerivative>(
        signedUrlPath(request.kind, request.targetId),
        { method: 'POST' },
      );

      // Storage, not the dashboard API: a signed URL carries its own authorisation, so this
      // request deliberately does not go through `apiFetch` and sends no bearer token.
      const download = await fetch(signed.url);
      if (!download.ok) {
        unavailable('attachment_unavailable');
        continue;
      }

      const buffer = await download.arrayBuffer();
      if (buffer.byteLength === 0) {
        unavailable('attach_empty_file');
        continue;
      }
      if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
        unavailable('attachment_too_large');
        continue;
      }

      batch.instructions.push({
        signature: request.signature,
        filename: signed.filename,
        mimeType: signed.mimeType,
        dataBase64: bytesToBase64(new Uint8Array(buffer)),
      });
    } catch {
      /*
       * Includes the permission case: `document.download` refused for this role. Deliberately
       * not inspected further and never logged — the reason belongs to a document, and this
       * worker keeps no record of one (§19.6).
       */
      unavailable('attachment_unavailable');
    }
  }

  return batch;
}

// ---------------------------------------------------------------------------
// The customer vault (spec §7.4.5 — manual document override)
// ---------------------------------------------------------------------------

type SourceDocumentListRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: string | null;
  createdAt: string;
};

type DerivativeListRow = {
  id: string;
  sourceDocumentId: string | null;
  toolType: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/** Newest first, across both halves, so the picker's default order is "what we did last". */
function byCreatedAtDescending(a: CustomerDocument, b: CustomerDocument): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/**
 * Every file on one customer's profile, prepared and original alike, as metadata.
 *
 * Two requests rather than one: the two halves live in different tables behind different routes,
 * and neither list route knows about the other. They are fetched together and only one has to
 * succeed — an org whose role can list documents but not derivatives (or the other way round)
 * still gets a usable picker rather than an empty one.
 *
 * A derivative inherits the `documentType` of the document it was prepared from, which is what
 * lets the picker file a cropped Aadhaar photo under Identity instead of under "Other". The
 * derivative's own `toolType` only ever says photo/signature/pdf.
 */
async function listCustomerDocuments(customerId: string): Promise<CustomerDocument[]> {
  const id = encodeURIComponent(customerId);
  const [documentsResult, derivativesResult] = await Promise.allSettled([
    apiFetch<{ documents: SourceDocumentListRow[] }>(`/api/documents?customerId=${id}&limit=100`),
    apiFetch<{ derivatives: DerivativeListRow[] }>(`/api/derivatives?customerId=${id}&limit=100`),
  ]);

  // Both refused: a permission problem or a dead session, not an empty profile. Told apart,
  // because "you cannot see this customer's documents" and "this customer has none" ask
  // completely different things of the operator.
  if (documentsResult.status === 'rejected' && derivativesResult.status === 'rejected') {
    throw documentsResult.reason;
  }

  const sourceDocuments =
    documentsResult.status === 'fulfilled' ? (documentsResult.value.documents ?? []) : [];
  const derivatives =
    derivativesResult.status === 'fulfilled' ? (derivativesResult.value.derivatives ?? []) : [];

  const typeBySourceDocument = new Map(
    sourceDocuments.map((row) => [row.id, row.documentType ?? null] as const),
  );

  const rows: CustomerDocument[] = [
    ...derivatives.map((row) => ({
      id: row.id,
      kind: 'derivative' as const,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      documentType: row.sourceDocumentId
        ? (typeBySourceDocument.get(row.sourceDocumentId) ?? null)
        : null,
      toolType: row.toolType ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      createdAt: row.createdAt,
    })),
    ...sourceDocuments.map((row) => ({
      id: row.id,
      kind: 'source_document' as const,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      documentType: row.documentType ?? null,
      toolType: null,
      // Source documents are stored as uploaded; nobody has measured them.
      width: null,
      height: null,
      createdAt: row.createdAt,
    })),
  ];

  return rows.sort(byCreatedAtDescending);
}

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

async function route(message: Message, sender?: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return ok({ alive: true });

    case 'GET_SESSION':
      return ok(await buildSessionState());

    case 'CONNECT_ACCOUNT':
      return ok(await connectAccount());

    case 'DISCONNECT':
      await clearAllSensitive();
      return ok({ connected: false });

    case 'OPEN_DASHBOARD': {
      const { dashboardUrl } = await settingsStore.get();
      await chrome.tabs.create({ url: `${dashboardUrl}${message.path ?? '/dashboard'}` });
      return ok({ opened: true });
    }

    case 'SEARCH_CUSTOMERS': {
      const results = await apiFetch<{ customers: CustomerSummary[] }>(
        `/api/customers/search?q=${encodeURIComponent(message.query)}&limit=10`,
      );
      return ok(results);
    }

    case 'SELECT_CUSTOMER': {
      await selectedCustomerStore.set(message.customer);
      await recentCustomersStore.push(message.customer);
      return ok({ selected: message.customer });
    }

    case 'SEARCH_ROAMING_CUSTOMER': {
      const results = await apiFetch<{ customers: RoamingSearchResult[] }>(
        `/api/customers/roaming/search?mobile=${encodeURIComponent(message.query)}`,
      );
      return ok(results);
    }

    case 'GET_ROAMING_ACCESS': {
      const access = await apiFetch<RoamingAccessView>(
        `/api/customers/${message.customerId}/roaming`,
      );
      return ok(access);
    }

    /*
     * Bookmarks the customer to this counter and, in the same step, selects them — the operator
     * came here to serve this walk-in now, not to file them away for later. The selection starts
     * 'locked': linking alone never unlocks anything (migration 0024).
     */
    case 'LINK_ROAMING_CUSTOMER': {
      const linked = await apiFetch<{
        customer: { customerId: string; displayName: string; mobileLast4: string | null };
      }>('/api/customers/roaming/link', {
        method: 'POST',
        body: JSON.stringify({ customerId: message.customerId }),
      });

      const summary: CustomerSummary = {
        id: linked.customer.customerId,
        displayName: linked.customer.displayName,
        customerCode: null,
        mobileLast4: linked.customer.mobileLast4,
        isRoaming: true,
        accessStatus: 'locked',
        grantExpiresAt: null,
      };
      await selectedCustomerStore.set(summary);
      await recentCustomersStore.push(summary);
      return ok({ customer: summary });
    }

    case 'REQUEST_ROAMING_OTP': {
      const result = await apiFetch<{ mobileLast4: string | null; expiresInSeconds: number }>(
        `/api/customers/${message.customerId}/roaming/request-otp`,
        {
          method: 'POST',
          body: JSON.stringify({
            purpose: message.purpose,
            durationMinutes: message.durationMinutes,
            targetSchemeSlug: message.targetSchemeSlug,
            channel: 'whatsapp',
          }),
        },
      );
      return ok(result);
    }

    case 'VERIFY_ROAMING_OTP': {
      const response = await apiFetch<{ session: { expiresAt: string } }>(
        `/api/customers/${message.customerId}/roaming/verify-otp`,
        { method: 'POST', body: JSON.stringify({ otp: message.otp }) },
      );

      // The selected customer, if it is still this one, moves from locked to granted so the
      // side panel's fill controls light up without a round trip to GET_SESSION.
      const current = await selectedCustomerStore.get<CustomerSummary>();
      if (current?.id === message.customerId) {
        await selectedCustomerStore.set({
          ...current,
          accessStatus: 'granted',
          grantExpiresAt: response.session.expiresAt,
        });
      }
      return ok(response.session);
    }

    case 'REVOKE_ROAMING_SESSION': {
      await apiFetch(`/api/customers/${message.customerId}/roaming/revoke`, { method: 'POST' });

      const current = await selectedCustomerStore.get<CustomerSummary>();
      if (current?.id === message.customerId) {
        await selectedCustomerStore.set({
          ...current,
          accessStatus: 'locked',
          grantExpiresAt: null,
        });
      }
      return ok({ revoked: true });
    }

    case 'DETECT_FIELDS': {
      const tabId = await targetTabId(sender);
      if (tabId === null) return fail('no_active_tab');

      const injected = await ensureContentScript(tabId);
      if (!injected) return fail('detection_failed');

      let detection = await sendToTab<DetectionPayload>(tabId, { type: 'DETECT_FIELDS' });

      // Aggregate fields from all subframes if available
      try {
        if (chrome.webNavigation?.getAllFrames) {
          const frames = await chrome.webNavigation.getAllFrames({ tabId });
          if (frames && frames.length > 1) {
            const allFields: DetectionPayload['fields'] = detection?.fields
              ? [...detection.fields]
              : [];
            let mainPageContext = detection?.page;

            for (const frame of frames) {
              if (frame.frameId === 0) continue;
              try {
                const response = (await chrome.tabs.sendMessage(
                  tabId,
                  { type: 'DETECT_FIELDS' },
                  { frameId: frame.frameId },
                )) as { ok: true; data: DetectionPayload } | undefined;
                if (response?.ok && response.data) {
                  if (!mainPageContext || (!mainPageContext.title && response.data.page.title)) {
                    mainPageContext = response.data.page;
                  }
                  const subFields = response.data.fields.map((f, idx) => ({
                    ...f,
                    frame: frame.frameId,
                    order: allFields.length + idx,
                  }));
                  allFields.push(...subFields);
                }
              } catch {
                // Subframe unreadable or script not loaded
              }
            }

            if (allFields.length > 0 || mainPageContext) {
              detection = {
                page: mainPageContext ?? { origin: '', path: '', title: null, blockedFrames: 0 },
                fields: allFields,
              };
            }
          }
        }
      } catch {
        // Fallback to top frame detection
      }

      if (!detection) return fail('detection_failed');

      stateFor(tabId).detection = detection;
      return ok(detection);
    }

    case 'REQUEST_MAPPING': {
      const tabId = await targetTabId(sender);
      if (tabId === null) return fail('no_active_tab');

      const state = stateFor(tabId);
      const customer = await selectedCustomerStore.get<CustomerSummary>();
      if (!state.detection) return fail('no_detection');
      if (!customer) return fail('no_customer_selected');

      const proposal = await apiFetch<{
        fillSessionId: string;
        mappings: FieldMapping[];
        /** Signatures in dependency order; the side panel fills in this order. */
        fillOrder: string[];
        summary: Record<string, number>;
        documentSuggestions: DocumentSuggestion[];
        values: Record<string, string>;
      }>('/api/forms/map', {
        method: 'POST',
        body: JSON.stringify({ customerId: customer.id, detection: state.detection }),
      });

      state.mappings = proposal.mappings;
      state.fillSessionId = proposal.fillSessionId;
      return ok(proposal);
    }

    case 'APPLY_FILL': {
      const tabId = await targetTabId(sender);
      if (tabId === null) return fail('no_active_tab');

      const state = stateFor(tabId);

      /*
       * The side panel names the files it wants attached; their bytes are fetched here and only
       * here. `attachments` is dropped from what goes on to the page: the content script has no
       * business knowing a document's id, and a hostile page that got hold of one could not use
       * it anyway without the operator's session.
       */
      const { attachments, ...forPage } = message;
      const batch = attachments?.length
        ? await fetchAttachments(attachments)
        : { instructions: [], failures: [] };
      const outbound: Message = {
        ...forPage,
        ...(batch.instructions.length > 0 ? { fileInstructions: batch.instructions } : {}),
      };

      const response = await sendToTab<{ results: FillResult[] }>(tabId, outbound);

      // If elements were in subframes and top-frame missed them, attempt fill across subframes
      if (response && response.results) {
        const missingSignatures = response.results
          .filter((r) => r.action === 'failed' && r.error === 'element_not_found')
          .map((r) => r.signature);

        if (missingSignatures.length > 0 && chrome.webNavigation?.getAllFrames) {
          try {
            const frames = await chrome.webNavigation.getAllFrames({ tabId });
            if (frames) {
              for (const frame of frames) {
                if (frame.frameId === 0) continue;
                const subResponse = (await chrome.tabs
                  .sendMessage(tabId, outbound, { frameId: frame.frameId })
                  .catch(() => null)) as { ok: true; data: { results: FillResult[] } } | null;
                if (subResponse?.ok && subResponse.data.results) {
                  for (const subRes of subResponse.data.results) {
                    if (subRes.action === 'filled' || subRes.error !== 'element_not_found') {
                      const idx = response.results.findIndex(
                        (r) => r.signature === subRes.signature,
                      );
                      if (idx >= 0) response.results[idx] = subRes;
                    }
                  }
                }
              }
            }
          } catch {
            // Ignore subframe execution errors
          }
        }
      }

      if (!response) return fail('fill_failed');

      // Files that never reached the page still get a row, so a ticked box the operator heard
      // nothing about cannot be mistaken for an attached one.
      response.results.push(...batch.failures);

      // Record the session. A logging failure must not lose the operator's work, so it is
      // reported but does not fail the fill.
      if (state.fillSessionId) {
        try {
          await apiFetch(`/api/fill-sessions/${state.fillSessionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'filled', results: response.results }),
          });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
      }

      return ok(response);
    }

    case 'REPORT_FORM': {
      const tabId = await targetTabId(sender);
      const state = tabId === null ? null : stateFor(tabId);
      if (!state?.detection) return fail('no_detection');

      await apiFetch('/api/form-reports', {
        method: 'POST',
        body: JSON.stringify({
          page: state.detection.page,
          // Metadata only. No customer values leave the extension in a report (§9.6).
          fields: state.detection.fields.map((field) => ({
            signature: field.signature,
            tagName: field.tagName,
            inputType: field.inputType,
            name: field.name,
            id: field.id,
            labelText: field.labelText,
            required: field.required,
          })),
          note: message.note,
          fillSessionId: state.fillSessionId,
          screenshotConsent: message.includeScreenshot,
        }),
      });

      return ok({ reported: true });
    }

    case 'CREATE_APPLICATION': {
      const tabId = await targetTabId(sender);
      const state = tabId === null ? null : stateFor(tabId);
      const customer = await selectedCustomerStore.get<CustomerSummary>();
      if (!customer) return fail('no_customer_selected');

      const application = await apiFetch<{ id: string }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          title: message.title,
          status: 'filled',
          portalUrl: state?.detection
            ? `${state.detection.page.origin}${state.detection.page.path}`
            : null,
          fillSessionId: state?.fillSessionId ?? null,
        }),
      });

      return ok(application);
    }

    case 'DOWNLOAD_DERIVATIVE': {
      const signed = await apiFetch<SignedDerivative>(
        `/api/derivatives/${message.derivativeId}/signed-url`,
        { method: 'POST' },
      );
      /*
       * `saveAs: false` sends it to the download folder without a dialog — the point of the
       * button is that it is one click. The signed URL expires in minutes and the file name
       * comes from the derivative record, not from the page.
       */
      const downloadId = await chrome.downloads.download({
        url: signed.url,
        filename: safeDownloadName(signed.filename),
        saveAs: false,
      });
      return ok({ downloadId });
    }

    case 'DOWNLOAD_DOCUMENT': {
      const signed = await apiFetch<SignedDerivative>(
        `/api/documents/${message.documentId}/signed-url`,
        { method: 'POST' },
      );
      const downloadId = await chrome.downloads.download({
        url: signed.url,
        filename: safeDownloadName(signed.filename),
        saveAs: false,
      });
      return ok({ downloadId });
    }

    /*
     * Only ever for the customer this counter already has selected, and only while a roaming
     * customer's consent window is open. RLS refuses anything else on its own — see
     * `documents_select` in migration 0024 — but a locked roaming customer would come back
     * empty rather than refused, and an empty vault reads as "this customer has no documents"
     * when the truth is "the citizen has not consented yet".
     */
    case 'LIST_CUSTOMER_DOCUMENTS': {
      const customer = await selectedCustomerStore.get<CustomerSummary>();
      if (!customer) return fail('no_customer_selected');
      if (customer.id !== message.customerId) return fail('customer_not_selected');
      if (customer.isRoaming && customer.accessStatus !== 'granted') {
        return fail('roaming_access_locked');
      }

      return ok({ documents: await listCustomerDocuments(customer.id) });
    }

    case 'GET_DOCUMENT_PREVIEW': {
      const signed = await apiFetch<SignedDerivative & { expiresInSeconds: number }>(
        signedUrlPath(message.kind, message.targetId),
        { method: 'POST' },
      );
      return ok(signed);
    }

    default:
      return fail('unsupported_message');
  }
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const message = parseMessage(raw, sender);
  if (!message) {
    sendResponse(fail('invalid_message'));
    return undefined;
  }

  route(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageKey = error instanceof ApiError ? error.messageKey : 'errors.internal';
      // The error itself is never forwarded: it could carry a response body from the page.
      sendResponse(fail('request_failed', messageKey));
    });

  return true;
});
