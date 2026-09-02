import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCHEMES, type SchemeDefinition, type SchemeSchedule } from '@assistigo/core';
import {
  filterSchemes,
  schemeFromRow,
  schemeStateOptions,
  type CatalogRow,
  type SchemeListing,
} from './service';

const TODAY = new Date('2026-09-02T00:00:00.000Z');

const slugs = (listings: SchemeListing[]) => listings.map((listing) => listing.scheme.slug);

function withSchedule(slug: string, schedule: Partial<SchemeSchedule>): SchemeDefinition {
  return {
    ...(BUILT_IN_SCHEMES[0] as SchemeDefinition),
    slug,
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
      ...schedule,
    },
  };
}

describe('filterSchemes', () => {
  it('returns the whole catalogue with no filters', () => {
    expect(filterSchemes(BUILT_IN_SCHEMES, {}, TODAY)).toHaveLength(BUILT_IN_SCHEMES.length);
  });

  it('filters by category', () => {
    const scholarships = filterSchemes(BUILT_IN_SCHEMES, { category: 'scholarship' }, TODAY);
    expect(scholarships.length).toBeGreaterThan(0);
    expect(scholarships.every((listing) => listing.scheme.category === 'scholarship')).toBe(true);
  });

  /**
   * The behaviour worth pinning down: filtering to a state must keep All-India schemes. An
   * operator in Bihar still sells PM-Kisan, and hiding it would make the filter actively
   * misleading rather than merely narrow.
   */
  it('keeps All-India schemes when a state filter is applied', () => {
    const bihar = filterSchemes(BUILT_IN_SCHEMES, { state: 'BR' }, TODAY);
    expect(slugs(bihar)).toContain('bihar-police-constable');
    expect(slugs(bihar)).toContain('pm-kisan');
    expect(slugs(bihar)).not.toContain('up-police-constable');
  });

  it('ignores a state value that is not a real state code', () => {
    expect(filterSchemes(BUILT_IN_SCHEMES, { state: 'ZZ' }, TODAY)).toHaveLength(
      BUILT_IN_SCHEMES.length,
    );
  });

  it('searches title, description, portal and slug in both locales', () => {
    expect(slugs(filterSchemes(BUILT_IN_SCHEMES, { q: 'constable' }, TODAY))).toContain(
      'ssc-gd-constable',
    );
    expect(slugs(filterSchemes(BUILT_IN_SCHEMES, { q: 'रेलवे' }, TODAY))).toContain('rrb-group-d');
    expect(slugs(filterSchemes(BUILT_IN_SCHEMES, { q: 'Staff Selection' }, TODAY))).toContain(
      'ssc-cgl',
    );
  });

  it('combines filters', () => {
    const result = filterSchemes(
      BUILT_IN_SCHEMES,
      { category: 'recruitment', state: 'UP', q: 'police' },
      TODAY,
    );
    expect(slugs(result).sort()).toEqual(['up-police-constable', 'up-police-si']);
  });
});

describe('filterSchemes — qualification', () => {
  it('keeps what the qualification actually satisfies', () => {
    const class12 = slugs(filterSchemes(BUILT_IN_SCHEMES, { education: 'class12' }, TODAY));
    expect(class12).toContain('ssc-chsl');
    // A graduate-only exam is out of reach for a 12th pass.
    expect(class12).not.toContain('ssc-cgl');
  });

  it('lets a graduate see the exams below their level too', () => {
    const graduate = slugs(filterSchemes(BUILT_IN_SCHEMES, { education: 'graduation' }, TODAY));
    expect(graduate).toContain('ssc-cgl');
    expect(graduate).toContain('ssc-chsl');
    expect(graduate).toContain('ssc-gd-constable');
  });

  it('keeps schemes that ask for no qualification at all', () => {
    const none = slugs(filterSchemes(BUILT_IN_SCHEMES, { education: 'none' }, TODAY));
    expect(none).toContain('pm-kisan');
    expect(none).not.toContain('ssc-chsl');
  });

  it('ignores a qualification value that is not a real level', () => {
    expect(filterSchemes(BUILT_IN_SCHEMES, { education: 'phd' }, TODAY)).toHaveLength(
      BUILT_IN_SCHEMES.length,
    );
  });
});

describe('filterSchemes — lifecycle', () => {
  const closingSoon = withSchedule('closing-soon', { applicationEndDate: '2026-09-06' });
  const activeLater = withSchedule('active-later', { applicationEndDate: '2026-10-30' });
  const upcoming = withSchedule('upcoming', {
    applicationStartDate: '2026-09-20',
    applicationEndDate: '2026-10-20',
  });
  const evergreen = withSchedule('evergreen', { isAlwaysOpen: true });
  const closed = withSchedule('closed', { applicationEndDate: '2026-08-30' });
  const catalog = [activeLater, evergreen, closed, upcoming, closingSoon];

  /**
   * The rule the whole feature rests on: a shut window is never a filter preference. An operator
   * pitching a form nobody can submit is worse than an operator seeing one fewer scheme.
   */
  it('never shows a closed window, on any tab', () => {
    for (const lifecycle of ['all', 'open', 'upcoming', 'evergreen'] as const) {
      expect(slugs(filterSchemes(catalog, { lifecycle }, TODAY))).not.toContain('closed');
    }
  });

  it('separates open, upcoming and evergreen', () => {
    expect(slugs(filterSchemes(catalog, { lifecycle: 'open' }, TODAY))).toEqual([
      'closing-soon',
      'active-later',
    ]);
    expect(slugs(filterSchemes(catalog, { lifecycle: 'upcoming' }, TODAY))).toEqual(['upcoming']);
    expect(slugs(filterSchemes(catalog, { lifecycle: 'evergreen' }, TODAY))).toEqual(['evergreen']);
  });

  it('reads the soonest deadline first, then the soonest opening, evergreen last', () => {
    expect(slugs(filterSchemes(catalog, {}, TODAY))).toEqual([
      'closing-soon',
      'upcoming',
      'active-later',
      'evergreen',
    ]);
  });

  it('carries the resolved countdown so the page never recomputes it', () => {
    const [first] = filterSchemes(catalog, { lifecycle: 'open' }, TODAY);
    expect(first?.status).toBe('closing_soon');
    expect(first?.daysRemaining).toBe(4);

    const [next] = filterSchemes(catalog, { lifecycle: 'upcoming' }, TODAY);
    expect(next?.daysUntilOpen).toBe(18);
  });

  it('shows the built-ins as undated rather than as a countdown', () => {
    const listings = filterSchemes(BUILT_IN_SCHEMES, { lifecycle: 'open' }, TODAY);
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((listing) => listing.daysRemaining === null)).toBe(true);
  });

  it('has nothing upcoming while no built-in carries dates', () => {
    // Matches the deliberate choice in catalog.ts: no fabricated windows ship with the app.
    expect(filterSchemes(BUILT_IN_SCHEMES, { lifecycle: 'upcoming' }, TODAY)).toHaveLength(0);
  });
});

describe('schemeStateOptions', () => {
  it('lists only the states some scheme is actually restricted to, sorted', () => {
    const options = schemeStateOptions(BUILT_IN_SCHEMES);
    expect(options).toEqual([...options].sort());
    expect(options).toContain('UP');
    expect(options).toContain('BR');
    expect(new Set(options).size).toBe(options.length);
  });
});

describe('schemeFromRow', () => {
  const row: CatalogRow = {
    id: 'a2f3c1de-0000-4000-8000-000000000001',
    organization_id: null,
    slug: 'district-widow-pension',
    category: 'welfare',
    title: { en: 'District widow pension', hi: 'जिला विधवा पेंशन' },
    short_description: { en: 'Monthly pension.', hi: 'मासिक पेंशन।' },
    benefits_summary: { en: '₹1,000 a month.', hi: '₹1,000 प्रति माह।' },
    benefit_highlight: { en: '₹1,000 / month', hi: '₹1,000 / माह' },
    portal_name: 'e-District',
    portal_url: 'https://serviceonline.gov.in/',
    adapter_slug: null,
    official_notification_url: null,
    application_start_date: null,
    application_end_date: null,
    is_always_open: true,
    exam_date: null,
    estimated_operator_fee: 60,
    eligibility: { gender: 'female', minAge: 18 },
    pitch_template: { en: 'Apply for ₹{fee}.', hi: '₹{fee} में आवेदन।' },
    upcoming_pitch_template: { en: 'Opens in {days} days, ₹{fee}.', hi: '{days} दिन, ₹{fee}।' },
    is_published: true,
  };

  it('maps a stored row onto the schedule the evaluator reads', () => {
    const scheme = schemeFromRow(row);
    expect(scheme?.slug).toBe('district-widow-pension');
    expect(scheme?.schedule.isAlwaysOpen).toBe(true);
    expect(scheme?.eligibility.gender).toBe('female');
  });

  it('turns a null adapter into an absent one rather than a null field', () => {
    expect(schemeFromRow(row)?.adapterSlug).toBeUndefined();
  });

  /**
   * The point of validating instead of casting: a criterion the schema does not recognise must
   * not survive into the evaluator, where an unread key silently means "no restriction" and would
   * widen eligibility rather than narrow it.
   */
  it('drops a row whose criteria are malformed', () => {
    expect(schemeFromRow({ ...row, eligibility: { minAge: 'eighteen' } })).toBeNull();
    expect(schemeFromRow({ ...row, eligibility: { gender: 'everyone' } })).toBeNull();
  });

  it('drops a row missing a Hindi string, rather than showing an operator a blank', () => {
    expect(schemeFromRow({ ...row, title: { en: 'Only English' } })).toBeNull();
  });

  it('drops a row whose window ends before it starts', () => {
    expect(
      schemeFromRow({
        ...row,
        is_always_open: false,
        application_start_date: '2026-10-01',
        application_end_date: '2026-09-01',
      }),
    ).toBeNull();
  });
});
