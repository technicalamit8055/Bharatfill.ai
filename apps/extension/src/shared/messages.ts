/**
 * The runtime message contract.
 * Master spec §15.3, §15.4; docs/EXTENSION.md §4.
 *
 * Every message is Zod-parsed on receipt and the sender is verified. A content script runs
 * inside a page Assistigo does not control, so anything arriving from it is treated as hostile
 * until it has been through `parseMessage`.
 */

import { z } from 'zod';
// Subpath import: the content script needs these schemas to validate messages, and pulling the
// package barrel would drag the dictionary, scorer and mapper into a page bundle that never
// uses them.
import {
  ATTACHMENT_KINDS,
  EDUCATION_LEVELS,
  detectionPayloadSchema,
  fileAttachmentRequestSchema,
  fileFillInstructionSchema,
  fillInstructionSchema,
  fillResultSchema,
} from '@assistigo/form-engine/types';
import { autoFitDimensionsSchema } from './autofit';

/** The selected customer, as the extension holds it: identity plus just enough to confirm it. */
export const customerSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().max(160),
  customerCode: z.string().max(20).nullable(),
  /** Last four digits only — enough to confirm the right person, useless if leaked (§8.2). */
  mobileLast4: z.string().length(4).nullable(),
  /**
   * Cross-centre roaming (migration 0024). Absent/false for a customer registered at this
   * counter's own centre. `accessStatus` and `grantExpiresAt` are only meaningful when true.
   */
  isRoaming: z.boolean().optional(),
  /** 'locked': bookmarked but not yet consented to. 'granted': inside a live access window. */
  accessStatus: z.enum(['granted', 'locked']).optional(),
  /** ISO timestamp the active grant expires at. Only set when accessStatus is 'granted'. */
  grantExpiresAt: z.string().nullable().optional(),
});

export type CustomerSummary = z.infer<typeof customerSummarySchema>;

/**
 * One masked result from a network-wide roaming lookup — a customer found, but not yet
 * bookmarked to this counter and never carrying more than the pre-auth card does (0024).
 */
export const roamingSearchResultSchema = z.object({
  customerId: z.string().uuid(),
  displayName: z.string().max(160),
  mobileLast4: z.string().length(4).nullable(),
  state: z.string().max(60).nullable(),
  isLinked: z.boolean(),
  /** Signed up in the BharatDoc app (migration 0041). Absent from older servers. */
  fromApp: z.boolean().default(false),
});
export type RoamingSearchResult = z.infer<typeof roamingSearchResultSchema>;

const roamingPurposeSchema = z.enum([
  'form_filling',
  'scheme_application',
  'profile_update',
  'document_access',
]);
export type RoamingPurpose = z.infer<typeof roamingPurposeSchema>;

export const sessionStateSchema = z.object({
  connected: z.boolean(),
  organizationName: z.string().max(160).nullable(),
  organizationId: z.string().uuid().nullable(),
  role: z.string().max(30).nullable(),
  canFill: z.boolean(),
  selectedCustomer: customerSummarySchema.nullable(),
  locale: z.enum(['en', 'hi']).default('en'),
});

export type SessionState = z.infer<typeof sessionStateSchema>;

/**
 * One row of the customer's file collection, as the document picker lists it.
 *
 * Metadata only, exactly like `DetectedField`: enough to recognise a file, choose between two
 * of them and decide whether an upload box would accept it. The bytes stay behind
 * `GET_DOCUMENT_PREVIEW` and the attachment path, both of which mint an audited signed URL per
 * use (docs/SECURITY.md §4).
 */
export const customerDocumentSchema = z.object({
  id: z.string().uuid(),
  /** Which table it came from, and so which signed-URL route reaches its bytes. */
  kind: z.enum(ATTACHMENT_KINDS),
  filename: z.string().max(300),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().nonnegative(),
  /**
   * `documents.document_type` — how the picker groups a file into Identity, Educational and so
   * on. Carried for a derivative too, read off the source document it was prepared from, so a
   * cropped Aadhaar scan files under Identity rather than under "Other".
   */
  documentType: z.string().max(60).nullable(),
  /** `document_derivatives.tool_type`. Null for a source document. */
  toolType: z.string().max(40).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  createdAt: z.string(),
});

export type CustomerDocument = z.infer<typeof customerDocumentSchema>;

export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PING') }),
  z.object({ type: z.literal('GET_SESSION') }),
  z.object({ type: z.literal('CONNECT_ACCOUNT') }),
  z.object({ type: z.literal('DISCONNECT') }),
  z.object({ type: z.literal('SEARCH_CUSTOMERS'), query: z.string().max(120) }),
  z.object({ type: z.literal('SELECT_CUSTOMER'), customer: customerSummarySchema }),
  z.object({
    type: z.literal('OPEN_DASHBOARD'),
    // One leading slash, never two (or `/\`, which browsers read the same): the path is appended
    // to the dashboard URL, and `@host` or `//host` there would open some other site.
    path: z
      .string()
      .max(200)
      .regex(/^\/(?![/\\])/)
      .optional(),
  }),

  /**
   * Cross-centre roaming (migration 0024). Reachable from `CustomerPicker` when a local search
   * comes up empty for a number that looks real, and from `RoamingAuthBanner` once a roaming
   * customer is selected. None of these ever carries a value from the customer's record beyond
   * what the masked pre-auth card already shows.
   */
  z.object({ type: z.literal('SEARCH_ROAMING_CUSTOMER'), query: z.string().max(20) }),
  z.object({ type: z.literal('LINK_ROAMING_CUSTOMER'), customerId: z.string().uuid() }),
  /** The masked pre-auth card plus top scheme matches, for the locked-state banner. */
  z.object({ type: z.literal('GET_ROAMING_ACCESS'), customerId: z.string().uuid() }),
  /**
   * The one "Request access" (migration 0046): the server sends it to the citizen's BharatDoc app
   * when they have one, otherwise a WhatsApp code; the answer says which. `durationMinutes` is
   * for the code only.
   */
  z.object({
    type: z.literal('REQUEST_ROAMING_ACCESS'),
    customerId: z.string().uuid(),
    purpose: roamingPurposeSchema.default('form_filling'),
    durationMinutes: z.union([z.literal(60), z.literal(120), z.literal(240)]).default(120),
    targetSchemeSlug: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal('REQUEST_ROAMING_OTP'),
    customerId: z.string().uuid(),
    purpose: roamingPurposeSchema.default('form_filling'),
    durationMinutes: z.union([z.literal(60), z.literal(120), z.literal(240)]).default(120),
    targetSchemeSlug: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal('VERIFY_ROAMING_OTP'),
    customerId: z.string().uuid(),
    otp: z.string().min(4).max(8),
  }),
  /**
   * The alternative to the OTP: ask the citizen to approve in the BharatDoc app (migration 0039).
   * No duration — the citizen picks it on their phone. GET polls; CANCEL stops waiting.
   */
  z.object({
    type: z.literal('REQUEST_ROAMING_APPROVAL'),
    customerId: z.string().uuid(),
    purpose: roamingPurposeSchema.default('form_filling'),
  }),
  z.object({
    type: z.literal('GET_ROAMING_APPROVAL'),
    customerId: z.string().uuid(),
    requestId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('CANCEL_ROAMING_APPROVAL'),
    customerId: z.string().uuid(),
    requestId: z.string().uuid(),
  }),
  z.object({ type: z.literal('REVOKE_ROAMING_SESSION'), customerId: z.string().uuid() }),

  /**
   * The citizen's own BharatDoc vault (docs/VAULT_BRIDGE_DESIGN.md §4). Side panel only — the
   * worker refuses these from a tab. Same words whatever the number: the answers never say
   * whether this person uses the app until they approve or read out a code.
   */
  z.object({ type: z.literal('VAULT_REQUEST'), mobile: z.string().regex(/^\d{10}$/) }),
  z.object({ type: z.literal('VAULT_REQUEST_STATUS'), requestId: z.string().uuid() }),
  z.object({
    type: z.literal('VAULT_UNLOCK'),
    mobile: z.string().regex(/^\d{10}$/),
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({ type: z.literal('VAULT_LIST_DOCUMENTS'), grantId: z.string().uuid() }),
  /** Bytes come back as base64 for an in-memory preview; nothing is written anywhere. */
  z.object({
    type: z.literal('VAULT_VIEW_DOCUMENT'),
    grantId: z.string().uuid(),
    documentId: z.string().uuid(),
  }),
  z.object({ type: z.literal('VAULT_END_GRANT'), grantId: z.string().uuid() }),

  /** side panel → background → content */
  z.object({ type: z.literal('DETECT_FIELDS') }),
  /** content → background */
  z.object({ type: z.literal('DETECTION_RESULT'), payload: detectionPayloadSchema }),

  /**
   * side panel → background → server.
   *
   * `applicationId` links this stage's fill session to a parent application the operator already
   * saved, so a multi-page portal (RTPS-style main form → annexure → acknowledgement) ends up
   * with one application row and several linked fill sessions instead of one per page scanned.
   * Optional: the first stage of a journey has nothing to link to yet.
   */
  z.object({
    type: z.literal('REQUEST_MAPPING'),
    applicationId: z.string().uuid().optional(),
    /**
     * The operator's pick in the side panel's qualification selector, for generic education boxes
     * ("Roll Number" under SSC's qualifying-qualification block). Never read from the page.
     */
    educationLevel: z.enum(EDUCATION_LEVELS).optional(),
  }),

  /**
   * side panel → background → content. The only message that ever carries customer values,
   * and it travels once, after the operator has pressed Fill.
   *
   * The two file fields are the two halves of one hop each, never both set by the same sender:
   * the side panel names prepared files by id in `attachments` (it has no bytes and is given
   * none), and the background worker replaces that with `fileInstructions` — the same files with
   * their bytes, fetched through a signed URL — before forwarding to the content script.
   */
  z.object({
    type: z.literal('APPLY_FILL'),
    instructions: z.array(fillInstructionSchema).max(500),
    /** side panel → background */
    attachments: z.array(fileAttachmentRequestSchema).max(20).optional(),
    /** background → content */
    fileInstructions: z.array(fileFillInstructionSchema).max(20).optional(),
  }),

  /** content → background → side panel */
  z.object({ type: z.literal('FILL_RESULT'), results: z.array(fillResultSchema).max(500) }),

  z.object({
    type: z.literal('REPORT_FORM'),
    note: z.string().max(1000),
    includeScreenshot: z.boolean().default(false),
  }),

  z.object({ type: z.literal('CREATE_APPLICATION'), title: z.string().max(160) }),

  /** Saves a prepared file to disk, for a portal whose upload box cannot be attached to. */
  z.object({ type: z.literal('DOWNLOAD_DERIVATIVE'), derivativeId: z.string().uuid() }),

  /** Saves a customer's source document to disk (parity with `DOWNLOAD_DERIVATIVE`). */
  z.object({ type: z.literal('DOWNLOAD_DOCUMENT'), documentId: z.string().uuid() }),

  /**
   * side panel → background. Every file on the selected customer's profile — both prepared
   * derivatives and original uploads — so the operator can attach one the matcher never
   * suggested: a Voter ID where it ranked Aadhaar first, or anything at all for an upload box
   * labelled "any other supporting document" that no category could be inferred from.
   *
   * Metadata only, and only for the customer already selected in this session.
   */
  z.object({ type: z.literal('LIST_CUSTOMER_DOCUMENTS'), customerId: z.string().uuid() }),

  /**
   * side panel → background. Asks for a short-lived signed URL to preview one suggested file —
   * never its bytes over this channel, and never persisted; the panel opens the URL directly in
   * an `<img>`/iframe or a new tab, the same way a `<DOWNLOAD_*>` message hands one to
   * `chrome.downloads`.
   */
  z.object({
    type: z.literal('GET_DOCUMENT_PREVIEW'),
    targetId: z.string().uuid(),
    kind: z.enum(ATTACHMENT_KINDS).default('derivative'),
  }),

  /**
   * side panel → background → offscreen. Fits one chosen file to its upload box's KB window
   * and format (docs/EXTENSION.md §6c), and answers with a summary, a preview URL and a token —
   * never the bytes. The operator confirms the result before the fill attaches it.
   *
   * `accept`, `minBytes` and `maxBytes` are what the panel already holds for that box: the
   * detected field's `accept` attribute and the resolved preset's size window.
   */
  z.object({
    type: z.literal('PREPARE_AUTO_FIT'),
    targetId: z.string().uuid(),
    kind: z.enum(ATTACHMENT_KINDS).default('derivative'),
    accept: z.string().max(500).nullable(),
    minBytes: z.number().int().positive().nullable(),
    maxBytes: z.number().int().positive().nullable(),
    /**
     * The exact picture size the box wants, from the page's own notice or the preset
     * (`resolveUploadTarget`). An image is then redrawn to it, with the DPI in its header.
     */
    dimensions: autoFitDimensionsSchema.nullable().optional(),
  }),

  /** side panel → background → offscreen. Drops a fitted copy the operator will not use. */
  z.object({ type: z.literal('DISCARD_AUTO_FIT'), token: z.string().uuid() }),

  /**
   * Portal login vault (spec §19.7a; docs/EXTENSION.md § Portal login).
   *
   * side panel → background. Is the active tab an allow-listed portal login page, and does the
   * selected customer have a saved login for it? Answers with masked metadata only.
   */
  z.object({ type: z.literal('GET_PORTAL_LOGIN') }),

  /**
   * side panel → background. The operator pressed "Log in as …". Carries nothing: the background
   * worker reads the tab URL and the selected customer itself, so the panel cannot aim a
   * password at a page of its choosing.
   */
  z.object({ type: z.literal('FILL_PORTAL_LOGIN') }),

  /**
   * background → content (top frame only). The one message that carries a portal password. It
   * travels once, per click, and the content script re-checks its own location against `hosts`
   * before typing anything (src/content/login-filler.ts).
   */
  z.object({
    type: z.literal('APPLY_PORTAL_LOGIN'),
    loginId: z.string().min(1).max(120),
    password: z.string().min(1).max(128).nullable(),
    hosts: z.array(z.string().min(1).max(253)).min(1).max(10),
  }),
]);

/** What `GET_PORTAL_LOGIN` answers. No secret: the login ID appears only as its masked hint. */
export type PortalLoginStatus = {
  /** The portal this tab belongs to, or null when it is not an allow-listed login page. */
  portal: { key: string; name: string } | null;
  /** Why no login can be offered on a recognised portal page. */
  unavailable: 'no_customer' | 'roaming' | 'no_permission' | 'not_saved' | null;
  credential: { loginIdHint: string; hasPassword: boolean } | null;
};

/** Vault messages are for extension pages (side panel, popup) only, never a content script. */
export const VAULT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'VAULT_REQUEST',
  'VAULT_REQUEST_STATUS',
  'VAULT_UNLOCK',
  'VAULT_LIST_DOCUMENTS',
  'VAULT_VIEW_DOCUMENT',
  'VAULT_END_GRANT',
]);

export type VaultGrantView = { id: string; minutesLeft: number; live: boolean };
export type VaultDocumentView = {
  id: string;
  documentType: string;
  title: string;
  mimeType: string;
  pageCount: number;
};
export type VaultRequestStatus =
  | { status: 'pending'; expiresAt: string }
  | { status: 'approved'; grant: VaultGrantView }
  | { status: 'denied' | 'expired' };

export type Message = z.infer<typeof messageSchema>;
export type MessageType = Message['type'];

export type MessageResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string; messageKey?: string };

/**
 * Parses an inbound message and verifies the sender is this extension.
 *
 * A page can call `chrome.runtime.sendMessage(extensionId, …)` if it knows the id, so checking
 * `sender.id` is not optional.
 */
export function parseMessage(raw: unknown, sender?: chrome.runtime.MessageSender): Message | null {
  if (sender && sender.id !== chrome.runtime.id) return null;
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) return null;
  // A content script runs in a tab; the vault is opened from the side panel alone.
  if (VAULT_MESSAGE_TYPES.has(parsed.data.type) && sender?.tab) return null;
  return parsed.data;
}

export function ok<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

export function fail(error: string, messageKey?: string): MessageResponse<never> {
  return messageKey ? { ok: false, error, messageKey } : { ok: false, error };
}
