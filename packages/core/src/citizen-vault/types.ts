/**
 * Citizen Vault bridge — vocabulary and request schemas.
 * docs/VAULT_BRIDGE_DESIGN.md; migration 0038.
 *
 * Shared by the dashboard/API (apps/web), the citizen app (apps/mobile) and the extension, so the
 * three agree on limits and shapes. Pure: no node APIs, no Supabase.
 */

import { z } from 'zod';
import { DOCUMENT_TYPES, type DocumentType } from '../documents/types';
import { normalizeMobile } from '../customers/normalize';

// ---------------------------------------------------------------------------
// Vault sections (CITIZEN_MOBILE_APP_SPEC.md §3 Feature 2)
// ---------------------------------------------------------------------------

export const CITIZEN_VAULT_CATEGORIES = [
  'identity',
  'academic',
  'certificate',
  'form_asset',
] as const;
export type CitizenVaultCategory = (typeof CITIZEN_VAULT_CATEGORIES)[number];

/**
 * Which vault section each core document type belongs to. `null`: not a section of its own
 * (operator-side artefacts and the pre-classification state); stored server-side as `other`.
 * Exhaustive over `DocumentType`, so a new type in core is a typecheck error until placed.
 */
export const CITIZEN_VAULT_DOCUMENT_CATEGORIES: Record<DocumentType, CitizenVaultCategory | null> =
  {
    aadhaar_like: 'identity',
    pan: 'identity',
    voter_id: 'identity',
    marksheet_10: 'academic',
    marksheet_12: 'academic',
    marksheet_graduation: 'academic',
    caste_certificate: 'certificate',
    income_certificate: 'certificate',
    residence_certificate: 'certificate',
    photo: 'form_asset',
    signature: 'form_asset',
    receipt: null,
    application_pdf: null,
    generic: null,
    unknown: null,
  };

/**
 * Whether a document stays on the phone unless the citizen says otherwise
 * (docs/VAULT_BRIDGE_DESIGN.md §15). The scanner is also an everyday tool, so only what a form
 * needs is shared by default: a document whose type has a vault section (Aadhaar, a marksheet, a
 * photo), or one the citizen filed in a section themselves. "Other", a type with no section, and
 * no type at all stay on the phone: never uploaded, so never read.
 */
export function keepsOnPhoneByDefault(
  documentType: DocumentType | null | undefined,
  category?: CitizenVaultCategory | null,
): boolean {
  if (category) return false;
  if (!documentType) return true;
  return CITIZEN_VAULT_DOCUMENT_CATEGORIES[documentType] === null;
}

/** The `citizen_vault_documents.category` value for a document type. */
export function storedVaultCategory(type: DocumentType): CitizenVaultCategory | 'other' {
  return CITIZEN_VAULT_DOCUMENT_CATEGORIES[type] ?? 'other';
}

// ---------------------------------------------------------------------------
// Document folders — the same sections on the phone and on the operator dashboard
// ---------------------------------------------------------------------------

/**
 * Every folder a document can sit in: the four vault sections, then `other` for everything with
 * no section (receipts, generated PDFs, unclassified files). Mirrors the `documents.folder` and
 * `citizen_vault_documents.category` checks (migrations 0043, 0038).
 */
export const DOCUMENT_FOLDERS = [...CITIZEN_VAULT_CATEGORIES, 'other'] as const;
export type DocumentFolder = (typeof DOCUMENT_FOLDERS)[number];

export function isDocumentFolder(value: unknown): value is DocumentFolder {
  return typeof value === 'string' && (DOCUMENT_FOLDERS as readonly string[]).includes(value);
}

/**
 * The folder a document shows in on the dashboard: the one it was filed in (a citizen's choice in
 * the app, carried by `documents.folder`), otherwise the one its type belongs to. An unknown or
 * unrecognised type lands in `other`, never nowhere.
 */
export function documentFolder(documentType: unknown, folder?: unknown): DocumentFolder {
  if (isDocumentFolder(folder)) return folder;
  return typeof documentType === 'string' &&
    (DOCUMENT_TYPES as readonly string[]).includes(documentType)
    ? storedVaultCategory(documentType as DocumentType)
    : 'other';
}

/**
 * What a vault document's section becomes on its customer-side copy: a real section is kept as
 * the citizen filed it; `other` is stored as "no folder" so the copy follows its type — which the
 * reader may still correct from "Other document" to, say, a PAN card.
 */
export function mirrorFolderFrom(category: unknown): CitizenVaultCategory | null {
  return isDocumentFolder(category) && category !== 'other' ? category : null;
}

// ---------------------------------------------------------------------------
// Limits (design §7) — the database CHECKs are the authority for the time boxes
// ---------------------------------------------------------------------------

export const SHARE_CODE_LENGTH = 6;
export const SHARE_CODE_TTL_MINUTES = 5;
export const SHARE_CODE_ATTEMPTS = 3;

export const VAULT_GRANT_DURATIONS = [30, 120] as const;
export type VaultGrantDuration = (typeof VAULT_GRANT_DURATIONS)[number];
export const DEFAULT_VAULT_GRANT_MINUTES: VaultGrantDuration = 120;
export const MAX_VAULT_GRANT_MINUTES = 120;

export const ACCESS_REQUEST_TTL_MINUTES = 10;

export const VAULT_PIN_LENGTH = 4;
export const VAULT_PIN_MAX_FAILURES = 5;
export const VAULT_PIN_LOCK_HOURS = 24;
/**
 * Lifetime wrong PINs before the PIN path is switched off (old phone or the 7-day hold still
 * restore). Five a day forever would give a recycled number's new owner ~3% in 60 days; ten in
 * total caps it near 0.1%.
 */
export const VAULT_PIN_MAX_TOTAL_FAILURES = 10;

export const RESTORE_HOLD_DAYS = 7;
/** A hold restore is refused when the account was idle this long before it was requested. */
export const RESTORE_INACTIVITY_GUARD_DAYS = 60;

export const LOOKUP_LIMITS = {
  perOperatorPer15Minutes: 10,
  perCentrePerHour: 30,
  /** Approval requests delivered to one number, across all centres. */
  perNumberPer15Minutes: 3,
} as const;

export type LookupLimits = { readonly [K in keyof typeof LOOKUP_LIMITS]: number };

/**
 * Local development only (`next dev`): roomy enough to test the app-approval flow repeatedly on
 * one test number. Production always uses LOOKUP_LIMITS.
 */
export const DEV_LOOKUP_LIMITS: LookupLimits = {
  perOperatorPer15Minutes: 100,
  perCentrePerHour: 300,
  perNumberPer15Minutes: 50,
};

export const WRONG_CODE_LIMITS = {
  perCentrePerHour: 10,
  perNumberPerDay: 10,
} as const;

/** Same limit as core's customer `fullName`, so the name the app accepts is the one stored. */
export const DISPLAY_NAME_MAX_LENGTH = 160;

export const MAX_VAULT_FILE_BYTES = 15 * 1024 * 1024;
export const VAULT_FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type VaultFileMimeType = (typeof VAULT_FILE_MIME_TYPES)[number];

/** Same as the on-phone vault's page limit (apps/mobile/lib/vault/vault-index.ts). */
export const MAX_VAULT_DOCUMENT_PAGES = 50;

// ---------------------------------------------------------------------------
// Synced file format v1 (docs/VAULT_BRIDGE_DESIGN.md §3.2)
//
// The phone encrypts the document's file (its image, or one PDF) with the citizen's document key:
// AES-256-GCM, 12-byte IV, 16-byte tag, stored as IV ‖ ciphertext ‖ tag — exactly what
// expo-crypto's `AESSealedData.combined()` writes — with the additional data below. The server
// decrypts with node:crypto in the same layout (apps/web/lib/citizen/vault-file.ts).
// ---------------------------------------------------------------------------

export const VAULT_FILE_IV_BYTES = 12;
export const VAULT_FILE_TAG_BYTES = 16;
export const VAULT_FILE_OVERHEAD_BYTES = VAULT_FILE_IV_BYTES + VAULT_FILE_TAG_BYTES;

/** GCM additional data: binds a file to its citizen and its document row. ASCII. */
export function vaultFileAad(citizenId: string, documentId: string): string {
  return `${citizenId}:${documentId}:vault_document`;
}

/**
 * Header naming the phone (`citizen_devices.id`) on sync calls. Only a phone that received the
 * document key ever learns its device id, so these calls — unlike a bare sign-in — count as the
 * account being in use (the recycled-number guard, design §3.3).
 */
export const CITIZEN_DEVICE_HEADER = 'x-bharatfill-device';

// ---------------------------------------------------------------------------
// Enumerations mirrored from 0038
// ---------------------------------------------------------------------------

export const VAULT_ACCESS_METHODS = ['approval', 'code', 'named_centre'] as const;
export type VaultAccessMethod = (typeof VAULT_ACCESS_METHODS)[number];

export const VAULT_EVENT_ACTIONS = [
  'granted',
  'listed',
  'viewed',
  'attached',
  'copied',
  'ended',
  'restored',
  'restore_refused',
  'pin_changed',
] as const;
export type VaultEventAction = (typeof VAULT_EVENT_ACTIONS)[number];

export const CITIZEN_CONSENT_SUBJECTS = [
  'terms',
  'cloud_sync',
  'centre_copy',
  'named_centre',
] as const;
export type CitizenConsentSubject = (typeof CITIZEN_CONSENT_SUBJECTS)[number];

export const CITIZEN_DEVICE_PLATFORMS = ['android', 'ios'] as const;
export type CitizenDevicePlatform = (typeof CITIZEN_DEVICE_PLATFORMS)[number];

export const VAULT_REQUEST_STATUSES = ['pending', 'approved', 'denied', 'expired'] as const;
export type VaultRequestStatus = (typeof VAULT_REQUEST_STATUSES)[number];

/** Version of the sign-up consent text the app shows. Bump when the wording changes. */
export const CITIZEN_TERMS_VERSION = '2026-11-11';

/**
 * The platform organization that owns every BharatDoc app customer (migration 0041,
 * `public.citizen_app_organization_id()`). It has no members: centres reach its customers only
 * through a roaming grant the citizen gives. Keep in step with the SQL function.
 */
export const CITIZEN_APP_ORGANIZATION_ID = 'b4a7d0c0-a990-4c1e-8d0c-000000000001';

/** Shown as the home centre of an app customer. */
export const CITIZEN_APP_ORGANIZATION_NAME = 'BharatDoc app';

export function isCitizenAppOrganization(organizationId: string | null | undefined): boolean {
  return organizationId === CITIZEN_APP_ORGANIZATION_ID;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

/** "123 456" / "123-456" → "123456" (at most six digits). */
export function normalizeShareCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, SHARE_CODE_LENGTH);
}

/**
 * PINs nobody should pick: one digit repeated, or a straight run up or down (0000, 1234, 9876).
 * Refused at sign-up so the PIN is worth the five tries it allows.
 */
export function isWeakVaultPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  if (digits.every((d) => d === digits[0])) return true;
  const steps = digits.slice(1).map((d, i) => d - (digits[i] ?? 0));
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

const mobileSchema = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    const { value: normalized } = normalizeMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'errors.vault.mobile_invalid' });
      return z.NEVER;
    }
    return normalized;
  });

const vaultPinSchema = z
  .string()
  .regex(/^\d{4}$/, 'errors.vault.pin_format')
  .refine((pin) => !isWeakVaultPin(pin), 'errors.vault.pin_weak');

const deviceSchema = z.object({
  platform: z.enum(CITIZEN_DEVICE_PLATFORMS),
  label: z.string().trim().max(60).optional(),
});

// ---------------------------------------------------------------------------
// Citizen request schemas
// ---------------------------------------------------------------------------

export const citizenAccountCreateSchema = z.object({
  displayName: z.string().trim().min(1, 'errors.vault.name_required').max(DISPLAY_NAME_MAX_LENGTH),
  preferredLocale: z.enum(['en', 'hi']).default('hi'),
  vaultPin: vaultPinSchema,
  termsVersion: z.literal(CITIZEN_TERMS_VERSION),
  cloudSync: z.boolean().default(true),
  device: deviceSchema,
});
export type CitizenAccountCreateInput = z.output<typeof citizenAccountCreateSchema>;

export const citizenAccountUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'errors.vault.name_required')
      .max(DISPLAY_NAME_MAX_LENGTH)
      .optional(),
    preferredLocale: z.enum(['en', 'hi']).optional(),
    cloudSync: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'errors.validation_failed');

export const citizenRestorePinSchema = z.object({
  vaultPin: z.string().regex(/^\d{4}$/, 'errors.vault.pin_format'),
  device: deviceSchema,
});

/**
 * Change the Vault PIN from a signed-in phone. The current PIN is required (a wrong one counts
 * toward the same limits as a restore); the new one follows the sign-up rules and must differ.
 */
export const citizenVaultPinChangeSchema = z
  .object({
    currentPin: z.string().regex(/^\d{4}$/, 'errors.vault.pin_format'),
    newPin: vaultPinSchema,
  })
  .refine((v) => v.currentPin !== v.newPin, {
    message: 'errors.vault.pin_same',
    path: ['newPin'],
  });
export type CitizenVaultPinChangeInput = z.output<typeof citizenVaultPinChangeSchema>;

export const shareCodeIssueSchema = z.object({
  durationMinutes: z.union([z.literal(30), z.literal(120)]).default(DEFAULT_VAULT_GRANT_MINUTES),
  allowCopy: z.boolean().default(false),
});

export const accessRequestDecisionSchema = shareCodeIssueSchema;

/** `sizeBytes` is the plaintext file; the stored object is that plus VAULT_FILE_OVERHEAD_BYTES. */
export const vaultDocumentIntentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(120),
  mimeType: z.enum(VAULT_FILE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_VAULT_FILE_BYTES),
  pageCount: z.number().int().min(1).max(MAX_VAULT_DOCUMENT_PAGES).default(1),
  /**
   * The folder the citizen filed it in on the phone (`other`: no folder). Absent — an app build
   * from before folders synced — means "the folder its type belongs to".
   */
  category: z.enum(DOCUMENT_FOLDERS).optional(),
});

/** SHA-256 (hex) of the encrypted object the phone uploaded. */
export const vaultDocumentConfirmSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'errors.validation_failed'),
});

export const vaultDocumentUpdateSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    /** Moved to another folder on the phone. */
    category: z.enum(DOCUMENT_FOLDERS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'errors.validation_failed');

// ---------------------------------------------------------------------------
// Operator request schemas
// ---------------------------------------------------------------------------

export const vaultLookupSchema = z.object({ mobile: mobileSchema });

export const vaultUnlockSchema = z.object({
  mobile: mobileSchema,
  code: z
    .string()
    .max(20)
    .transform(normalizeShareCode)
    .refine((code) => code.length === SHARE_CODE_LENGTH, 'errors.vault.code_format'),
});
