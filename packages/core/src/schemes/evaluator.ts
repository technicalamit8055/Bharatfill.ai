/**
 * The scheme eligibility engine.
 *
 * Pure, synchronous and deterministic: no network, no AI, no clock unless one is passed in. An
 * operator standing in front of a customer gets the answer in the same render, and a wrong answer
 * can always be reproduced from the inputs alone.
 *
 * Every criterion returns pass / fail / unknown. Anything unknown becomes a question the operator
 * can ask at the counter, which is what turns "no results" into "add a caste certificate and this
 * customer unlocks four more applications".
 */

import { ageFromDateOfBirth } from '../customers/normalize';
import {
  CLOSING_SOON_DAYS,
  EDUCATION_LEVEL_LABELS,
  PWD_BENCHMARK_PERCENTAGE,
  SCHEME_DOCUMENTS,
  SCHEME_TRAIT_LABELS,
  educationSatisfies,
  type AgeRelaxationKey,
  type CustomerSchemeReport,
  type EducationLevel,
  type LocalisedText,
  type ReservationCategory,
  type SchemeCriterion,
  type SchemeCustomerProfile,
  type SchemeDefinition,
  type SchemeDocumentChecklistItem,
  type SchemeDocumentKey,
  type SchemeIneligibility,
  type SchemeLifecycleStatus,
  type SchemeMatchResult,
  type SchemeMatchStatus,
  type SchemeMissingRequirement,
  type SchemeSchedule,
  type SchemeTrait,
} from './types';
import { normalizeIndianState, stateMatches } from './states';

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/**
 * Upper-age relaxation, stacked the way recruitment notifications actually word it: the category
 * relaxation and the PwD relaxation are cumulative (a PwD-SC candidate gets both), and a
 * women-only relaxation stacks on top where a scheme grants one.
 *
 * Returns the years added and the breakdown, so the widget can show *why* a 26-year-old is still
 * inside a 23-year limit instead of asking the operator to take it on faith.
 */
export function ageRelaxationFor(
  scheme: SchemeDefinition,
  profile: SchemeCustomerProfile,
): { years: number; applied: Partial<Record<AgeRelaxationKey, number>> } {
  const relaxations = scheme.eligibility.ageRelaxations;
  const applied: Partial<Record<AgeRelaxationKey, number>> = {};
  if (!relaxations) return { years: 0, applied };

  const category = normalizeCategory(profile.category);
  if (category && category !== 'general') {
    const years = relaxations[category];
    if (years) applied[category] = years;
  }

  if (
    relaxations.pwd &&
    profile.disabilityPercentage !== null &&
    profile.disabilityPercentage >= PWD_BENCHMARK_PERCENTAGE
  ) {
    applied.pwd = relaxations.pwd;
  }

  if (relaxations.female && normalizeGender(profile.gender) === 'female') {
    applied.female = relaxations.female;
  }

  const years = Object.values(applied).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return { years, applied };
}

/** Age on the scheme's cutoff date, falling back to the evaluation date. */
export function ageForScheme(
  scheme: SchemeDefinition,
  dateOfBirth: string | null,
  asOfDate: Date,
): number | null {
  const cutoff = scheme.eligibility.ageCutoffDate;
  if (!cutoff) return ageFromDateOfBirth(dateOfBirth, asOfDate);

  const parsed = new Date(`${cutoff}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return ageFromDateOfBirth(dateOfBirth, asOfDate);
  return ageFromDateOfBirth(dateOfBirth, parsed);
}

// ---------------------------------------------------------------------------
// Value narrowing
// ---------------------------------------------------------------------------

const RESERVATION_CATEGORY_SET = new Set<string>(['general', 'obc', 'sc', 'st', 'ews']);

/**
 * `customer.category` also allows 'other', which no reservation rule recognises. Treating it as
 * unknown rather than as `general` is the safe direction: it prompts the operator to confirm
 * instead of quietly claiming a general-category cutoff for someone who may hold a certificate.
 */
export function normalizeCategory(value: string | null | undefined): ReservationCategory | null {
  if (!value) return null;
  const candidate = value.trim().toLowerCase();
  return RESERVATION_CATEGORY_SET.has(candidate) ? (candidate as ReservationCategory) : null;
}

function normalizeGender(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().toLowerCase();
  if (candidate === 'male' || candidate === 'female' || candidate === 'transgender') {
    return candidate;
  }
  // 'other' carries no information a gender-gated scheme can act on.
  return null;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from today until the end of `date`.
 *
 * Measured against the *end* of the target day because that is how a government window behaves:
 * a form closing on the 15th accepts submissions all through the 15th. So today returns 0, and
 * yesterday returns -1 — the first negative value is the first day the window is genuinely shut.
 */
export function daysUntil(date: string | null, asOfDate: Date): number | null {
  if (!date) return null;
  const end = Date.parse(`${date}T23:59:59.999Z`);
  if (Number.isNaN(end)) return null;
  const start = Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate());
  return Math.floor((end - start) / MS_PER_DAY);
}

export type SchemeLifecycle = {
  status: SchemeLifecycleStatus;
  daysRemaining: number | null;
  daysUntilOpen: number | null;
};

/**
 * Reads a schedule and says where the window stands today.
 *
 * The precedence is deliberate. Always-open beats everything, because an evergreen scheme has no
 * window to be outside of. A passed end date beats a start date, so a cycle whose dates were left
 * behind from last year reads as `closed` rather than reopening itself. Everything else with no
 * dates at all is `active` with no countdown — the honest answer for a built-in whose real window
 * nobody has entered yet, and the reason the UI shows "check the notification" instead of a timer.
 */
export function resolveSchemeLifecycle(
  schedule: SchemeSchedule,
  asOfDate: Date = new Date(),
): SchemeLifecycle {
  if (schedule.isAlwaysOpen) {
    return { status: 'evergreen', daysRemaining: null, daysUntilOpen: null };
  }

  const daysRemaining = daysUntil(schedule.applicationEndDate, asOfDate);
  const daysUntilOpen = daysUntil(schedule.applicationStartDate, asOfDate);

  if (daysRemaining !== null && daysRemaining < 0) {
    return { status: 'closed', daysRemaining, daysUntilOpen: null };
  }
  if (daysUntilOpen !== null && daysUntilOpen > 0) {
    return { status: 'upcoming', daysRemaining, daysUntilOpen };
  }
  if (daysRemaining !== null && daysRemaining <= CLOSING_SOON_DAYS) {
    return { status: 'closing_soon', daysRemaining, daysUntilOpen: null };
  }
  return { status: 'active', daysRemaining, daysUntilOpen: null };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function documentChecklistFor(
  required: readonly SchemeDocumentKey[],
  available: ReadonlySet<SchemeDocumentKey>,
): SchemeDocumentChecklistItem[] {
  return required.map((key) => {
    const def = SCHEME_DOCUMENTS[key];
    if (available.has(key)) return { key, label: def.label, state: 'ready' as const };
    return {
      key,
      label: def.label,
      // A photo or signature is never "missing from the profile" — the profile could not hold it
      // in the first place, so it is a reminder rather than a blocker.
      state: def.profileVerifiable ? ('missing' as const) : ('unverifiable' as const),
    };
  });
}

/** Which `SchemeDocumentKey`s the flat `customer.*` value map proves are on file. */
export function availableDocumentsFromValues(
  values: Readonly<Record<string, string>>,
): Set<SchemeDocumentKey> {
  const available = new Set<SchemeDocumentKey>();
  for (const def of Object.values(SCHEME_DOCUMENTS)) {
    if (!def.profileVerifiable) continue;
    const present = def.evidenceFieldKeys.some((key) => {
      const value = values[key];
      return typeof value === 'string' && value.trim() !== '';
    });
    if (present) available.add(def.key);
  }
  return available;
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

/**
 * Highest qualification the profile can prove, from the education JSON.
 *
 * Presence of a passing year, roll number or marksheet number is the signal — a half-typed board
 * name is not evidence anyone passed anything.
 */
export function educationLevelFromValues(
  values: Readonly<Record<string, string>>,
): EducationLevel | null {
  const proves = (level: string): boolean =>
    ['passing_year', 'roll_number', 'marksheet_number', 'result'].some((suffix) => {
      const value = values[`customer.education.${level}.${suffix}`];
      return typeof value === 'string' && value.trim() !== '';
    });

  if (proves('graduation')) return 'graduation';
  if (proves('class12')) return 'class12';
  if (proves('class10')) return 'class10';
  return null;
}

// ---------------------------------------------------------------------------
// Profile projection
// ---------------------------------------------------------------------------

/**
 * Builds the evaluator's input from the flat `customer.*` map produced by the CRM.
 *
 * Traits are never inferred: `confirmedTraits` only ever holds what an operator has explicitly
 * ticked, because guessing that someone is a farmer from an address would put a citizen in front
 * of a scheme they cannot claim.
 */
export function schemeProfileFromValues(
  values: Readonly<Record<string, string>>,
  confirmedTraits: ReadonlySet<SchemeTrait> = new Set(),
): SchemeCustomerProfile {
  const income = Number.parseInt(values['customer.annual_income'] ?? '', 10);
  const disability = Number.parseInt(values['customer.disability_percentage'] ?? '', 10);

  return {
    dateOfBirth: values['customer.date_of_birth'] ?? null,
    gender: values['customer.gender'] ?? null,
    category: values['customer.category'] ?? null,
    // Permanent address is what a domicile claim rests on; the current address is the fallback
    // for a customer who has only ever given one.
    state:
      normalizeIndianState(values['customer.permanent_address.state']) ??
      normalizeIndianState(values['customer.address.state']),
    annualIncome: Number.isFinite(income) ? income : null,
    educationLevel: educationLevelFromValues(values),
    disabilityPercentage: Number.isFinite(disability) ? disability : null,
    availableDocuments: availableDocumentsFromValues(values),
    confirmedTraits,
  };
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

/**
 * Fills `{name}`, `{scheme}`, `{fee}` and `{days}` in a pitch template.
 *
 * The scheme name is localised alongside the template rather than passed as one string: an
 * operator reading the Hindi script aloud should hear the Hindi name of the scheme, not an
 * English one dropped into the middle of a Hindi sentence.
 */
export function renderPitch(
  template: LocalisedText,
  values: { name?: string; scheme?: LocalisedText; fee?: number; days?: number | null },
): LocalisedText {
  const substitute = (text: string, schemeTitle: string): string =>
    text
      .replace(/\{name\}/g, values.name?.trim() || 'ji')
      .replace(/\{scheme\}/g, schemeTitle)
      .replace(/\{fee\}/g, String(values.fee ?? 0))
      .replace(/\{days\}/g, String(values.days ?? 0));

  return {
    en: substitute(template.en, values.scheme?.en ?? ''),
    hi: substitute(template.hi, values.scheme?.hi ?? ''),
  };
}

// ---------------------------------------------------------------------------
// The evaluator
// ---------------------------------------------------------------------------

export type EvaluateOptions = {
  asOfDate?: Date;
  /** Used only to personalise the pitch script; never compared against anything. */
  customerName?: string;
};

export type MatchAllOptions = EvaluateOptions & {
  /** Set false to hide announced-but-not-yet-open schemes. Defaults to showing them. */
  includeUpcoming?: boolean;
};

/**
 * Evaluates one customer against one scheme.
 *
 * Order matters for the operator's reading of the result, not for correctness: every criterion is
 * always evaluated so the widget can show the full breakdown rather than stopping at the first
 * failure and hiding a second, more fixable one.
 */
export function evaluateSchemeEligibility(
  profile: SchemeCustomerProfile,
  scheme: SchemeDefinition,
  options: EvaluateOptions = {},
): SchemeMatchResult {
  const asOfDate = options.asOfDate ?? new Date();
  const criteria = scheme.eligibility;

  const matchedCriteria: SchemeCriterion[] = [];
  const missingRequirements: SchemeMissingRequirement[] = [];
  const ineligibilityReasons: SchemeIneligibility[] = [];

  // --- window ---------------------------------------------------------------
  // A shut window is a fact about the scheme, not a fault of the customer, so it never becomes an
  // ineligibility reason. `matchCustomerToAllSchemes` drops closed schemes wholesale; evaluating
  // one directly still runs every rule, so a detail page can show who *would* have qualified.
  const lifecycle = resolveSchemeLifecycle(scheme.schedule, asOfDate);

  // --- age ------------------------------------------------------------------
  const { years: relaxationYears, applied: appliedRelaxations } = ageRelaxationFor(scheme, profile);
  const effectiveMaxAge = criteria.maxAge === undefined ? null : criteria.maxAge + relaxationYears;
  const age = ageForScheme(scheme, profile.dateOfBirth, asOfDate);

  if (criteria.minAge !== undefined || criteria.maxAge !== undefined) {
    if (age === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.date_of_birth',
        label: { en: 'Date of birth', hi: 'जन्म तिथि' },
        reason: 'UNKNOWN_DATE_OF_BIRTH',
        criterion: 'age',
      });
    } else if (criteria.minAge !== undefined && age < criteria.minAge) {
      ineligibilityReasons.push({
        code: 'AGE_BELOW_MINIMUM',
        criterion: 'age',
        values: { required: criteria.minAge, actual: age },
      });
    } else if (effectiveMaxAge !== null && age > effectiveMaxAge) {
      ineligibilityReasons.push({
        code: 'AGE_ABOVE_MAXIMUM',
        criterion: 'age',
        values: { required: effectiveMaxAge, actual: age },
      });
    } else {
      matchedCriteria.push('age');
    }
  }

  // --- gender ---------------------------------------------------------------
  if (criteria.gender && criteria.gender !== 'all') {
    const gender = normalizeGender(profile.gender);
    if (gender === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.gender',
        label: { en: 'Gender', hi: 'लिंग' },
        reason: 'UNKNOWN_GENDER',
        criterion: 'gender',
      });
    } else if (gender !== criteria.gender) {
      ineligibilityReasons.push({
        code: 'GENDER_NOT_ELIGIBLE',
        criterion: 'gender',
        values: { required: criteria.gender },
      });
    } else {
      matchedCriteria.push('gender');
    }
  }

  // --- domicile -------------------------------------------------------------
  const stateResult = stateMatches(criteria.allowedStates, profile.state);
  if (criteria.allowedStates && criteria.allowedStates.length > 0) {
    if (stateResult === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.permanent_address.state',
        label: { en: 'State', hi: 'राज्य' },
        reason: 'UNKNOWN_STATE',
        criterion: 'state',
      });
    } else if (!stateResult) {
      ineligibilityReasons.push({
        code: 'STATE_NOT_ELIGIBLE',
        criterion: 'state',
        values: { required: criteria.allowedStates.join(', ') },
      });
    } else {
      matchedCriteria.push('state');
    }
  }

  // --- reservation category -------------------------------------------------
  if (criteria.allowedCategories && criteria.allowedCategories.length > 0) {
    const category = normalizeCategory(profile.category);
    if (category === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.category',
        label: { en: 'Category', hi: 'श्रेणी' },
        reason: 'UNKNOWN_CATEGORY',
        criterion: 'category',
      });
    } else if (!criteria.allowedCategories.includes(category)) {
      ineligibilityReasons.push({
        code: 'CATEGORY_NOT_ELIGIBLE',
        criterion: 'category',
        values: { required: criteria.allowedCategories.join(', ') },
      });
    } else {
      matchedCriteria.push('category');
    }
  }

  // --- education ------------------------------------------------------------
  if (criteria.minEducationLevel) {
    const held = profile.educationLevel;
    if (held === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.education.class10.passing_year',
        label: { en: 'Qualification', hi: 'शैक्षणिक योग्यता' },
        reason: 'UNKNOWN_EDUCATION',
        criterion: 'education',
      });
    } else if (
      !educationSatisfies(held, criteria.minEducationLevel, criteria.alsoAcceptsEducation)
    ) {
      ineligibilityReasons.push({
        code: 'EDUCATION_BELOW_REQUIREMENT',
        criterion: 'education',
        values: {
          required: EDUCATION_LEVEL_LABELS[criteria.minEducationLevel].en,
          actual: EDUCATION_LEVEL_LABELS[held].en,
        },
      });
    } else {
      matchedCriteria.push('education');
    }
  }

  // --- income ---------------------------------------------------------------
  if (criteria.maxAnnualIncome !== undefined) {
    if (profile.annualIncome === null) {
      missingRequirements.push({
        kind: 'profile_field',
        fieldKey: 'customer.annual_income',
        label: { en: 'Annual family income', hi: 'वार्षिक पारिवारिक आय' },
        reason: 'UNKNOWN_INCOME',
        criterion: 'income',
      });
    } else if (profile.annualIncome > criteria.maxAnnualIncome) {
      ineligibilityReasons.push({
        code: 'INCOME_ABOVE_CEILING',
        criterion: 'income',
        values: { required: criteria.maxAnnualIncome, actual: profile.annualIncome },
      });
    } else {
      matchedCriteria.push('income');
    }
  }

  // --- documents ------------------------------------------------------------
  const documentChecklist = documentChecklistFor(
    criteria.requiredDocuments ?? [],
    profile.availableDocuments,
  );
  const missingDocuments = documentChecklist.filter((item) => item.state === 'missing');
  for (const item of missingDocuments) {
    missingRequirements.push({
      kind: 'document',
      fieldKey: item.key,
      label: item.label,
      reason: 'DOCUMENT_NOT_ON_FILE',
      criterion: 'documents',
    });
  }
  if (documentChecklist.length > 0 && missingDocuments.length === 0) {
    matchedCriteria.push('documents');
  }

  // --- traits ---------------------------------------------------------------
  const requiredTraits = criteria.requiredTraits ?? [];
  const unconfirmedTraits = requiredTraits.filter((trait) => !profile.confirmedTraits.has(trait));
  for (const trait of unconfirmedTraits) {
    missingRequirements.push({
      kind: 'operator_confirmation',
      fieldKey: trait,
      label: SCHEME_TRAIT_LABELS[trait],
      reason: 'TRAIT_NOT_CONFIRMED',
      criterion: 'traits',
    });
  }
  if (requiredTraits.length > 0 && unconfirmedTraits.length === 0) {
    matchedCriteria.push('traits');
  }

  const status: SchemeMatchStatus =
    ineligibilityReasons.length > 0
      ? 'ineligible'
      : missingRequirements.length > 0
        ? 'actionable_missing_docs'
        : 'eligible';

  return {
    scheme,
    status,
    matchedCriteria,
    missingRequirements,
    ineligibilityReasons,
    documentChecklist,
    estimatedFee: scheme.estimatedOperatorFee,
    ageAtCutoff: age,
    effectiveMaxAge,
    appliedRelaxations,
    lifecycleStatus: lifecycle.status,
    daysRemaining: lifecycle.daysRemaining,
    daysUntilOpen: lifecycle.daysUntilOpen,
    pitch: renderPitch(
      lifecycle.status === 'upcoming' ? scheme.upcomingPitchTemplate : scheme.pitchTemplate,
      {
        name: options.customerName,
        scheme: scheme.title,
        fee: scheme.estimatedOperatorFee,
        days: lifecycle.daysUntilOpen,
      },
    ),
  };
}

/**
 * Sort order the operator actually wants: money first among things they can sell today, then the
 * shortest path to a sale among the ones needing one more document. A deadline inside a week
 * jumps the queue regardless of fee — a lapsed window earns nothing.
 */
function compareResults(a: SchemeMatchResult, b: SchemeMatchResult): number {
  const urgency = (result: SchemeMatchResult): number =>
    result.lifecycleStatus === 'closing_soon' ? 0 : 1;

  const urgencyDiff = urgency(a) - urgency(b);
  if (urgencyDiff !== 0) return urgencyDiff;

  const missingDiff = a.missingRequirements.length - b.missingRequirements.length;
  if (missingDiff !== 0) return missingDiff;

  const feeDiff = b.estimatedFee - a.estimatedFee;
  if (feeDiff !== 0) return feeDiff;

  return a.scheme.title.en.localeCompare(b.scheme.title.en);
}

/**
 * Upcoming schemes are ranked by how soon the operator has to be ready, not by fee: the point of
 * the tab is to collect documents before the window opens, and the nearest opening is the one
 * that runs out of preparation time first.
 */
function compareUpcoming(a: SchemeMatchResult, b: SchemeMatchResult): number {
  const opensIn = (result: SchemeMatchResult): number =>
    result.daysUntilOpen ?? Number.MAX_SAFE_INTEGER;

  const diff = opensIn(a) - opensIn(b);
  return diff !== 0 ? diff : compareResults(a, b);
}

/**
 * Runs the whole catalogue against one customer and groups the results the way the upsell widget
 * reads them.
 *
 * `totalPotentialFee` counts every bucket the operator can act on, not just the open ones: an
 * income certificate the centre issues today is itself billable work, and so is the document run
 * for a vacancy that opens next month. Pretending those are worth nothing understates the very
 * opportunity the operator opened this widget to see.
 */
export function matchCustomerToAllSchemes(
  profile: SchemeCustomerProfile,
  catalog: readonly SchemeDefinition[],
  options: MatchAllOptions = {},
): CustomerSchemeReport {
  const includeUpcoming = options.includeUpcoming ?? true;

  const results = catalog
    .map((scheme) => evaluateSchemeEligibility(profile, scheme, options))
    // A lapsed window is never an opportunity. Offering one wastes the operator's pitch and sends
    // a citizen to a form that will not accept them.
    .filter((result) => result.lifecycleStatus !== 'closed')
    .filter((result) => includeUpcoming || result.lifecycleStatus !== 'upcoming');

  const eligible = results.filter((r) => r.status === 'eligible');

  const activeOpportunities = eligible
    .filter((r) => r.lifecycleStatus !== 'upcoming')
    .sort(compareResults);
  const upcomingOpportunities = eligible
    .filter((r) => r.lifecycleStatus === 'upcoming')
    .sort(compareUpcoming);
  const actionableMissingDocs = results
    .filter((r) => r.status === 'actionable_missing_docs')
    .sort(compareResults);
  const ineligible = results.filter((r) => r.status === 'ineligible').sort(compareResults);

  const totalPotentialFee = [
    ...activeOpportunities,
    ...upcomingOpportunities,
    ...actionableMissingDocs,
  ].reduce((sum, result) => sum + result.estimatedFee, 0);

  // What to say first: something sellable now, else the certificate that unlocks the most, else
  // the pre-collect script for whatever opens soonest.
  const top =
    activeOpportunities[0] ?? actionableMissingDocs[0] ?? upcomingOpportunities[0] ?? null;

  return {
    activeOpportunities,
    upcomingOpportunities,
    actionableMissingDocs,
    ineligible,
    totalPotentialFee,
    topPitchScript: top ? top.pitch : null,
  };
}

/**
 * The reverse direction: given one scheme, which of the centre's customers qualify.
 *
 * Takes an already-projected profile per customer so the caller — not the engine — decides what
 * identifying data travels alongside the match. The engine still never sees a name or a number.
 */
export function matchSchemeToCustomers<T>(
  scheme: SchemeDefinition,
  customers: readonly { subject: T; profile: SchemeCustomerProfile }[],
  options: EvaluateOptions = {},
): { subject: T; result: SchemeMatchResult }[] {
  return customers
    .map(({ subject, profile }) => ({
      subject,
      result: evaluateSchemeEligibility(profile, scheme, options),
    }))
    .filter(({ result }) => result.status !== 'ineligible')
    .sort((a, b) => compareResults(a.result, b.result));
}
