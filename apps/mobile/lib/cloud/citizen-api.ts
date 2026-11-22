/**
 * Client for the dashboard's citizen API (`/api/citizen/*`; docs/VAULT_BRIDGE_DESIGN.md §6).
 *
 * Every call carries the citizen's Supabase access token as a bearer token. A 401 refreshes the
 * session once and retries; a second 401 means signed out. Responses are Zod-checked: the
 * server's `{ data }` on success, `{ error: { code, messageKey, traceId } }` on failure — the
 * `messageKey` is shown to the citizen through the app's own catalogue (`errors.vault.*`).
 *
 * The document key in a sign-up or restore response is returned to the caller and goes straight
 * into SecureStore; it is never logged or kept anywhere else. Pure apart from injected
 * dependencies, so it is tested in Node.
 */

import {
  CITIZEN_DEVICE_HEADER,
  ROAMING_PURPOSES,
  type DocumentType,
  VAULT_FILE_MIME_TYPES,
  type VaultFileMimeType,
} from '@assistigo/core';
import { z } from 'zod';

import type { FetchLike } from './auth-client';

export type CitizenApiError = {
  readonly status: number;
  /** Server error code (`RATE_LIMITED`, …), or `NETWORK` / `SIGNED_OUT` / `BAD_RESPONSE`. */
  readonly code: string;
  readonly messageKey: string;
  readonly details?: Record<string, unknown>;
};

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: CitizenApiError };

const accountSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  preferredLocale: z.enum(['en', 'hi']),
  cloudEnabled: z.boolean(),
  createdAt: z.string(),
});
export type CitizenAccount = z.infer<typeof accountSchema>;

const unlockSchema = z.object({
  account: accountSchema,
  /** Base64 of 32 bytes. */
  documentKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  deviceId: z.string().uuid(),
});
export type VaultUnlock = z.infer<typeof unlockSchema>;

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    messageKey: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

/** A centre asking to use the profile a centre keeps for this citizen (migration 0039). */
const profileRequestSchema = z.object({
  id: z.string().uuid(),
  centreName: z.string(),
  purpose: z.enum(ROAMING_PURPOSES),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type ProfileRequest = z.infer<typeof profileRequestSchema>;

// ---- Vault access by centres (design §4.2): requests to approve, live grants, share codes. ----
const vaultRequestSchema = z.object({
  id: z.string().uuid(),
  centreName: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type VaultRequest = z.infer<typeof vaultRequestSchema>;

const vaultGrantSchema = z.object({
  id: z.string().uuid(),
  centreName: z.string(),
  allowCopy: z.boolean(),
  expiresAt: z.string(),
  live: z.boolean(),
  minutesLeft: z.number(),
});
export type VaultGrant = z.infer<typeof vaultGrantSchema>;

/** The citizen picks 30 minutes or 2 hours (design defaults). */
export type VaultGrantMinutes = 30 | 120;
export type VaultShareChoice = {
  readonly durationMinutes: VaultGrantMinutes;
  readonly allowCopy: boolean;
};

/** The windows the citizen may give a centre. */
export type ProfileAccessMinutes = 60 | 120 | 240;

export type DeviceInfo = { platform: 'android' | 'ios'; label?: string };

const cloudDocumentSchema = z.object({
  id: z.string().uuid(),
  documentType: z.string(),
  category: z.string(),
  title: z.string(),
  mimeType: z.enum(VAULT_FILE_MIME_TYPES),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  status: z.enum(['pending', 'ready']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CloudDocument = z.infer<typeof cloudDocumentSchema>;

const documentEnvelope = z
  .object({ document: cloudDocumentSchema })
  .transform((value) => value.document);

const uploadIntentSchema = z.object({
  document: cloudDocumentSchema,
  uploadUrl: z.string().url(),
});
export type UploadIntent = z.infer<typeof uploadIntentSchema>;

export type UploadIntentInput = {
  documentType: DocumentType;
  title: string;
  mimeType: VaultFileMimeType;
  /** Plaintext size; the upload is this plus VAULT_FILE_OVERHEAD_BYTES. */
  sizeBytes: number;
  pageCount: number;
};

export type CreateAccountInput = {
  displayName: string;
  preferredLocale: 'en' | 'hi';
  vaultPin: string;
  termsVersion: string;
  cloudSync: boolean;
  device: DeviceInfo;
};

export type CitizenApiDeps = {
  readonly apiUrl: string;
  /** Current access token, or null when signed out. */
  readonly accessToken: () => Promise<string | null>;
  /** Refreshes the session; resolves to the new access token or null when signed out. */
  readonly refresh: () => Promise<string | null>;
  readonly fetch?: FetchLike;
};

const SIGNED_OUT: CitizenApiError = {
  status: 401,
  code: 'SIGNED_OUT',
  messageKey: 'cloud.errors.signed_out',
};
const NETWORK: CitizenApiError = { status: 0, code: 'NETWORK', messageKey: 'cloud.errors.network' };
const BAD_RESPONSE: CitizenApiError = {
  status: 0,
  code: 'BAD_RESPONSE',
  messageKey: 'cloud.errors.unavailable',
};

export function createCitizenApi(deps: CitizenApiDeps) {
  const fetchImpl = deps.fetch ?? fetch;

  async function send(
    method: string,
    path: string,
    body: unknown,
    token: string,
    extraHeaders: Record<string, string>,
  ) {
    try {
      return await fetchImpl(`${deps.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...extraHeaders,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      return null;
    }
  }

  async function call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<ApiResult<T>> {
    let token = await deps.accessToken();
    if (!token) token = await deps.refresh();
    if (!token) return { ok: false, error: SIGNED_OUT };

    let response = await send(method, path, body, token, extraHeaders);
    if (response?.status === 401) {
      const fresh = await deps.refresh();
      if (!fresh) return { ok: false, error: SIGNED_OUT };
      response = await send(method, path, body, fresh, extraHeaders);
      if (response?.status === 401) return { ok: false, error: SIGNED_OUT };
    }
    if (!response) return { ok: false, error: NETWORK };

    if (response.status === 204) {
      const empty = schema.safeParse(null);
      return empty.success ? { ok: true, value: empty.data } : { ok: false, error: BAD_RESPONSE };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, error: { ...BAD_RESPONSE, status: response.status } };
    }

    if (!response.ok) {
      const parsed = errorSchema.safeParse(json);
      if (!parsed.success)
        return { ok: false, error: { ...BAD_RESPONSE, status: response.status } };
      return {
        ok: false,
        error: {
          status: response.status,
          code: parsed.data.error.code,
          messageKey: parsed.data.error.messageKey,
          ...(parsed.data.error.details ? { details: parsed.data.error.details } : {}),
        },
      };
    }

    const envelope = z.object({ data: z.unknown() }).safeParse(json);
    const parsed = envelope.success ? schema.safeParse(envelope.data.data) : null;
    return parsed?.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: { ...BAD_RESPONSE, status: response.status } };
  }

  return {
    /** The account, or null when sign-in worked but sign-up has not been finished. */
    getAccount: () =>
      call(
        'GET',
        '/api/citizen/account',
        z.object({ account: accountSchema.nullable() }).transform((v) => v.account),
      ),
    createAccount: (input: CreateAccountInput) =>
      call('POST', '/api/citizen/account', unlockSchema, input),
    restoreWithPin: (vaultPin: string, device: DeviceInfo) =>
      call('POST', '/api/citizen/restore/pin', unlockSchema, { vaultPin, device }),
    /** Name and language (design D10: nothing else is kept). */
    updateAccount: (patch: { displayName?: string; preferredLocale?: 'en' | 'hi' }) =>
      call(
        'PATCH',
        '/api/citizen/account',
        z.object({ account: accountSchema }).transform((v) => v.account),
        patch,
      ),
    deleteAccount: () => call('DELETE', '/api/citizen/account', z.null()),
    /** Design D17. Signs out every other phone on success (204). */
    changeVaultPin: (currentPin: string, newPin: string) =>
      call('POST', '/api/citizen/account/pin', z.null(), { currentPin, newPin }),

    // ---- Centre requests to use the citizen's saved profile (migration 0039). ----------
    listProfileRequests: () =>
      call(
        'GET',
        '/api/citizen/profile-requests',
        z.object({ requests: z.array(profileRequestSchema) }).transform((v) => v.requests),
      ),
    approveProfileRequest: (requestId: string, durationMinutes: ProfileAccessMinutes) =>
      call(
        'POST',
        `/api/citizen/profile-requests/${encodeURIComponent(requestId)}/approve`,
        z
          .object({ approved: z.object({ centreName: z.string(), expiresAt: z.string() }) })
          .transform((v) => v.approved),
        { durationMinutes },
      ),
    denyProfileRequest: (requestId: string) =>
      call('POST', `/api/citizen/profile-requests/${encodeURIComponent(requestId)}/deny`, z.null()),

    // ---- Centres asking for the vault (design §4.2). Approve and code need this phone. ----
    /** Pending requests and grants (live or recent). */
    getVaultAccess: () =>
      call(
        'GET',
        '/api/citizen/access',
        z.object({ requests: z.array(vaultRequestSchema), grants: z.array(vaultGrantSchema) }),
      ),
    approveVaultRequest: (requestId: string, deviceId: string, choice: VaultShareChoice) =>
      call(
        'POST',
        `/api/citizen/requests/${encodeURIComponent(requestId)}/approve`,
        z.object({ grant: vaultGrantSchema }).transform((v) => v.grant),
        choice,
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),
    denyVaultRequest: (requestId: string) =>
      call('POST', `/api/citizen/requests/${encodeURIComponent(requestId)}/deny`, z.null()),
    /** Stop: the centre loses access at once. */
    revokeVaultGrant: (grantId: string) =>
      call('POST', `/api/citizen/grants/${encodeURIComponent(grantId)}/revoke`, z.null()),
    /** A 6-digit code to read out at the counter: 5 minutes, one use. */
    issueShareCode: (deviceId: string, choice: VaultShareChoice) =>
      call(
        'POST',
        '/api/citizen/share-code',
        z.object({ code: z.string().regex(/^\d{6}$/), expiresAt: z.string() }),
        choice,
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),

    // ---- Document sync (design §3.2). Every call names this phone's device id. ----------
    listDocuments: (deviceId: string) =>
      call(
        'GET',
        '/api/citizen/documents',
        z.object({ documents: z.array(cloudDocumentSchema) }).transform((v) => v.documents),
        undefined,
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),
    createUploadIntent: (deviceId: string, input: UploadIntentInput) =>
      call('POST', '/api/citizen/documents', uploadIntentSchema, input, {
        [CITIZEN_DEVICE_HEADER]: deviceId,
      }),
    confirmUpload: (deviceId: string, documentId: string, sha256: string) =>
      call(
        'POST',
        `/api/citizen/documents/${encodeURIComponent(documentId)}/confirm`,
        documentEnvelope,
        { sha256 },
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),
    updateDocument: (
      deviceId: string,
      documentId: string,
      patch: { title?: string; documentType?: DocumentType },
    ) =>
      call(
        'PATCH',
        `/api/citizen/documents/${encodeURIComponent(documentId)}`,
        documentEnvelope,
        patch,
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),
    deleteDocument: (deviceId: string, documentId: string) =>
      call(
        'DELETE',
        `/api/citizen/documents/${encodeURIComponent(documentId)}`,
        z.null(),
        undefined,
        { [CITIZEN_DEVICE_HEADER]: deviceId },
      ),
  };
}

export type CitizenApi = ReturnType<typeof createCitizenApi>;
