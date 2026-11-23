/**
 * Cross-centre roaming access — the shared vocabulary.
 * Master spec §11, §19.2 (consent), §19.9 (time-boxed access); migration 0024.
 *
 * Everything a walk-in's *visiting* centre may see before the citizen has consented is described
 * by `RoamingCustomerCard` below, and the shape is the privacy control: there is no field on it
 * for a full name, a full mobile number, an address, a date of birth or any identity fragment.
 * A server that can only build this type cannot leak the rest of the record by accident.
 */

import { z } from 'zod';
import type { EducationLevel, SchemeDocumentKey } from '../schemes/types';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Why the citizen is being asked. Consent under the DPDP Act is given for a purpose, not in
 * general, so this travels with the challenge, the grant and the consent record (§19.2).
 */
export const ROAMING_PURPOSES = [
  'form_filling',
  'scheme_application',
  'profile_update',
  'document_access',
] as const;
export type RoamingPurpose = (typeof ROAMING_PURPOSES)[number];

export const ROAMING_PURPOSE_LABELS: Record<RoamingPurpose, { en: string; hi: string }> = {
  form_filling: { en: 'Fill a form', hi: 'फॉर्म भरना' },
  scheme_application: { en: 'Apply for a scheme', hi: 'योजना के लिए आवेदन' },
  profile_update: { en: 'Update saved details', hi: 'सहेजी गई जानकारी अपडेट करना' },
  document_access: { en: 'Use saved documents', hi: 'सहेजे गए दस्तावेज़ों का उपयोग' },
};

/**
 * How consent was proved.
 *
 * `otp` (a code read off the citizen's phone) and `app_approval` (the citizen tapped Approve in
 * the BharatDoc app, migration 0039) are wired. `qr_consent` and `biometric` exist in the check
 * constraint and here so that adding one later is a new code path rather than a migration on a
 * table that already holds live consent records — but nothing in the product mints them yet, and
 * a grant that claims one would be a bug.
 *
 * `app_trusted` (migration 0042) is an app approval where the citizen chose to trust the centre
 * for 30 days instead of a few hours. It is the only method the database lets run past 12 hours,
 * and only an approval in the citizen's own app can mint it — never an OTP read across a counter.
 */
export const ROAMING_AUTH_METHODS = [
  'otp',
  'qr_consent',
  'biometric',
  'app_approval',
  'app_trusted',
] as const;
export type RoamingAuthMethod = (typeof ROAMING_AUTH_METHODS)[number];

export const ROAMING_GRANT_STATUSES = ['active', 'expired', 'revoked'] as const;
export type RoamingGrantStatus = (typeof ROAMING_GRANT_STATUSES)[number];

/** The channel the code goes out on. `sms` is reserved; see `apps/web/lib/roaming/dispatch.ts`. */
export const ROAMING_OTP_CHANNELS = ['whatsapp', 'sms'] as const;
export type RoamingOtpChannel = (typeof ROAMING_OTP_CHANNELS)[number];

/**
 * The windows an operator may offer.
 *
 * Two hours is the default because it is the length of a counter queue plus a form-filling cycle
 * — long enough that the citizen is not re-verifying between two applications, short enough that
 * walking away from the counter ends it. Four hours is the ceiling offered in the UI; the
 * database will not accept more than twelve under any circumstances.
 */
export const ROAMING_DURATION_OPTIONS = [60, 120, 240] as const;
export type RoamingDurationMinutes = (typeof ROAMING_DURATION_OPTIONS)[number];

export const DEFAULT_ROAMING_DURATION_MINUTES: RoamingDurationMinutes = 120;

/** Matches the `customer_access_grants_is_time_boxed` constraint in migration 0024. */
export const MAX_ROAMING_DURATION_MINUTES = 720;

/**
 * Trusted centre (migration 0042; docs/VAULT_BRIDGE_DESIGN.md D2): the citizen lets the operator
 * who served them keep access for 30 days, so a regular customer is not asked again on every
 * visit. Chosen only in the citizen's app, renewable there with one tap, stoppable any time.
 *
 * 30 days rather than the design's 90 because the design's other guard — TOTP MFA for the
 * centre owner (D15) — does not exist yet. Matches `customer_access_grants_is_time_boxed`.
 */
export const TRUSTED_CENTRE_DURATION_MINUTES = 43_200;

/** Live trusted grants one citizen may hold at once (design §7: "≤ 3 per citizen"). */
export const MAX_TRUSTED_CENTRES = 3;

/** How long an unused consent code stays valid. Mirrors the challenge table's default. */
export const ROAMING_OTP_TTL_MINUTES = 5;

/** Wrong guesses allowed before the code is burnt and the citizen has to be asked again. */
export const ROAMING_OTP_MAX_ATTEMPTS = 5;

/** Digits in the code. Six, because it is read aloud across a counter. */
export const ROAMING_OTP_LENGTH = 6;

/**
 * How long a request to the BharatDoc app waits for the citizen (migration 0039). Longer than a
 * code, because the citizen may have to find and unlock their phone first.
 */
export const ROAMING_APP_REQUEST_TTL_MINUTES = 10;

/** What a request to the BharatDoc app can come to. */
export const ROAMING_APP_REQUEST_STATUSES = ['pending', 'approved', 'denied', 'expired'] as const;
export type RoamingAppRequestStatus = (typeof ROAMING_APP_REQUEST_STATUSES)[number];

// ---------------------------------------------------------------------------
// The pre-consent card
// ---------------------------------------------------------------------------

/**
 * Everything a visiting centre may see before consent.
 *
 * The rule for adding a field here: could an operator who has *not* been given consent learn
 * something about this citizen that they could not have learned by looking at the person in
 * front of them and asking one question? If yes, it does not belong on this type.
 *
 * `ageYears` rather than a date of birth, `mobileLast4` rather than a number, `documentsOnFile`
 * as a list of *kinds* rather than anything read off a document. State and district are here
 * because domicile decides half of the schemes the operator is about to pitch.
 */
export type RoamingCustomerCard = {
  customerId: string;
  /** "Rahul S." — see `maskShortName`. */
  displayName: string;
  /** Last four digits only. Rendered as "•••••• 3210". */
  mobileLast4: string | null;
  ageYears: number | null;
  gender: string | null;
  /** Reservation category, which the operator needs to pitch age relaxation correctly. */
  category: string | null;
  state: string | null;
  district: string | null;
  educationLevel: EducationLevel | null;
  /** `SchemeDocumentKey`s the profile can evidence. Kinds only, never a number or an image. */
  documentsOnFile: SchemeDocumentKey[];
  verificationStatus: string;
  /** True once this centre has bookmarked them. Grants nothing on its own. */
  isLinked: boolean;
  /** Signed up in the BharatDoc app themselves (migration 0041), rather than at a centre. */
  fromApp: boolean;
};

/** The three states the UI switches on. */
export const ROAMING_ACCESS_STATES = ['home_org', 'roaming_locked', 'roaming_active'] as const;
export type RoamingAccessState = (typeof ROAMING_ACCESS_STATES)[number];

/**
 * A compact eligibility line for a surface with no room for the full schemes widget — the
 * extension's `RoamingAuthBanner`, mainly. The dashboard's customer page computes and renders
 * `CustomerSchemeReport` itself and does not need this; this is the same eligibility answer,
 * trimmed to what a sidepanel banner can show in one line.
 */
export type RoamingSchemeSummary = {
  slug: string;
  title: { en: string; hi: string };
  estimatedFee: number;
};

/** The live session, as the dashboard and the extension render it. */
export type RoamingSessionView = {
  grantId: string;
  purpose: RoamingPurpose;
  targetSchemeSlug: string | null;
  authMethod: RoamingAuthMethod;
  grantedAt: string;
  expiresAt: string;
};

/** What `GET /api/customers/:id/roaming` answers with. */
export type RoamingAccessView = {
  state: RoamingAccessState;
  card: RoamingCustomerCard | null;
  session: RoamingSessionView | null;
  /** Present when a code is outstanding, so a reopened panel resumes at the code box. */
  challengePending: boolean;
  /** Top eligible schemes, `roaming_locked` only — see `RoamingSchemeSummary`. */
  topSchemes: RoamingSchemeSummary[] | null;
  /**
   * The record belongs to the caller's own centre and the citizen locked that centre in the
   * BharatDoc app (migration 0046). Absent from servers before 0046.
   */
  lockedByCustomer?: boolean;
};

// ---------------------------------------------------------------------------
// Request schemas — every one of these validates an external input (§2 of the rules)
// ---------------------------------------------------------------------------

/**
 * Exactly ten digits, the Indian mobile range.
 *
 * A prefix search across every tenant on the platform would be a national directory, so the
 * lookup refuses anything that is not a whole number somebody has just been told.
 */
export const roamingMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D+/g, ''))
  .refine((digits) => /^[6-9]\d{9}$/.test(digits), 'validation.mobile_invalid');

export const roamingSearchQuerySchema = z.object({
  mobile: roamingMobileSchema,
});
export type RoamingSearchQuery = z.infer<typeof roamingSearchQuerySchema>;

export const roamingLinkInputSchema = z.object({
  customerId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});
export type RoamingLinkInput = z.infer<typeof roamingLinkInputSchema>;

export const roamingOtpRequestSchema = z.object({
  purpose: z.enum(ROAMING_PURPOSES).default('form_filling'),
  /** The scheme the citizen is being asked about, so the message names it. */
  targetSchemeSlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug')
    .optional(),
  durationMinutes: z
    .union([z.literal(60), z.literal(120), z.literal(240)])
    .default(DEFAULT_ROAMING_DURATION_MINUTES),
  channel: z.enum(ROAMING_OTP_CHANNELS).default('whatsapp'),
});
export type RoamingOtpRequestInput = z.infer<typeof roamingOtpRequestSchema>;

/**
 * Ask the citizen to approve in the BharatDoc app. No duration: the citizen picks it on their
 * phone (migration 0039 note 1), so a client that sends one is ignored rather than obeyed.
 */
export const roamingAppRequestSchema = z.object({
  purpose: z.enum(ROAMING_PURPOSES).default('form_filling'),
  targetSchemeSlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug')
    .optional(),
});
export type RoamingAppRequestInput = z.infer<typeof roamingAppRequestSchema>;

/**
 * The citizen's answer in the app: how long the centre may use their profile. 30 days
 * (`TRUSTED_CENTRE_DURATION_MINUTES`) makes it a trusted centre (migration 0042).
 */
export const roamingAppDecisionSchema = z.object({
  durationMinutes: z.union([
    z.literal(60),
    z.literal(120),
    z.literal(240),
    z.literal(TRUSTED_CENTRE_DURATION_MINUTES),
  ]),
});
export type RoamingAppDecisionInput = z.infer<typeof roamingAppDecisionSchema>;

/**
 * One "Request access" for the operator (migration 0046): the server sends it to the citizen's
 * BharatDoc app when they have one, otherwise a WhatsApp code. `durationMinutes` applies to the
 * code only — in the app the citizen picks the time themselves.
 */
export const roamingAccessRequestSchema = z.object({
  purpose: z.enum(ROAMING_PURPOSES).default('form_filling'),
  targetSchemeSlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug')
    .optional(),
  durationMinutes: z
    .union([z.literal(60), z.literal(120), z.literal(240)])
    .default(DEFAULT_ROAMING_DURATION_MINUTES),
});
export type RoamingAccessRequestInput = z.infer<typeof roamingAccessRequestSchema>;

/** Where the request went: wait for the tap in the app, or type back the WhatsApp code. */
export type RoamingAccessRequestResult =
  | { method: 'app'; requestId: string; expiresAt: string }
  | { method: 'otp'; mobileLast4: string | null; expiresInSeconds: number };

/** What the operator's poll of a request answers with. */
export type RoamingAppRequestView =
  | { status: 'pending'; requestId: string; expiresAt: string }
  | { status: 'approved'; requestId: string; session: RoamingSessionView }
  | { status: 'denied' | 'expired'; requestId: string };

/** A pending request as the citizen's app shows it: who is asking and why. Nothing else. */
export type CitizenProfileRequestView = {
  id: string;
  centreName: string;
  purpose: RoamingPurpose;
  expiresAt: string;
  createdAt: string;
};

/**
 * One session as the citizen's "Centre access" screen shows it: which centre, why, until when,
 * and how it ended. Never the operator's name, the customer record or a document.
 */
export type CitizenCentreAccessView = {
  grantId: string;
  centreName: string;
  purpose: RoamingPurpose;
  targetSchemeSlug: string | null;
  /** Thirty-day access the citizen chose (migration 0042). */
  trusted: boolean;
  grantedAt: string;
  expiresAt: string;
  /** `live` while the centre can open the details; otherwise who or what ended it. */
  state: 'live' | 'ended_by_you' | 'ended_by_centre' | 'expired';
  endedAt: string | null;
};

export const roamingOtpVerifySchema = z.object({
  /** Digits only. Spaces are stripped because the message shows the code as "849 201". */
  otp: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D+/g, ''))
    .refine((digits) => digits.length === ROAMING_OTP_LENGTH, 'validation.otp_invalid'),
});
export type RoamingOtpVerifyInput = z.infer<typeof roamingOtpVerifySchema>;

export const roamingRevokeSchema = z.object({
  grantId: z.string().uuid().optional(),
});
export type RoamingRevokeInput = z.infer<typeof roamingRevokeSchema>;
