import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCHEMES, getBuiltInScheme, mergeSchemes } from './catalog';
import {
  SCHEME_DOCUMENTS,
  SCHEME_TRAIT_LABELS,
  isSchemeLogoPath,
  schemeDefinitionSchema,
} from './types';
import { scrapedCandidateSchema } from '../platform/scraper';
import { INDIAN_STATE_BY_CODE } from './states';
import { resolveSchemeLifecycle } from './evaluator';

/**
 * The catalogue makes claims about government rules to a citizen standing at a counter. These
 * tests are the floor under those claims: they cannot check that an age limit is *right*, but
 * they can check that nothing in the file is malformed, contradictory or silently unreachable.
 */
describe('BUILT_IN_SCHEMES', () => {
  it('parses every entry', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(() => schemeDefinitionSchema.parse(scheme)).not.toThrow();
    }
  });

  it('ships a usable catalogue', () => {
    expect(BUILT_IN_SCHEMES.length).toBeGreaterThanOrEqual(15);
  });

  it('has unique ids and slugs', () => {
    expect(new Set(BUILT_IN_SCHEMES.map((s) => s.slug)).size).toBe(BUILT_IN_SCHEMES.length);
    expect(new Set(BUILT_IN_SCHEMES.map((s) => s.id)).size).toBe(BUILT_IN_SCHEMES.length);
  });

  it('covers every category the hub can filter by', () => {
    const categories = new Set(BUILT_IN_SCHEMES.map((s) => s.category));
    expect(categories).toContain('recruitment');
    expect(categories).toContain('welfare');
    expect(categories).toContain('scholarship');
    expect(categories).toContain('certificate');
    expect(categories).toContain('business_loan');
  });

  it('carries both locales everywhere an operator reads text aloud', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      for (const text of [
        scheme.title,
        scheme.shortDescription,
        scheme.benefitsSummary,
        scheme.benefitHighlight,
        scheme.pitchTemplate,
      ]) {
        expect(text.en.trim()).not.toBe('');
        expect(text.hi.trim()).not.toBe('');
      }
    }
  });

  it('writes a pitch that names the scheme fee, so the operator quotes a price', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(scheme.pitchTemplate.en).toContain('{fee}');
      expect(scheme.pitchTemplate.hi).toContain('{fee}');
    }
  });

  /**
   * The deliberate choice recorded in catalog.ts: a stale window read out at the counter is worse
   * than no window. If a built-in ever ships hardcoded dates, this test should be the thing that
   * makes someone argue for it.
   */
  it('ships no hardcoded application windows', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(scheme.schedule.applicationStartDate).toBeNull();
      expect(scheme.schedule.applicationEndDate).toBeNull();
    }
  });

  /** Follows from the rule above, and is the property the widget actually depends on. */
  it('leaves nothing in the built-in list already closed', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(resolveSchemeLifecycle(scheme.schedule).status).not.toBe('closed');
    }
  });

  it('gives every scheme a pre-collect script that counts down and quotes a price', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      for (const text of [scheme.upcomingPitchTemplate.en, scheme.upcomingPitchTemplate.hi]) {
        expect(text).toContain('{days}');
        expect(text).toContain('{fee}');
      }
    }
  });

  it('points every entry at a real portal, over https', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(scheme.portalUrl.startsWith('https://')).toBe(true);
      if (scheme.officialNotificationUrl !== null) {
        expect(scheme.officialNotificationUrl.startsWith('https://')).toBe(true);
      }
    }
  });

  it('declares a fee that is a plausible counter charge, not a government fee', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(scheme.estimatedOperatorFee).toBeGreaterThan(0);
      expect(scheme.estimatedOperatorFee).toBeLessThanOrEqual(500);
    }
  });

  it('references only known documents, traits and states', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      for (const key of scheme.eligibility.requiredDocuments ?? []) {
        expect(SCHEME_DOCUMENTS[key]).toBeDefined();
      }
      for (const trait of scheme.eligibility.requiredTraits ?? []) {
        expect(SCHEME_TRAIT_LABELS[trait]).toBeDefined();
      }
      for (const state of scheme.eligibility.allowedStates ?? []) {
        expect(INDIAN_STATE_BY_CODE.get(state)).toBeDefined();
      }
    }
  });

  it('never declares an age relaxation for a category it excludes', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      const { allowedCategories, ageRelaxations } = scheme.eligibility;
      if (!allowedCategories?.length || !ageRelaxations) continue;
      for (const key of ['obc', 'sc', 'st', 'ews'] as const) {
        if (ageRelaxations[key] === undefined) continue;
        expect(allowedCategories).toContain(key);
      }
    }
  });

  it('never gates on a document the profile cannot prove, alone', () => {
    // A scheme whose only requirements are photo/signature would show a checklist that can never
    // be satisfied from the CRM — a sign the criteria were written against the wrong model.
    for (const scheme of BUILT_IN_SCHEMES) {
      const required = scheme.eligibility.requiredDocuments ?? [];
      if (required.length === 0) continue;
      expect(required.some((key) => SCHEME_DOCUMENTS[key].profileVerifiable)).toBe(true);
    }
  });
});

describe('getBuiltInScheme', () => {
  it('finds a scheme by slug', () => {
    expect(getBuiltInScheme('pm-kisan')?.title.en).toBe('PM-Kisan Samman Nidhi');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getBuiltInScheme('not-a-scheme')).toBeUndefined();
  });
});

describe('mergeSchemes', () => {
  const custom = {
    ...(getBuiltInScheme('pm-kisan') as NonNullable<ReturnType<typeof getBuiltInScheme>>),
    estimatedOperatorFee: 75,
  };

  it("lets an organisation's own copy win on slug", () => {
    const merged = mergeSchemes([custom]);
    expect(merged).toHaveLength(BUILT_IN_SCHEMES.length);
    expect(merged.find((s) => s.slug === 'pm-kisan')?.estimatedOperatorFee).toBe(75);
  });

  it('appends a scheme with a new slug', () => {
    const extra = { ...custom, id: 'local-1', slug: 'local-scheme' };
    expect(mergeSchemes([extra])).toHaveLength(BUILT_IN_SCHEMES.length + 1);
  });
});

describe('scheme logos', () => {
  const LOGO = 'ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.png';

  it('ships no built-in with a logo', () => {
    // Logos are uploaded in the admin panel, into a bucket; nothing in the build can point there.
    expect(BUILT_IN_SCHEMES.every((scheme) => !scheme.logoPath)).toBe(true);
  });

  it('accepts only <slug>/<uuid>.<png|jpg|webp>', () => {
    expect(isSchemeLogoPath(LOGO)).toBe(true);
    expect(isSchemeLogoPath('pm-kisan/0f8fad5b-d9cb-469f-a165-70867728950e.webp')).toBe(true);

    for (const bad of [
      'https://cdn.example.com/logo.png',
      '/ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.png',
      '../ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.png',
      'ssc-cgl/../0f8fad5b-d9cb-469f-a165-70867728950e.png',
      'ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.svg',
      'ssc-cgl/logo.png',
      'SSC-CGL/0f8fad5b-d9cb-469f-a165-70867728950e.png',
      `${LOGO}
`,
      '',
      null,
      42,
    ]) {
      expect(isSchemeLogoPath(bad)).toBe(false);
    }
  });

  it('validates the path on a scheme definition', () => {
    const scheme = getBuiltInScheme('ssc-cgl')!;
    expect(schemeDefinitionSchema.safeParse({ ...scheme, logoPath: LOGO }).success).toBe(true);
    expect(schemeDefinitionSchema.safeParse({ ...scheme, logoPath: null }).success).toBe(true);
    expect(
      schemeDefinitionSchema.safeParse({ ...scheme, logoPath: 'https://example.com/x.png' })
        .success,
    ).toBe(false);
  });

  it('strips a logo from a scraped candidate', () => {
    const { id: _id, ...scheme } = getBuiltInScheme('ssc-cgl')!;
    const parsed = scrapedCandidateSchema.parse({
      scheme: { ...scheme, logoPath: LOGO },
      sourceUrl: 'https://ssc.gov.in/',
    });
    expect('logoPath' in parsed.scheme).toBe(false);
  });
});
