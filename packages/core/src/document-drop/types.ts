/**
 * Walk-in document drop — domain vocabulary and the schemas that guard every boundary.
 * Master spec §9.1 (walk-in intake), §12 (documents), §17.3 (validate external input).
 *
 * Three boundaries are validated here, and all three are hostile until parsed: a Meta webhook
 * body, a Telegram update, and an operator's own request. The messaging payload schemas are
 * deliberately loose about fields we do not read — a provider adding a key must not break
 * intake — and strict about the handful we do.
 */

import { z } from 'zod';
import { DOCUMENT_TYPES, sanitizeFilename, type DocumentType } from '../documents/types';

// ---------------------------------------------------------------------------
// Channels and statuses
// ---------------------------------------------------------------------------

export const DROP_CHANNELS = ['whatsapp', 'telegram', 'web'] as const;
export type DropChannel = (typeof DROP_CHANNELS)[number];

export function isDropChannel(value: unknown): value is DropChannel {
  return typeof value === 'string' && (DROP_CHANNELS as readonly string[]).includes(value);
}

export const DROP_SESSION_STATUSES = [
  'active',
  'ready',
  'converted',
  'expired',
  'abandoned',
] as const;
export type DropSessionStatus = (typeof DROP_SESSION_STATUSES)[number];

/**
 * Statuses that can still receive a file or be claimed by an operator.
 *
 * `ready` is not a lock: the citizen saying "DONE" means they think they are finished, and they
 * routinely are not. It changes what the queue row looks like, not what the session accepts.
 */
export const CLAIMABLE_DROP_STATUSES: readonly DropSessionStatus[] = ['active', 'ready'];

export function isClaimableDropStatus(status: string): boolean {
  return (CLAIMABLE_DROP_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * How long a session can be messaged. Deliberately short: an unclaimed session holds a
 * citizen's identity documents outside the customer record, so the window is the length of a
 * queue at a busy counter, not a working day (§12.7).
 */
export const DROP_SESSION_TTL_MINUTES = 120;

/** What the QR modal counts down. The session outlives it, so a slow citizen is not cut off. */
export const DROP_QR_VALIDITY_MINUTES = 15;

/**
 * A ceiling on one session, so a stuck client or a bored citizen cannot fill the bucket. Ten
 * covers the largest realistic set — Aadhaar front and back, three marksheets, caste, income,
 * residence, photo, signature.
 */
export const MAX_DROP_FILES_PER_SESSION = 10;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type DocumentDropSession = {
  id: string;
  organizationId: string;
  sessionCode: string;
  channel: DropChannel;
  /** The citizen's messaging identifier. Personal data — see the note in 0022. */
  senderId: string | null;
  senderName: string | null;
  status: DropSessionStatus;
  customerId: string | null;
  expiresAt: string;
  createdAt: string;
};

export type DocumentDropFile = {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  suggestedDocumentType: DocumentType;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Org-scoped so a leaked path cannot address another tenant's object, and session-scoped so the
 * retention sweep can reason about a whole intake at once.
 */
export function dropStoragePath(input: {
  organizationId: string;
  sessionId: string;
  fileId: string;
  filename: string;
}): string {
  return `org/${input.organizationId}/drop/${input.sessionId}/${input.fileId}-${sanitizeFilename(
    input.filename,
  )}`;
}

// ---------------------------------------------------------------------------
// Document type hints
// ---------------------------------------------------------------------------

/**
 * Reads the citizen's own words for a hint about what they just sent.
 *
 * A hint, and nothing more: it becomes `suggested_document_type`, the classifier still runs on
 * intake, and the operator still confirms in review. Both languages are matched because a
 * caption at an Indian counter arrives in either — or in both at once.
 */
const TYPE_HINTS: readonly (readonly [DocumentType, readonly string[]])[] = [
  ['aadhaar_like', ['aadhaar', 'aadhar', 'adhar', 'आधार']],
  ['pan', ['pan card', 'pancard', 'पैन']],
  ['voter_id', ['voter', 'epic', 'मतदाता', 'वोटर']],
  ['marksheet_10', ['10th', 'tenth', 'high school', 'hsc', 'matric', 'दसवीं', '10वीं']],
  ['marksheet_12', ['12th', 'twelfth', 'intermediate', 'inter', 'बारहवीं', '12वीं']],
  ['marksheet_graduation', ['graduation', 'degree', 'ba ', 'bsc', 'bcom', 'स्नातक']],
  ['caste_certificate', ['caste', 'jati', 'जाति']],
  ['income_certificate', ['income', 'aay', 'आय']],
  ['residence_certificate', ['residence', 'domicile', 'niwas', 'निवास']],
  ['photo', ['photo', 'photograph', 'passport size', 'फोटो']],
  ['signature', ['signature', 'sign', 'हस्ताक्षर']],
  ['marksheet_10', ['marksheet', 'marks sheet', 'अंकपत्र']],
];

export function suggestDocumentTypeFromHint(hint: string | null | undefined): DocumentType {
  if (!hint) return 'unknown';
  const lower = hint.toLowerCase();
  for (const [type, needles] of TYPE_HINTS) {
    if (needles.some((needle) => lower.includes(needle))) return type;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Operator-facing schemas
// ---------------------------------------------------------------------------

export const dropChannelSchema = z.enum(DROP_CHANNELS);

export const createDropSessionSchema = z.object({
  channel: dropChannelSchema.default('whatsapp'),
});
export type CreateDropSessionInput = z.output<typeof createDropSessionSchema>;

export const convertDropSessionSchema = z.object({
  /**
   * Attach to somebody already on file instead of creating a profile. The returning customer is
   * the common case at a CSC — the same person comes back for the next scheme.
   */
  customerId: z.string().uuid().optional(),
  /** Used only when creating a profile; the citizen's name as the operator heard it. */
  fullName: z.string().trim().min(2).max(160).optional(),
});
export type ConvertDropSessionInput = z.output<typeof convertDropSessionSchema>;

/**
 * The sandbox drop. Fixtures are named, never uploaded: accepting arbitrary bytes here would
 * turn a developer convenience into a second, unvalidated intake path.
 */
export const SIMULATED_DROP_FIXTURES = ['aadhaar', 'marksheet_10', 'photo'] as const;
export type SimulatedDropFixture = (typeof SIMULATED_DROP_FIXTURES)[number];

export const simulateDropSchema = z.object({
  fixtures: z.array(z.enum(SIMULATED_DROP_FIXTURES)).min(1).max(MAX_DROP_FILES_PER_SESSION),
  /** A fake sender, so the queue row looks like a real walk-in. Test numbers only (§32.1). */
  senderId: z
    .string()
    .trim()
    .regex(/^[0-9]{10,15}$/, 'validation.mobile_invalid')
    .optional(),
});
export type SimulateDropInput = z.output<typeof simulateDropSchema>;

/** The citizen's own tap on the mobile web page. Bytes are validated separately, by sniffing. */
export const webDropUploadSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES).optional(),
});

// ---------------------------------------------------------------------------
// WhatsApp Cloud API webhook (Meta)
// ---------------------------------------------------------------------------

/**
 * Only the message shapes intake acts on. `passthrough` at every level: Meta ships new keys
 * without warning, and a walk-in citizen's documents must not stop arriving because of one.
 */
const whatsappMessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: z
      .object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() })
      .passthrough()
      .optional(),
    document: z
      .object({
        id: z.string(),
        mime_type: z.string().optional(),
        filename: z.string().optional(),
        caption: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const whatsappValueSchema = z
  .object({
    contacts: z
      .array(
        z
          .object({ profile: z.object({ name: z.string() }).passthrough().optional() })
          .passthrough(),
      )
      .optional(),
    messages: z.array(whatsappMessageSchema).optional(),
  })
  .passthrough();

export const whatsappWebhookSchema = z
  .object({
    object: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(z.object({ value: whatsappValueSchema }).passthrough())
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export type WhatsappWebhookPayload = z.output<typeof whatsappWebhookSchema>;
export type WhatsappMessage = z.output<typeof whatsappMessageSchema>;

// ---------------------------------------------------------------------------
// Telegram Bot API webhook
// ---------------------------------------------------------------------------

const telegramPhotoSizeSchema = z
  .object({
    file_id: z.string(),
    file_size: z.number().int().nonnegative().optional(),
    width: z.number().int().nonnegative().optional(),
    height: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        message_id: z.number().int(),
        chat: z.object({ id: z.union([z.number().int(), z.string()]) }).passthrough(),
        from: z
          .object({ first_name: z.string().optional(), username: z.string().optional() })
          .passthrough()
          .optional(),
        text: z.string().optional(),
        caption: z.string().optional(),
        /** Telegram sends several renditions; the last is the largest. */
        photo: z.array(telegramPhotoSizeSchema).optional(),
        document: z
          .object({
            file_id: z.string(),
            file_name: z.string().optional(),
            mime_type: z.string().optional(),
            file_size: z.number().int().nonnegative().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TelegramUpdate = z.output<typeof telegramUpdateSchema>;
