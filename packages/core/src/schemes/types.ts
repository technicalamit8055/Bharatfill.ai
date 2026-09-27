/**
 * The scheme & vacancy matcher vocabulary.
 *
 * A scheme definition is a *claim about government rules*, so everything here is written to be
 * auditable rather than clever: criteria are declarative data, the evaluator that reads them is
 * pure, and every reason the engine gives back is a code the UI translates — never a sentence
 * baked into domain logic (docs/DEVELOPMENT_RULES.md, "every user-facing string is a key").
 *
 * Three-valued matching is the load-bearing idea. A criterion can pass, fail, or be *unknown*
 * because the profile does not carry the answer yet. Folding "unknown" into "fail" would hide
 * exactly the schemes an operator can unlock by asking one question at the counter, which is the
 * whole point of the feature.
 */

import { z } from 'zod';
import { INDIAN_STATE_CODES, type IndianStateCode } from './states';

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const SCHEME_CATEGORIES = [
  'recruitment',
  'welfare',
  'scholarship',
  'certificate',
  'business_loan',
] as const;
export type SchemeCategory = (typeof SCHEME_CATEGORIES)[number];

export const SCHEME_CATEGORY_LABELS: Record<SchemeCategory, { en: string; hi: string }> = {
  recruitment: { en: 'Recruitment', hi: 'भर्ती' },
  welfare: { en: 'Welfare', hi: 'कल्याण' },
  scholarship: { en: 'Scholarship', hi: 'छात्रवृत्ति' },
  certificate: { en: 'Certificate', hi: 'प्रमाण पत्र' },
  business_loan: { en: 'Business & loan', hi: 'व्यवसाय एवं ऋण' },
};

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export const EDUCATION_LEVELS = [
  'none',
  'class8',
  'class10',
  'class12',
  'iti',
  'diploma',
  'graduation',
  'post_graduation',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, { en: string; hi: string }> = {
  none: { en: 'No formal qualification', hi: 'कोई औपचारिक योग्यता नहीं' },
  class8: { en: 'Class 8 pass', hi: 'कक्षा 8 पास' },
  class10: { en: 'Class 10 pass', hi: 'कक्षा 10 पास' },
  class12: { en: 'Class 12 pass', hi: 'कक्षा 12 पास' },
  iti: { en: 'ITI', hi: 'आईटीआई' },
  diploma: { en: 'Diploma', hi: 'डिप्लोमा' },
  graduation: { en: 'Graduate', hi: 'स्नातक' },
  post_graduation: { en: 'Post-graduate', hi: 'स्नातकोत्तर' },
};

/**
 * What each qualification *also* proves, itself included.
 *
 * Deliberately not a single numeric ladder. ITI and a polytechnic diploma both sit above class 10
 * and below graduation, but neither is a class 12 pass — a linear rank would quietly qualify an
 * ITI holder for every 12th-pass vacancy, and the citizen would find out at document
 * verification. A scheme that genuinely accepts them says so via `alsoAcceptsEducation`.
 */
export const EDUCATION_IMPLIES: Record<EducationLevel, readonly EducationLevel[]> = {
  none: ['none'],
  class8: ['class8', 'none'],
  class10: ['class10', 'class8', 'none'],
  class12: ['class12', 'class10', 'class8', 'none'],
  iti: ['iti', 'class10', 'class8', 'none'],
  diploma: ['diploma', 'class10', 'class8', 'none'],
  graduation: ['graduation', 'class12', 'class10', 'class8', 'none'],
  post_graduation: ['post_graduation', 'graduation', 'class12', 'class10', 'class8', 'none'],
};

export function educationSatisfies(
  held: EducationLevel,
  required: EducationLevel,
  alsoAccepts: readonly EducationLevel[] = [],
): boolean {
  if (alsoAccepts.includes(held)) return true;
  return EDUCATION_IMPLIES[held].includes(required);
}

// ---------------------------------------------------------------------------
// Reservation category and gender
// ---------------------------------------------------------------------------

export const RESERVATION_CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews'] as const;
export type ReservationCategory = (typeof RESERVATION_CATEGORIES)[number];

export const SCHEME_GENDERS = ['all', 'male', 'female', 'transgender'] as const;
export type SchemeGender = (typeof SCHEME_GENDERS)[number];

/** Keys an upper-age relaxation can be granted against. */
export const AGE_RELAXATION_KEYS = ['obc', 'sc', 'st', 'ews', 'pwd', 'female'] as const;
export type AgeRelaxationKey = (typeof AGE_RELAXATION_KEYS)[number];

/** The statutory benchmark for a "person with disability" under the RPwD Act. */
export const PWD_BENCHMARK_PERCENTAGE = 40;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const SCHEME_DOCUMENT_KEYS = [
  'aadhaar',
  'pan',
  'caste_certificate',
  'income_certificate',
  'domicile_certificate',
  'ews_certificate',
  'disability_certificate',
  'birth_certificate',
  'marksheet_10th',
  'marksheet_12th',
  'marksheet_graduation',
  'bank_account',
  'ration_card',
  'photo',
  'signature',
] as const;
export type SchemeDocumentKey = (typeof SCHEME_DOCUMENT_KEYS)[number];

export type SchemeDocumentDef = {
  key: SchemeDocumentKey;
  label: { en: string; hi: string };
  /**
   * Profile field keys that count as evidence the document is on file. Any one present is enough
   * — a caste certificate proves itself by its number just as well as by its issuing authority.
   */
  evidenceFieldKeys: readonly string[];
  /**
   * False when the profile can never settle the question (a passport photo is not a profile
   * field). Those are shown to the operator as a reminder and never block eligibility.
   */
  profileVerifiable: boolean;
};

export const SCHEME_DOCUMENTS: Record<SchemeDocumentKey, SchemeDocumentDef> = {
  aadhaar: {
    key: 'aadhaar',
    label: { en: 'Aadhaar', hi: 'आधार' },
    evidenceFieldKeys: ['customer.aadhaar_last4', 'customer.aadhaar'],
    profileVerifiable: true,
  },
  pan: {
    key: 'pan',
    label: { en: 'PAN card', hi: 'पैन कार्ड' },
    evidenceFieldKeys: ['customer.pan'],
    profileVerifiable: false,
  },
  caste_certificate: {
    key: 'caste_certificate',
    label: { en: 'Caste certificate', hi: 'जाति प्रमाण पत्र' },
    evidenceFieldKeys: [
      'customer.certificate.caste.number',
      'customer.certificate.caste.issue_date',
    ],
    profileVerifiable: true,
  },
  income_certificate: {
    key: 'income_certificate',
    label: { en: 'Income certificate', hi: 'आय प्रमाण पत्र' },
    evidenceFieldKeys: [
      'customer.certificate.income.number',
      'customer.certificate.income.issue_date',
    ],
    profileVerifiable: true,
  },
  domicile_certificate: {
    key: 'domicile_certificate',
    label: { en: 'Domicile / residence certificate', hi: 'निवास प्रमाण पत्र' },
    evidenceFieldKeys: [
      'customer.certificate.residence.number',
      'customer.certificate.residence.issue_date',
    ],
    profileVerifiable: true,
  },
  ews_certificate: {
    key: 'ews_certificate',
    label: { en: 'EWS certificate', hi: 'ईडब्ल्यूएस प्रमाण पत्र' },
    evidenceFieldKeys: ['customer.certificate.ews.number', 'customer.certificate.ews.issue_date'],
    profileVerifiable: true,
  },
  disability_certificate: {
    key: 'disability_certificate',
    label: { en: 'Disability certificate', hi: 'दिव्यांगता प्रमाण पत्र' },
    evidenceFieldKeys: ['customer.certificate.disability.number', 'customer.disability_percentage'],
    profileVerifiable: true,
  },
  birth_certificate: {
    key: 'birth_certificate',
    label: { en: 'Birth certificate', hi: 'जन्म प्रमाण पत्र' },
    evidenceFieldKeys: ['customer.certificate.birth.number'],
    profileVerifiable: true,
  },
  marksheet_10th: {
    key: 'marksheet_10th',
    label: { en: 'Class 10 marksheet', hi: 'कक्षा 10 अंकपत्र' },
    evidenceFieldKeys: [
      'customer.education.class10.passing_year',
      'customer.education.class10.roll_number',
      'customer.education.class10.marksheet_number',
    ],
    profileVerifiable: true,
  },
  marksheet_12th: {
    key: 'marksheet_12th',
    label: { en: 'Class 12 marksheet', hi: 'कक्षा 12 अंकपत्र' },
    evidenceFieldKeys: [
      'customer.education.class12.passing_year',
      'customer.education.class12.roll_number',
      'customer.education.class12.marksheet_number',
    ],
    profileVerifiable: true,
  },
  marksheet_graduation: {
    key: 'marksheet_graduation',
    label: { en: 'Graduation marksheet', hi: 'स्नातक अंकपत्र' },
    evidenceFieldKeys: [
      'customer.education.graduation.passing_year',
      'customer.education.graduation.roll_number',
      'customer.education.graduation.marksheet_number',
    ],
    profileVerifiable: true,
  },
  bank_account: {
    key: 'bank_account',
    label: { en: 'Bank account', hi: 'बैंक खाता' },
    // The account number itself lives encrypted and is not in the autofill value map, so the
    // IFSC and holder name stand in as evidence that the account has been captured.
    evidenceFieldKeys: ['customer.bank.ifsc', 'customer.bank.account_holder_name'],
    profileVerifiable: true,
  },
  ration_card: {
    key: 'ration_card',
    label: { en: 'Ration card', hi: 'राशन कार्ड' },
    evidenceFieldKeys: ['customer.ration_card'],
    profileVerifiable: false,
  },
  photo: {
    key: 'photo',
    label: { en: 'Passport photo', hi: 'पासपोर्ट फोटो' },
    evidenceFieldKeys: [],
    profileVerifiable: false,
  },
  signature: {
    key: 'signature',
    label: { en: 'Signature', hi: 'हस्ताक्षर' },
    evidenceFieldKeys: [],
    profileVerifiable: false,
  },
};

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

/**
 * Facts about a customer's livelihood that the profile model does not carry and this feature is
 * not entitled to invent (adding an occupation field to `customers` is a product decision, not a
 * refactor — see packages/core/src/customers/field-keys.ts). They surface as a question the
 * operator answers at the counter, and never as a silent rejection.
 */
export const SCHEME_TRAITS = [
  'farmer',
  'artisan',
  'street_vendor',
  'unorganized_worker',
  'bpl',
  'student',
  'senior_citizen',
] as const;
export type SchemeTrait = (typeof SCHEME_TRAITS)[number];

export const SCHEME_TRAIT_LABELS: Record<SchemeTrait, { en: string; hi: string }> = {
  farmer: { en: 'Cultivator / land-owning farmer', hi: 'किसान / भूमिधारक' },
  artisan: { en: 'Traditional artisan or craftsperson', hi: 'पारंपरिक कारीगर या शिल्पकार' },
  street_vendor: { en: 'Street vendor', hi: 'रेहड़ी-पटरी विक्रेता' },
  unorganized_worker: { en: 'Unorganised-sector worker', hi: 'असंगठित क्षेत्र का श्रमिक' },
  bpl: { en: 'Below Poverty Line household', hi: 'गरीबी रेखा से नीचे परिवार' },
  student: { en: 'Currently studying', hi: 'वर्तमान में अध्ययनरत' },
  senior_citizen: { en: 'Senior citizen', hi: 'वरिष्ठ नागरिक' },
};

// ---------------------------------------------------------------------------
// Eligibility criteria
// ---------------------------------------------------------------------------

export type SchemeEligibilityCriteria = {
  minAge?: number;
  maxAge?: number;
  /**
   * Upper-age relaxation in years. Never applied to `minAge` — no government scheme lets a
   * candidate be *younger* than the floor because of their category.
   */
  ageRelaxations?: Partial<Record<AgeRelaxationKey, number>>;
  /** Age is reckoned on this date when present (recruitment notifications always set one). */
  ageCutoffDate?: string;
  gender?: SchemeGender;
  /** Empty or absent means All-India. */
  allowedStates?: readonly IndianStateCode[];
  /** Empty or absent means open to every category. */
  allowedCategories?: readonly ReservationCategory[];
  minEducationLevel?: EducationLevel;
  /** Qualifications accepted alongside `minEducationLevel` that it does not imply (ITI, diploma). */
  alsoAcceptsEducation?: readonly EducationLevel[];
  /** Annual family income ceiling in rupees. */
  maxAnnualIncome?: number;
  requiredDocuments?: readonly SchemeDocumentKey[];
  requiredTraits?: readonly SchemeTrait[];
};

// ---------------------------------------------------------------------------
// Lifecycle and schedule
// ---------------------------------------------------------------------------

/**
 * Where a scheme sits in its application cycle *today*.
 *
 * This is the axis the whole feature turns on. An operator does not want a library of every
 * scheme that has ever existed — they want the handful a walk-in can act on this week, plus the
 * ones worth collecting documents for before the rush. `closed` exists so that a lapsed window
 * is named rather than quietly rendered as an opportunity; nothing closed is ever offered as a
 * match.
 */
export const SCHEME_LIFECYCLE_STATUSES = [
  'active',
  'closing_soon',
  'upcoming',
  'evergreen',
  'closed',
] as const;
export type SchemeLifecycleStatus = (typeof SCHEME_LIFECYCLE_STATUSES)[number];

/** How near a deadline has to be before it outranks fee in the operator's worklist. */
export const CLOSING_SOON_DAYS = 7;

export type SchemeSchedule = {
  /**
   * ISO date the form goes live, or `null` when no window has been published.
   *
   * A future start date is the pre-collect case: the operator banks the paperwork now and files
   * on day one, instead of joining the queue in the last week like everyone else.
   */
  applicationStartDate: string | null;
  /**
   * ISO date the window shuts, or `null` when it is untracked.
   *
   * Built-in schemes ship with `null` on purpose: a recruitment cycle's real closing date moves
   * with every notification, and a stale hardcoded date read out to a citizen at the counter is
   * worse than no date at all. A countdown appears only once somebody has entered a real date, so
   * the UI stays quiet rather than confident and wrong.
   */
  applicationEndDate: string | null;
  /** True for permanently open schemes (PM-Kisan, e-Shram). They are never `closed`. */
  isAlwaysOpen: boolean;
  /** Published exam date where one is known. Display only — it gates nothing. */
  examDate: string | null;
};

// ---------------------------------------------------------------------------
// Scheme definition
// ---------------------------------------------------------------------------

export type LocalisedText = { en: string; hi: string };

export type SchemeDefinition = {
  id: string;
  slug: string;
  title: LocalisedText;
  shortDescription: LocalisedText;
  benefitsSummary: LocalisedText;
  /** The one-line money line for a badge: "₹6,000 / year", "₹5 lakh health cover". */
  benefitHighlight: LocalisedText;
  category: SchemeCategory;
  portalName: string;
  portalUrl: string;
  /** Links to a `portal_adapters` slug when the extension can autofill this form. */
  adapterSlug?: string;
  officialNotificationUrl: string | null;
  /** When the window opens, when it shuts, and whether it ever shuts. */
  schedule: SchemeSchedule;
  /** Typical service charge a centre bills for this application, in rupees. */
  estimatedOperatorFee: number;
  eligibility: SchemeEligibilityCriteria;
  /** Said while the window is open. Supports `{name}`, `{scheme}` and `{fee}`. */
  pitchTemplate: LocalisedText;
  /**
   * Said before the window opens — the pre-collect script. Supports the same placeholders plus
   * `{days}`, the number of days until the form goes live.
   */
  upcomingPitchTemplate: LocalisedText;
  /**
   * Object path of the scheme's logo in the private `SCHEME_LOGO_BUCKET`, or absent for the
   * category icon. A path, never a URL — see `SCHEME_LOGO_PATH_PATTERN`.
   */
  logoPath?: string | null;
  /** Wide artwork behind the detail page's hero (migration 0028). Same rules as `logoPath`. */
  bannerPath?: string | null;
  /** Picture beside "What the customer gets" on the detail page (0028). Same rules as `logoPath`. */
  illustrationPath?: string | null;
};

// ---------------------------------------------------------------------------
// Logos and artwork
// ---------------------------------------------------------------------------

/**
 * Private bucket, served to signed-in users by the web app (migration 0027). Holds every scheme
 * image kind — the name predates banners and illustrations (0028).
 */
export const SCHEME_LOGO_BUCKET = 'scheme-logos';

/** The images an admin can attach to a catalogue row, each with its own column. */
export const SCHEME_IMAGE_KINDS = ['logo', 'banner', 'illustration'] as const;
export type SchemeImageKind = (typeof SCHEME_IMAGE_KINDS)[number];

/**
 * `<slug>/<uuid>.<ext>` — the only shape the upload action builds, and the same pattern the
 * `schemes_catalog_{logo,banner,illustration}_path_shape` constraints enforce. Anchored and
 * slash-free apart from the one separator, so a stored value cannot walk out of its folder or
 * name a remote host.
 */
export const SCHEME_LOGO_PATH_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/;

export function isSchemeLogoPath(value: unknown): value is string {
  return typeof value === 'string' && SCHEME_LOGO_PATH_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Match results
// ---------------------------------------------------------------------------

export const SCHEME_MATCH_STATUSES = ['eligible', 'actionable_missing_docs', 'ineligible'] as const;
export type SchemeMatchStatus = (typeof SCHEME_MATCH_STATUSES)[number];

export const SCHEME_CRITERIA = [
  'age',
  'gender',
  'state',
  'category',
  'education',
  'income',
  'documents',
  'traits',
] as const;
export type SchemeCriterion = (typeof SCHEME_CRITERIA)[number];

/** Why a criterion could not be decided. Translated by the UI, never rendered raw. */
export const SCHEME_UNKNOWN_REASONS = [
  'UNKNOWN_DATE_OF_BIRTH',
  'UNKNOWN_GENDER',
  'UNKNOWN_STATE',
  'UNKNOWN_CATEGORY',
  'UNKNOWN_EDUCATION',
  'UNKNOWN_INCOME',
  'DOCUMENT_NOT_ON_FILE',
  'TRAIT_NOT_CONFIRMED',
] as const;
export type SchemeUnknownReason = (typeof SCHEME_UNKNOWN_REASONS)[number];

export const SCHEME_INELIGIBILITY_CODES = [
  'AGE_BELOW_MINIMUM',
  'AGE_ABOVE_MAXIMUM',
  'GENDER_NOT_ELIGIBLE',
  'STATE_NOT_ELIGIBLE',
  'CATEGORY_NOT_ELIGIBLE',
  'EDUCATION_BELOW_REQUIREMENT',
  'INCOME_ABOVE_CEILING',
] as const;
export type SchemeIneligibilityCode = (typeof SCHEME_INELIGIBILITY_CODES)[number];

export type SchemeIneligibility = {
  code: SchemeIneligibilityCode;
  criterion: SchemeCriterion;
  /** Interpolation values for the translated message, e.g. `{ required: 21, actual: 24 }`. */
  values?: Record<string, string | number>;
};

export type MissingRequirementKind = 'profile_field' | 'document' | 'operator_confirmation';

export type SchemeMissingRequirement = {
  kind: MissingRequirementKind;
  /** A `customer.*` field key, a `SchemeDocumentKey`, or a `SchemeTrait`, per `kind`. */
  fieldKey: string;
  label: LocalisedText;
  reason: SchemeUnknownReason;
  criterion: SchemeCriterion;
};

export type DocumentChecklistState = 'ready' | 'missing' | 'unverifiable';

export type SchemeDocumentChecklistItem = {
  key: SchemeDocumentKey;
  label: LocalisedText;
  state: DocumentChecklistState;
};

export type SchemeMatchResult = {
  scheme: SchemeDefinition;
  status: SchemeMatchStatus;
  matchedCriteria: SchemeCriterion[];
  missingRequirements: SchemeMissingRequirement[];
  ineligibilityReasons: SchemeIneligibility[];
  documentChecklist: SchemeDocumentChecklistItem[];
  estimatedFee: number;
  /** Age on the cutoff date (or on the evaluation date when the scheme sets none). */
  ageAtCutoff: number | null;
  /** Upper age limit after category / PwD / gender relaxation, `null` when the scheme sets none. */
  effectiveMaxAge: number | null;
  /** Relaxation years actually applied, for the "why do I qualify?" breakdown. */
  appliedRelaxations: Partial<Record<AgeRelaxationKey, number>>;
  /** Where this scheme's window sits today. `closed` never reaches a customer report. */
  lifecycleStatus: SchemeLifecycleStatus;
  /** Days left in the window; `null` when no end date is tracked, negative once it has passed. */
  daysRemaining: number | null;
  /** Days until the window opens; `null` when it is already open or no start date is tracked. */
  daysUntilOpen: number | null;
  pitch: LocalisedText;
};

export type CustomerSchemeReport = {
  /** Eligible and open right now — evergreen, active or closing soon. Sellable today. */
  activeOpportunities: SchemeMatchResult[];
  /** Eligible but not open yet. Collect the documents now and file on day one. */
  upcomingOpportunities: SchemeMatchResult[];
  /** One certificate or one answered question away, whether or not the window is open. */
  actionableMissingDocs: SchemeMatchResult[];
  /** Ruled out by the rules themselves, kept so a detail page can explain why. */
  ineligible: SchemeMatchResult[];
  /** Fees for everything the operator could plausibly bill — every bucket except `ineligible`. */
  totalPotentialFee: number;
  topPitchScript: LocalisedText | null;
};

// ---------------------------------------------------------------------------
// The profile the evaluator reads
// ---------------------------------------------------------------------------

/**
 * A narrow projection of a customer, built from the flat `customer.*` value map.
 *
 * Deliberately not the `customers` row: the evaluator has no business seeing a mobile number, an
 * address or an Aadhaar fragment, and keeping the input this small is what makes it safe to log a
 * mismatch during development without leaking PII.
 */
export type SchemeCustomerProfile = {
  dateOfBirth: string | null;
  gender: string | null;
  category: string | null;
  state: IndianStateCode | null;
  annualIncome: number | null;
  educationLevel: EducationLevel | null;
  disabilityPercentage: number | null;
  availableDocuments: ReadonlySet<SchemeDocumentKey>;
  /** Livelihood facts the operator has confirmed. Absent means "not asked", not "no". */
  confirmedTraits: ReadonlySet<SchemeTrait>;
};

// ---------------------------------------------------------------------------
// Zod — the catalogue is parsed, not trusted
// ---------------------------------------------------------------------------

const localisedTextSchema = z.object({
  en: z.string().min(1),
  hi: z.string().min(1),
});

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'validation.date_invalid');

export const schemeEligibilityCriteriaSchema = z
  .object({
    minAge: z.number().int().min(0).max(120).optional(),
    maxAge: z.number().int().min(0).max(120).optional(),
    ageRelaxations: z
      .record(z.enum(AGE_RELAXATION_KEYS), z.number().int().min(0).max(30))
      .optional(),
    ageCutoffDate: isoDateSchema.optional(),
    gender: z.enum(SCHEME_GENDERS).optional(),
    allowedStates: z.array(z.enum(INDIAN_STATE_CODES)).optional(),
    allowedCategories: z.array(z.enum(RESERVATION_CATEGORIES)).optional(),
    minEducationLevel: z.enum(EDUCATION_LEVELS).optional(),
    alsoAcceptsEducation: z.array(z.enum(EDUCATION_LEVELS)).optional(),
    maxAnnualIncome: z.number().int().min(0).optional(),
    requiredDocuments: z.array(z.enum(SCHEME_DOCUMENT_KEYS)).optional(),
    requiredTraits: z.array(z.enum(SCHEME_TRAITS)).optional(),
  })
  .refine(
    (criteria) =>
      criteria.minAge === undefined ||
      criteria.maxAge === undefined ||
      criteria.minAge <= criteria.maxAge,
    { message: 'schemes.invalid_age_range' },
  );

export const schemeScheduleSchema = z
  .object({
    applicationStartDate: isoDateSchema.nullable(),
    applicationEndDate: isoDateSchema.nullable(),
    isAlwaysOpen: z.boolean(),
    examDate: isoDateSchema.nullable(),
  })
  // ISO-8601 dates sort lexicographically, so a string comparison is the whole ordering check.
  .refine(
    (schedule) =>
      schedule.applicationStartDate === null ||
      schedule.applicationEndDate === null ||
      schedule.applicationStartDate <= schedule.applicationEndDate,
    { message: 'schemes.invalid_schedule_window' },
  );

export const schemeDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug'),
  title: localisedTextSchema,
  shortDescription: localisedTextSchema,
  benefitsSummary: localisedTextSchema,
  benefitHighlight: localisedTextSchema,
  category: z.enum(SCHEME_CATEGORIES),
  portalName: z.string().min(1).max(120),
  portalUrl: z.string().url(),
  adapterSlug: z.string().min(1).max(80).optional(),
  officialNotificationUrl: z.string().url().nullable(),
  schedule: schemeScheduleSchema,
  estimatedOperatorFee: z.number().int().min(0).max(10_000),
  eligibility: schemeEligibilityCriteriaSchema,
  pitchTemplate: localisedTextSchema,
  upcomingPitchTemplate: localisedTextSchema,
  logoPath: z.string().regex(SCHEME_LOGO_PATH_PATTERN).nullable().optional(),
  bannerPath: z.string().regex(SCHEME_LOGO_PATH_PATTERN).nullable().optional(),
  illustrationPath: z.string().regex(SCHEME_LOGO_PATH_PATTERN).nullable().optional(),
});

export type ParsedSchemeDefinition = z.infer<typeof schemeDefinitionSchema>;

export function isSchemeCategory(value: unknown): value is SchemeCategory {
  return typeof value === 'string' && (SCHEME_CATEGORIES as readonly string[]).includes(value);
}
