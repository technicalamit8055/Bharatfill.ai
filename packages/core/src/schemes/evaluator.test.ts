import { describe, expect, it } from 'vitest';
import {
  ageForScheme,
  ageRelaxationFor,
  availableDocumentsFromValues,
  daysUntil,
  educationLevelFromValues,
  evaluateSchemeEligibility,
  matchCustomerToAllSchemes,
  matchSchemeToCustomers,
  normalizeCategory,
  renderPitch,
  resolveSchemeLifecycle,
  schemeProfileFromValues,
} from './evaluator';
import { BUILT_IN_SCHEMES, getBuiltInScheme } from './catalog';
import {
  educationSatisfies,
  type SchemeCustomerProfile,
  type SchemeDefinition,
  type SchemeSchedule,
} from './types';
import { normalizeIndianState } from './states';

/** A fixed clock, so a test does not start failing on someone's birthday. */
const TODAY = new Date('2026-09-02T00:00:00.000Z');

function profile(overrides: Partial<SchemeCustomerProfile> = {}): SchemeCustomerProfile {
  return {
    dateOfBirth: null,
    gender: null,
    category: null,
    state: null,
    annualIncome: null,
    educationLevel: null,
    disabilityPercentage: null,
    availableDocuments: new Set(),
    confirmedTraits: new Set(),
    ...overrides,
  };
}

function schedule(overrides: Partial<SchemeSchedule> = {}): SchemeSchedule {
  return {
    applicationStartDate: null,
    applicationEndDate: null,
    isAlwaysOpen: false,
    examDate: null,
    ...overrides,
  };
}

function scheme(overrides: Partial<SchemeDefinition> = {}): SchemeDefinition {
  return {
    id: 'test-scheme',
    slug: 'test-scheme',
    title: { en: 'Test Scheme', hi: 'परीक्षण योजना' },
    shortDescription: { en: 'A test scheme.', hi: 'एक परीक्षण योजना।' },
    benefitsSummary: { en: 'Test benefit.', hi: 'परीक्षण लाभ।' },
    benefitHighlight: { en: '₹1', hi: '₹1' },
    category: 'welfare',
    portalName: 'Test portal',
    portalUrl: 'https://example.gov.in/',
    officialNotificationUrl: null,
    schedule: schedule({ isAlwaysOpen: true }),
    estimatedOperatorFee: 50,
    eligibility: {},
    pitchTemplate: { en: '{name}: {scheme} for ₹{fee}.', hi: '{name}: {scheme} ₹{fee} में।' },
    upcomingPitchTemplate: {
      en: '{name}: {scheme} opens in {days} days, ₹{fee}.',
      hi: '{name}: {scheme} {days} दिन में खुलेगा, ₹{fee}।',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

describe('ageForScheme', () => {
  it('reckons age on the scheme cutoff date, not today', () => {
    const cutoffScheme = scheme({ eligibility: { ageCutoffDate: '2026-01-01' } });
    // Born 2005-06-15: 20 on 2026-01-01, 21 on 2026-09-02.
    expect(ageForScheme(cutoffScheme, '2005-06-15', TODAY)).toBe(20);
    expect(ageForScheme(scheme(), '2005-06-15', TODAY)).toBe(21);
  });

  it('does not round a birthday up before it happens', () => {
    // 2026-09-03 is tomorrow relative to TODAY.
    expect(ageForScheme(scheme(), '2005-09-03', TODAY)).toBe(20);
    expect(ageForScheme(scheme(), '2005-09-02', TODAY)).toBe(21);
  });

  it('handles a 29 February birthday in a non-leap year', () => {
    // Born on a leap day; on 2026-02-28 the 21st birthday has not arrived yet.
    expect(ageForScheme(scheme(), '2004-02-29', new Date('2026-02-28T00:00:00.000Z'))).toBe(21);
    expect(ageForScheme(scheme(), '2004-02-29', new Date('2026-03-01T00:00:00.000Z'))).toBe(22);
  });

  it('returns null when there is no date of birth', () => {
    expect(ageForScheme(scheme(), null, TODAY)).toBeNull();
  });
});

describe('ageRelaxationFor', () => {
  const relaxed = scheme({
    eligibility: { maxAge: 23, ageRelaxations: { obc: 3, sc: 5, st: 5, pwd: 10, female: 2 } },
  });

  it('grants the OBC relaxation', () => {
    const { years, applied } = ageRelaxationFor(relaxed, profile({ category: 'obc' }));
    expect(years).toBe(3);
    expect(applied).toEqual({ obc: 3 });
  });

  it('grants five years to SC and ST', () => {
    expect(ageRelaxationFor(relaxed, profile({ category: 'sc' })).years).toBe(5);
    expect(ageRelaxationFor(relaxed, profile({ category: 'st' })).years).toBe(5);
  });

  it('grants nothing to a general-category candidate', () => {
    expect(ageRelaxationFor(relaxed, profile({ category: 'general' })).years).toBe(0);
  });

  it('stacks the PwD relaxation on top of the category relaxation', () => {
    const { years, applied } = ageRelaxationFor(
      relaxed,
      profile({ category: 'sc', disabilityPercentage: 60 }),
    );
    expect(years).toBe(15);
    expect(applied).toEqual({ sc: 5, pwd: 10 });
  });

  it('ignores a disability below the 40% statutory benchmark', () => {
    expect(ageRelaxationFor(relaxed, profile({ disabilityPercentage: 30 })).years).toBe(0);
    expect(ageRelaxationFor(relaxed, profile({ disabilityPercentage: 40 })).years).toBe(10);
  });

  it('grants a women-only relaxation where the scheme offers one', () => {
    expect(ageRelaxationFor(relaxed, profile({ gender: 'female' })).years).toBe(2);
    expect(ageRelaxationFor(relaxed, profile({ gender: 'male' })).years).toBe(0);
  });

  it('grants nothing when the scheme declares no relaxations', () => {
    const strict = scheme({ eligibility: { maxAge: 21 } });
    expect(ageRelaxationFor(strict, profile({ category: 'sc' })).years).toBe(0);
  });
});

describe('age eligibility', () => {
  const gd = scheme({ eligibility: { minAge: 18, maxAge: 23, ageRelaxations: { sc: 5 } } });

  it('accepts a candidate inside the plain band', () => {
    const result = evaluateSchemeEligibility(profile({ dateOfBirth: '2005-01-01' }), gd, {
      asOfDate: TODAY,
    });
    expect(result.status).toBe('eligible');
    expect(result.ageAtCutoff).toBe(21);
    expect(result.effectiveMaxAge).toBe(23);
  });

  it('accepts an SC candidate who is over the base limit but inside the relaxed one', () => {
    // 27 on the evaluation date — over 23, inside 23 + 5.
    const result = evaluateSchemeEligibility(
      profile({ dateOfBirth: '1999-01-01', category: 'sc' }),
      gd,
      { asOfDate: TODAY },
    );
    expect(result.status).toBe('eligible');
    expect(result.effectiveMaxAge).toBe(28);
    expect(result.appliedRelaxations).toEqual({ sc: 5 });
  });

  it('rejects a general candidate over the limit and says by how much', () => {
    const result = evaluateSchemeEligibility(
      profile({ dateOfBirth: '1999-01-01', category: 'general' }),
      gd,
      { asOfDate: TODAY },
    );
    expect(result.status).toBe('ineligible');
    expect(result.ineligibilityReasons).toEqual([
      { code: 'AGE_ABOVE_MAXIMUM', criterion: 'age', values: { required: 23, actual: 27 } },
    ]);
  });

  it('rejects a candidate under the minimum, and never relaxes the floor', () => {
    const result = evaluateSchemeEligibility(
      profile({ dateOfBirth: '2012-01-01', category: 'sc' }),
      gd,
      { asOfDate: TODAY },
    );
    expect(result.status).toBe('ineligible');
    expect(result.ineligibilityReasons[0]?.code).toBe('AGE_BELOW_MINIMUM');
  });

  it('asks for the date of birth rather than rejecting when it is unknown', () => {
    const result = evaluateSchemeEligibility(profile(), gd, { asOfDate: TODAY });
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements).toEqual([
      expect.objectContaining({
        kind: 'profile_field',
        fieldKey: 'customer.date_of_birth',
        reason: 'UNKNOWN_DATE_OF_BIRTH',
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Gender
// ---------------------------------------------------------------------------

describe('gender gating', () => {
  const womenOnly = scheme({ eligibility: { gender: 'female' } });

  it('accepts a woman', () => {
    expect(evaluateSchemeEligibility(profile({ gender: 'female' }), womenOnly).status).toBe(
      'eligible',
    );
  });

  it('rejects a man', () => {
    const result = evaluateSchemeEligibility(profile({ gender: 'male' }), womenOnly);
    expect(result.status).toBe('ineligible');
    expect(result.ineligibilityReasons[0]?.code).toBe('GENDER_NOT_ELIGIBLE');
  });

  it('treats "other" as unknown rather than as a rejection', () => {
    const result = evaluateSchemeEligibility(profile({ gender: 'other' }), womenOnly);
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements[0]?.reason).toBe('UNKNOWN_GENDER');
  });

  it('ignores gender entirely when the scheme is open to all', () => {
    const open = scheme({ eligibility: { gender: 'all' } });
    const result = evaluateSchemeEligibility(profile(), open);
    expect(result.status).toBe('eligible');
    expect(result.missingRequirements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Domicile
// ---------------------------------------------------------------------------

describe('domicile matching', () => {
  const upOnly = scheme({ eligibility: { allowedStates: ['UP'] } });

  it('accepts a UP resident however the state was written', () => {
    for (const written of ['Uttar Pradesh', 'up', 'U.P.', 'उत्तर प्रदेश']) {
      const state = normalizeIndianState(written);
      expect(state).toBe('UP');
      expect(evaluateSchemeEligibility(profile({ state }), upOnly).status).toBe('eligible');
    }
  });

  it('rejects a Bihar resident', () => {
    const result = evaluateSchemeEligibility(profile({ state: 'BR' }), upOnly);
    expect(result.status).toBe('ineligible');
    expect(result.ineligibilityReasons[0]?.code).toBe('STATE_NOT_ELIGIBLE');
  });

  it('asks for the state when it is unknown', () => {
    const result = evaluateSchemeEligibility(profile(), upOnly);
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements[0]?.reason).toBe('UNKNOWN_STATE');
  });

  it('never asks about state for an All-India scheme', () => {
    const allIndia = scheme({ eligibility: { allowedStates: [] } });
    expect(evaluateSchemeEligibility(profile(), allIndia).status).toBe('eligible');
  });
});

describe('normalizeIndianState', () => {
  it('resolves former names and abbreviations', () => {
    expect(normalizeIndianState('Orissa')).toBe('OD');
    expect(normalizeIndianState('Uttaranchal')).toBe('UK');
    expect(normalizeIndianState('NCT of Delhi')).toBe('DL');
    expect(normalizeIndianState('बिहार')).toBe('BR');
  });

  it('returns null for anything it does not recognise', () => {
    expect(normalizeIndianState('Nepal')).toBeNull();
    expect(normalizeIndianState('   ')).toBeNull();
    expect(normalizeIndianState(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Category, education, income
// ---------------------------------------------------------------------------

describe('normalizeCategory', () => {
  it('treats "other" as unknown, not as general', () => {
    expect(normalizeCategory('other')).toBeNull();
    expect(normalizeCategory('OBC')).toBe('obc');
    expect(normalizeCategory(null)).toBeNull();
  });
});

describe('education thresholds', () => {
  it('lets a 10th pass through a 10th-pass bar but not a graduate bar', () => {
    const tenth = scheme({ eligibility: { minEducationLevel: 'class10' } });
    const graduate = scheme({ eligibility: { minEducationLevel: 'graduation' } });

    expect(evaluateSchemeEligibility(profile({ educationLevel: 'class10' }), tenth).status).toBe(
      'eligible',
    );
    const rejected = evaluateSchemeEligibility(profile({ educationLevel: 'class10' }), graduate);
    expect(rejected.status).toBe('ineligible');
    expect(rejected.ineligibilityReasons[0]?.code).toBe('EDUCATION_BELOW_REQUIREMENT');
  });

  it('accepts a higher qualification for a lower bar', () => {
    const twelfth = scheme({ eligibility: { minEducationLevel: 'class12' } });
    expect(
      evaluateSchemeEligibility(profile({ educationLevel: 'post_graduation' }), twelfth).status,
    ).toBe('eligible');
  });

  it('does not treat ITI as a class 12 pass unless the scheme says so', () => {
    expect(educationSatisfies('iti', 'class10')).toBe(true);
    expect(educationSatisfies('iti', 'class12')).toBe(false);
    expect(educationSatisfies('iti', 'class12', ['iti'])).toBe(true);
  });

  it('accepts ITI where the scheme lists it alongside the 10th-pass bar', () => {
    const groupD = getBuiltInScheme('rrb-group-d');
    expect(groupD).toBeDefined();
    const result = evaluateSchemeEligibility(
      profile({
        dateOfBirth: '2003-01-01',
        educationLevel: 'iti',
        availableDocuments: new Set(['aadhaar', 'marksheet_10th']),
      }),
      groupD as SchemeDefinition,
      { asOfDate: TODAY },
    );
    expect(result.status).toBe('eligible');
  });

  it('asks for the qualification rather than rejecting when it is unknown', () => {
    const graduate = scheme({ eligibility: { minEducationLevel: 'graduation' } });
    const result = evaluateSchemeEligibility(profile(), graduate);
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements[0]?.reason).toBe('UNKNOWN_EDUCATION');
  });
});

describe('income ceiling', () => {
  const capped = scheme({ eligibility: { maxAnnualIncome: 250_000 } });

  it('accepts income exactly at the ceiling', () => {
    expect(evaluateSchemeEligibility(profile({ annualIncome: 250_000 }), capped).status).toBe(
      'eligible',
    );
  });

  it('rejects income above the ceiling and reports both numbers', () => {
    const result = evaluateSchemeEligibility(profile({ annualIncome: 300_000 }), capped);
    expect(result.status).toBe('ineligible');
    expect(result.ineligibilityReasons[0]).toEqual({
      code: 'INCOME_ABOVE_CEILING',
      criterion: 'income',
      values: { required: 250_000, actual: 300_000 },
    });
  });

  it('asks for the income when it is unknown', () => {
    const result = evaluateSchemeEligibility(profile(), capped);
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements[0]?.reason).toBe('UNKNOWN_INCOME');
  });
});

// ---------------------------------------------------------------------------
// Documents and traits
// ---------------------------------------------------------------------------

describe('document readiness', () => {
  const scholarship = scheme({
    eligibility: { requiredDocuments: ['aadhaar', 'caste_certificate', 'photo'] },
  });

  it('flags a missing caste certificate as actionable, not as a rejection', () => {
    const result = evaluateSchemeEligibility(
      profile({ availableDocuments: new Set(['aadhaar']) }),
      scholarship,
    );
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements).toEqual([
      expect.objectContaining({
        kind: 'document',
        fieldKey: 'caste_certificate',
        reason: 'DOCUMENT_NOT_ON_FILE',
      }),
    ]);
  });

  it('never blocks on a photo, which the profile cannot prove either way', () => {
    const result = evaluateSchemeEligibility(
      profile({ availableDocuments: new Set(['aadhaar', 'caste_certificate']) }),
      scholarship,
    );
    expect(result.status).toBe('eligible');
    expect(result.documentChecklist).toEqual([
      { key: 'aadhaar', label: expect.anything(), state: 'ready' },
      { key: 'caste_certificate', label: expect.anything(), state: 'ready' },
      { key: 'photo', label: expect.anything(), state: 'unverifiable' },
    ]);
  });
});

describe('trait confirmation', () => {
  const farmerScheme = scheme({ eligibility: { requiredTraits: ['farmer'] } });

  it('asks the operator to confirm rather than assuming', () => {
    const result = evaluateSchemeEligibility(profile(), farmerScheme);
    expect(result.status).toBe('actionable_missing_docs');
    expect(result.missingRequirements[0]).toEqual(
      expect.objectContaining({ kind: 'operator_confirmation', fieldKey: 'farmer' }),
    );
  });

  it('passes once the operator has confirmed it', () => {
    const result = evaluateSchemeEligibility(
      profile({ confirmedTraits: new Set(['farmer']) }),
      farmerScheme,
    );
    expect(result.status).toBe('eligible');
    expect(result.matchedCriteria).toContain('traits');
  });
});

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

describe('daysUntil', () => {
  it('counts a deadline later today as zero days left, not as expired', () => {
    expect(daysUntil('2026-09-02', TODAY)).toBe(0);
  });

  it('counts forward and backward across the deadline', () => {
    expect(daysUntil('2026-09-09', TODAY)).toBe(7);
    expect(daysUntil('2026-09-01', TODAY)).toBe(-1);
  });

  it('returns null for a scheme with no deadline', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});

describe('resolveSchemeLifecycle', () => {
  const at = (dates: Partial<SchemeSchedule>) => resolveSchemeLifecycle(schedule(dates), TODAY);

  it('calls a permanently open scheme evergreen and gives it no countdown', () => {
    const result = at({ isAlwaysOpen: true, applicationEndDate: '2026-09-05' });
    expect(result.status).toBe('evergreen');
    expect(result.daysRemaining).toBeNull();
    expect(result.daysUntilOpen).toBeNull();
  });

  it('is active, and silent about dates, when nobody has entered a window', () => {
    const result = at({});
    expect(result.status).toBe('active');
    expect(result.daysRemaining).toBeNull();
    expect(result.daysUntilOpen).toBeNull();
  });

  it('flips to closing_soon exactly at the seven-day mark', () => {
    expect(at({ applicationEndDate: '2026-09-09' }).status).toBe('closing_soon');
    expect(at({ applicationEndDate: '2026-09-10' }).status).toBe('active');
  });

  it('is still open on the closing day itself', () => {
    const result = at({ applicationEndDate: '2026-09-02' });
    expect(result.status).toBe('closing_soon');
    expect(result.daysRemaining).toBe(0);
  });

  it('closes the day after the window ends', () => {
    const result = at({ applicationEndDate: '2026-09-01' });
    expect(result.status).toBe('closed');
    expect(result.daysRemaining).toBe(-1);
  });

  it('is upcoming while the start date is still in the future', () => {
    const result = at({ applicationStartDate: '2026-09-20', applicationEndDate: '2026-10-10' });
    expect(result.status).toBe('upcoming');
    expect(result.daysUntilOpen).toBe(18);
  });

  it('opens on the start date itself', () => {
    const result = at({ applicationStartDate: '2026-09-02', applicationEndDate: '2026-10-10' });
    expect(result.status).toBe('active');
    expect(result.daysUntilOpen).toBeNull();
  });

  it('reads a cycle left behind from last year as closed, not as reopening', () => {
    expect(
      at({ applicationStartDate: '2025-01-01', applicationEndDate: '2025-02-01' }).status,
    ).toBe('closed');
  });
});

describe('closed windows', () => {
  const lapsed = scheme({
    slug: 'lapsed',
    schedule: schedule({ applicationEndDate: '2026-08-01' }),
  });

  it('drops a lapsed scheme from the report instead of listing it as a rejection', () => {
    const report = matchCustomerToAllSchemes(profile(), [lapsed], { asOfDate: TODAY });
    expect(report.activeOpportunities).toEqual([]);
    expect(report.upcomingOpportunities).toEqual([]);
    expect(report.actionableMissingDocs).toEqual([]);
    expect(report.ineligible).toEqual([]);
    expect(report.totalPotentialFee).toBe(0);
  });

  it('never blames the customer for a shut window', () => {
    const result = evaluateSchemeEligibility(profile(), lapsed, { asOfDate: TODAY });
    expect(result.lifecycleStatus).toBe('closed');
    expect(result.status).toBe('eligible');
    expect(result.ineligibilityReasons).toEqual([]);
  });

  it('leaves a scheme closing today sellable', () => {
    const closingToday = scheme({ schedule: schedule({ applicationEndDate: '2026-09-02' }) });
    const result = evaluateSchemeEligibility(profile(), closingToday, { asOfDate: TODAY });
    expect(result.status).toBe('eligible');
    expect(result.lifecycleStatus).toBe('closing_soon');
    expect(result.daysRemaining).toBe(0);
  });
});

describe('upcoming windows', () => {
  const soon = scheme({
    slug: 'opens-soon',
    schedule: schedule({ applicationStartDate: '2026-09-20', applicationEndDate: '2026-10-10' }),
    upcomingPitchTemplate: { en: 'Opens in {days} days.', hi: '{days} दिन में खुलेगा।' },
  });

  it('reads the pre-collect script rather than the "apply now" one', () => {
    const result = evaluateSchemeEligibility(profile(), soon, { asOfDate: TODAY });
    expect(result.lifecycleStatus).toBe('upcoming');
    expect(result.pitch.en).toBe('Opens in 18 days.');
  });

  it('separates what is sellable today from what only needs documents collected', () => {
    const openNow = scheme({ slug: 'open-now' });
    const report = matchCustomerToAllSchemes(profile(), [soon, openNow], { asOfDate: TODAY });
    expect(report.activeOpportunities.map((r) => r.scheme.slug)).toEqual(['open-now']);
    expect(report.upcomingOpportunities.map((r) => r.scheme.slug)).toEqual(['opens-soon']);
  });

  it('counts an upcoming scheme towards the fee the operator can plan for', () => {
    const report = matchCustomerToAllSchemes(profile(), [soon], { asOfDate: TODAY });
    expect(report.totalPotentialFee).toBe(soon.estimatedOperatorFee);
  });

  it('hides upcoming schemes when the caller asks for today only', () => {
    const report = matchCustomerToAllSchemes(profile(), [soon], {
      asOfDate: TODAY,
      includeUpcoming: false,
    });
    expect(report.upcomingOpportunities).toEqual([]);
    expect(report.totalPotentialFee).toBe(0);
  });

  it('orders the nearest opening first, ahead of a richer one further out', () => {
    const later = scheme({
      slug: 'opens-later',
      estimatedOperatorFee: 500,
      schedule: schedule({ applicationStartDate: '2026-11-01' }),
    });
    const report = matchCustomerToAllSchemes(profile(), [later, soon], { asOfDate: TODAY });
    expect(report.upcomingOpportunities.map((r) => r.scheme.slug)).toEqual([
      'opens-soon',
      'opens-later',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Projection from the flat customer value map
// ---------------------------------------------------------------------------

describe('educationLevelFromValues', () => {
  it('takes the highest level the profile can actually prove', () => {
    expect(
      educationLevelFromValues({
        'customer.education.class10.passing_year': '2018',
        'customer.education.class12.passing_year': '2020',
      }),
    ).toBe('class12');
  });

  it('ignores a board name typed without any proof of passing', () => {
    expect(educationLevelFromValues({ 'customer.education.class12.board': 'UP Board' })).toBeNull();
  });

  it('returns null for an empty profile', () => {
    expect(educationLevelFromValues({})).toBeNull();
  });
});

describe('availableDocumentsFromValues', () => {
  it('reads a certificate as on file from its number alone', () => {
    const available = availableDocumentsFromValues({
      'customer.certificate.caste.number': 'CC/2024/1',
      'customer.aadhaar_last4': '1234',
    });
    expect(available.has('caste_certificate')).toBe(true);
    expect(available.has('aadhaar')).toBe(true);
    expect(available.has('income_certificate')).toBe(false);
  });

  it('does not count a blank value as evidence', () => {
    const available = availableDocumentsFromValues({ 'customer.certificate.caste.number': '   ' });
    expect(available.has('caste_certificate')).toBe(false);
  });

  it('never claims a photo or signature is on file', () => {
    const available = availableDocumentsFromValues({});
    expect(available.has('photo')).toBe(false);
    expect(available.has('signature')).toBe(false);
  });
});

describe('schemeProfileFromValues', () => {
  it('projects only the fields the evaluator needs', () => {
    const projected = schemeProfileFromValues({
      'customer.full_name': 'Amit Kumar',
      'customer.mobile': '9900012345',
      'customer.date_of_birth': '2005-06-15',
      'customer.gender': 'male',
      'customer.category': 'obc',
      'customer.address.state': 'Bihar',
      'customer.permanent_address.state': 'Uttar Pradesh',
      'customer.annual_income': '180000',
      'customer.education.class12.passing_year': '2023',
    });

    expect(projected.dateOfBirth).toBe('2005-06-15');
    expect(projected.category).toBe('obc');
    expect(projected.annualIncome).toBe(180_000);
    expect(projected.educationLevel).toBe('class12');
    // Domicile rests on the permanent address, not on where the customer happens to live now.
    expect(projected.state).toBe('UP');
    expect(Object.keys(projected)).not.toContain('mobile');
  });

  it('falls back to the current address when there is no permanent one', () => {
    expect(schemeProfileFromValues({ 'customer.address.state': 'Bihar' }).state).toBe('BR');
  });

  it('never infers a trait', () => {
    const projected = schemeProfileFromValues({ 'customer.address.state': 'Bihar' });
    expect(projected.confirmedTraits.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pitch rendering
// ---------------------------------------------------------------------------

describe('renderPitch', () => {
  it('interpolates the name, scheme and fee in both locales', () => {
    const pitch = renderPitch(
      { en: '{name}, {scheme} costs ₹{fee}.', hi: '{name}, {scheme} ₹{fee} में।' },
      { name: 'Amit', scheme: { en: 'SSC GD', hi: 'एसएससी जीडी' }, fee: 100 },
    );
    expect(pitch.en).toBe('Amit, SSC GD costs ₹100.');
    // The Hindi script gets the Hindi name — an English one dropped mid-sentence reads badly
    // when the operator says it out loud.
    expect(pitch.hi).toBe('Amit, एसएससी जीडी ₹100 में।');
  });

  it('counts down the days for a pre-collect script', () => {
    const pitch = renderPitch(
      { en: 'Opens in {days} days.', hi: '{days} दिन में खुलेगा।' },
      { days: 18 },
    );
    expect(pitch.en).toBe('Opens in 18 days.');
    expect(pitch.hi).toBe('18 दिन में खुलेगा।');
  });

  it('falls back to a neutral address when there is no name', () => {
    const pitch = renderPitch({ en: 'Hello {name}.', hi: 'नमस्ते {name}।' }, {});
    expect(pitch.en).toBe('Hello ji.');
  });
});

// ---------------------------------------------------------------------------
// Whole-catalogue matching
// ---------------------------------------------------------------------------

describe('matchCustomerToAllSchemes', () => {
  // The plan's worked example: a 21-year-old OBC man, 12th pass, UP domicile.
  const walkIn = profile({
    dateOfBirth: '2005-06-15',
    gender: 'male',
    category: 'obc',
    state: 'UP',
    educationLevel: 'class12',
    availableDocuments: new Set(['aadhaar', 'marksheet_10th', 'marksheet_12th']),
  });

  const report = matchCustomerToAllSchemes(walkIn, BUILT_IN_SCHEMES, {
    asOfDate: TODAY,
    customerName: 'Amit',
  });
  const slugs = (results: { scheme: SchemeDefinition }[]) => results.map((r) => r.scheme.slug);

  it('puts the exams he can sit today in the active list', () => {
    expect(slugs(report.activeOpportunities)).toContain('ssc-gd-constable');
    expect(slugs(report.activeOpportunities)).toContain('ssc-chsl');
    expect(slugs(report.activeOpportunities)).toContain('rrb-ntpc');
  });

  it('keeps a graduate-only exam out of everything he can act on', () => {
    expect(slugs(report.activeOpportunities)).not.toContain('ssc-cgl');
    expect(slugs(report.upcomingOpportunities)).not.toContain('ssc-cgl');
    expect(slugs(report.actionableMissingDocs)).not.toContain('ssc-cgl');
    expect(slugs(report.ineligible)).toContain('ssc-cgl');
  });

  it('keeps a women-only state scheme out entirely', () => {
    expect(slugs(report.ineligible)).toContain('ladli-behna-mp');
  });

  it('surfaces UP Police as actionable — the domicile certificate is not on file', () => {
    const upPolice = report.actionableMissingDocs.find(
      (r) => r.scheme.slug === 'up-police-constable',
    );
    expect(upPolice).toBeDefined();
    expect(upPolice?.missingRequirements.map((m) => m.fieldKey)).toContain('domicile_certificate');
  });

  it('counts a potential fee for everything sellable and gives a pitch to read out', () => {
    const expected = [
      ...report.activeOpportunities,
      ...report.upcomingOpportunities,
      ...report.actionableMissingDocs,
    ].reduce((sum, r) => sum + r.estimatedFee, 0);
    expect(report.totalPotentialFee).toBe(expected);
    expect(report.totalPotentialFee).toBeGreaterThan(0);
    expect(report.topPitchScript?.en).toContain('Amit');
    expect(report.topPitchScript?.hi).toContain('Amit');
  });

  it('sorts a scheme closing this week ahead of a richer one that is not', () => {
    const urgent = scheme({
      slug: 'urgent',
      schedule: schedule({ applicationEndDate: '2026-09-05' }),
      estimatedOperatorFee: 10,
    });
    const lucrative = scheme({ slug: 'lucrative', estimatedOperatorFee: 500 });
    const sorted = matchCustomerToAllSchemes(profile(), [lucrative, urgent], { asOfDate: TODAY });
    expect(slugs(sorted.activeOpportunities)).toEqual(['urgent', 'lucrative']);
  });

  it('places every scheme in exactly one bucket', () => {
    const total =
      report.activeOpportunities.length +
      report.upcomingOpportunities.length +
      report.actionableMissingDocs.length +
      report.ineligible.length;
    expect(total).toBe(BUILT_IN_SCHEMES.length);
  });
});

describe('matchSchemeToCustomers', () => {
  const gd = getBuiltInScheme('ssc-gd-constable') as SchemeDefinition;

  const customers = [
    {
      subject: 'in-band',
      profile: profile({
        dateOfBirth: '2005-01-01',
        educationLevel: 'class10',
        availableDocuments: new Set(['aadhaar', 'marksheet_10th'] as const),
      }),
    },
    {
      subject: 'too-old',
      profile: profile({
        dateOfBirth: '1990-01-01',
        category: 'general',
        educationLevel: 'class10',
      }),
    },
    {
      subject: 'needs-marksheet',
      profile: profile({ dateOfBirth: '2005-01-01', educationLevel: 'class10' }),
    },
  ];

  it('returns those who qualify and those one document away, and drops the rest', () => {
    const matches = matchSchemeToCustomers(gd, customers, { asOfDate: TODAY });
    expect(matches.map((m) => m.subject)).toEqual(['in-band', 'needs-marksheet']);
  });

  it('ranks a ready customer ahead of one still missing a document', () => {
    const matches = matchSchemeToCustomers(gd, customers, { asOfDate: TODAY });
    expect(matches[0]?.result.status).toBe('eligible');
    expect(matches[1]?.result.status).toBe('actionable_missing_docs');
  });
});
