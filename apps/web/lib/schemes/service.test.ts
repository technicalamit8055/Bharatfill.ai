import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCHEMES, type SchemeDefinition, type SchemeSchedule } from '@assistigo/core';
import {
  countByLifecycle,
  filterSchemes,
  inheritPlatformArtwork,
  isSchemeSort,
  listingsForLifecycle,
  schemeFromRow,
  schemeStateOptions,
  sortListings,
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

describe('countByLifecycle', () => {
  const catalog = [
    withSchedule('closing-soon', { applicationEndDate: '2026-09-06' }),
    withSchedule('active-later', { applicationEndDate: '2026-10-30' }),
    withSchedule('upcoming', { applicationStartDate: '2026-09-20' }),
    withSchedule('evergreen', { isAlwaysOpen: true }),
    withSchedule('closed', { applicationEndDate: '2026-08-30' }),
  ];

  it('counts each tab from the same pass that fills the grid', () => {
    const all = filterSchemes(catalog, {}, TODAY);
    const counts = countByLifecycle(all);

    expect(counts).toEqual({ all: 4, open: 2, upcoming: 1, evergreen: 1 });
    for (const lifecycle of ['all', 'open', 'upcoming', 'evergreen'] as const) {
      expect(counts[lifecycle]).toBe(listingsForLifecycle(all, lifecycle).length);
      expect(slugs(listingsForLifecycle(all, lifecycle))).toEqual(
        slugs(filterSchemes(catalog, { lifecycle }, TODAY)),
      );
    }
  });

  it('counts nothing for an empty list', () => {
    expect(countByLifecycle([])).toEqual({ all: 0, open: 0, upcoming: 0, evergreen: 0 });
  });
});

describe('sortListings', () => {
  const listing = (slug: string, en: string, fee: number): SchemeListing => ({
    scheme: { ...withSchedule(slug, {}), title: { en, hi: en }, estimatedOperatorFee: fee },
    status: 'active',
    daysRemaining: null,
    daysUntilOpen: null,
  });
  const input = [
    listing('c', 'Charlie', 50),
    listing('a', 'Alpha', 100),
    listing('b', 'Bravo', 50),
  ];

  it('keeps the deadline order it was given', () => {
    expect(slugs(sortListings(input, 'deadline'))).toEqual(['c', 'a', 'b']);
  });

  it('sorts by title', () => {
    expect(slugs(sortListings(input, 'name'))).toEqual(['a', 'b', 'c']);
  });

  it('sorts by charge, keeping the deadline order between equal charges', () => {
    expect(slugs(sortListings(input, 'fee'))).toEqual(['c', 'b', 'a']);
  });

  it('does not reorder the array it was given', () => {
    sortListings(input, 'name');
    expect(slugs(input)).toEqual(['c', 'a', 'b']);
  });

  it('accepts only known sort keys from the URL', () => {
    expect(isSchemeSort('fee')).toBe(true);
    expect(isSchemeSort('latest')).toBe(false);
  });
});

describe('inheritPlatformArtwork', () => {
  const LOGO = 'ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.png';
  const OWN_LOGO = 'ssc-cgl/1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b.png';
  const base = withSchedule('ssc-cgl', {});

  it('keeps the platform logo on a scheme a centre has overridden', () => {
    const platform = [{ ...base, logoPath: LOGO }];
    const merged = [{ ...base, logoPath: null }];
    expect(inheritPlatformArtwork(merged, platform)[0]?.logoPath).toBe(LOGO);
  });

  it('never replaces a logo the merged row already has', () => {
    const platform = [{ ...base, logoPath: LOGO }];
    const merged = [{ ...base, logoPath: OWN_LOGO }];
    expect(inheritPlatformArtwork(merged, platform)[0]?.logoPath).toBe(OWN_LOGO);
  });

  it('leaves other schemes alone', () => {
    const platform = [{ ...base, logoPath: LOGO }];
    const other = withSchedule('ssc-chsl', {});
    expect(inheritPlatformArtwork([other], platform)[0]?.logoPath).toBeUndefined();
  });

  it('keeps the platform banner and illustration too, each on its own', () => {
    const BANNER = 'ssc-cgl/2c1b6f5e-0d6a-4b8e-9a51-3f0f4f3c9e11.jpg';
    const ART = 'ssc-cgl/3d2c7a6f-1e7b-4c9f-8b62-4a1a5a4d0f22.webp';
    const platform = [{ ...base, logoPath: LOGO, bannerPath: BANNER, illustrationPath: ART }];
    const merged = [{ ...base, logoPath: OWN_LOGO, bannerPath: null }];
    const [result] = inheritPlatformArtwork(merged, platform);
    expect(result?.logoPath).toBe(OWN_LOGO);
    expect(result?.bannerPath).toBe(BANNER);
    expect(result?.illustrationPath).toBe(ART);
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
    logo_path: null,
    banner_path: null,
    illustration_path: null,
  };

  const LOGO = 'district-widow-pension/0f8fad5b-d9cb-469f-a165-70867728950e.webp';

  it('carries the logo path', () => {
    expect(schemeFromRow({ ...row, logo_path: LOGO })?.logoPath).toBe(LOGO);
    expect(schemeFromRow(row)?.logoPath).toBeNull();
  });

  it('carries the banner and illustration paths, and drops malformed ones', () => {
    const scheme = schemeFromRow({ ...row, banner_path: LOGO, illustration_path: LOGO });
    expect(scheme?.bannerPath).toBe(LOGO);
    expect(scheme?.illustrationPath).toBe(LOGO);

    const bad = schemeFromRow({ ...row, banner_path: 'https://example.com/banner.jpg' });
    expect(bad?.slug).toBe('district-widow-pension');
    expect(bad?.bannerPath).toBeNull();
  });

  /** A logo is decoration; a bad one costs the card its picture, never the scheme. */
  it('keeps the scheme and drops a malformed logo path', () => {
    for (const bad of ['https://example.com/x.png', '../customer-documents/x.png', 'x.svg']) {
      const scheme = schemeFromRow({ ...row, logo_path: bad });
      expect(scheme?.slug).toBe('district-widow-pension');
      expect(scheme?.logoPath).toBeNull();
    }
  });

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
