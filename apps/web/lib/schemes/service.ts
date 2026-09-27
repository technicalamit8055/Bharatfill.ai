import 'server-only';

import {
  BUILT_IN_SCHEMES,
  educationSatisfies,
  getBuiltInScheme,
  isIndianStateCode,
  isSchemeLogoPath,
  matchCustomerToAllSchemes,
  matchSchemeToCustomers,
  mergeSchemes,
  resolveSchemeLifecycle,
  schemeDefinitionSchema,
  schemeProfileFromValues,
  type CustomerSchemeReport,
  type EducationLevel,
  type SchemeCategory,
  type SchemeDefinition,
  type SchemeLifecycleStatus,
  type SchemeMatchResult,
} from '@assistigo/core';
import { customerValuesFromRow } from '../customers/values';
import { logger } from '../api/logger';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { CustomerRow, SchemesCatalogRow } from '../supabase/database.types';

/**
 * Server-side scheme matching.
 *
 * Privacy note (docs/SECURITY.md §4, DPDP): every match runs in this process against rows the
 * caller's RLS policy already lets them read. Nothing about a customer is sent anywhere — there
 * is no vendor call, no AI call and no logging of profile values in this file. The evaluator
 * itself only ever sees the narrow projection built by `schemeProfileFromValues`, which carries
 * no name, mobile, address or identity number.
 */

// ---------------------------------------------------------------------------
// Loading the catalogue
// ---------------------------------------------------------------------------

const CATALOG_COLUMNS =
  'id, organization_id, slug, category, title, short_description, benefits_summary, benefit_highlight, portal_name, portal_url, adapter_slug, official_notification_url, application_start_date, application_end_date, is_always_open, exam_date, estimated_operator_fee, eligibility, pitch_template, upcoming_pitch_template, is_published, logo_path, banner_path, illustration_path';

export type CatalogRow = Pick<
  SchemesCatalogRow,
  | 'id'
  | 'organization_id'
  | 'slug'
  | 'category'
  | 'title'
  | 'short_description'
  | 'benefits_summary'
  | 'benefit_highlight'
  | 'portal_name'
  | 'portal_url'
  | 'adapter_slug'
  | 'official_notification_url'
  | 'application_start_date'
  | 'application_end_date'
  | 'is_always_open'
  | 'exam_date'
  | 'estimated_operator_fee'
  | 'eligibility'
  | 'pitch_template'
  | 'upcoming_pitch_template'
  | 'is_published'
  | 'logo_path'
  | 'banner_path'
  | 'illustration_path'
>;

/**
 * Turns a stored row into a scheme definition, or `null` if it does not survive validation.
 *
 * Parsed rather than cast, for the same reason the built-in catalogue is parsed at import: a row
 * in this table is a claim about a government rule that an operator will read aloud to a citizen.
 * A malformed criterion that silently becomes `undefined` would widen eligibility instead of
 * narrowing it — a bad row must disappear, not quietly qualify everybody.
 */
export function schemeFromRow(row: CatalogRow): SchemeDefinition | null {
  const candidate = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    benefitsSummary: row.benefits_summary,
    benefitHighlight: row.benefit_highlight,
    category: row.category,
    portalName: row.portal_name,
    portalUrl: row.portal_url,
    adapterSlug: row.adapter_slug ?? undefined,
    officialNotificationUrl: row.official_notification_url,
    schedule: {
      applicationStartDate: row.application_start_date,
      applicationEndDate: row.application_end_date,
      isAlwaysOpen: row.is_always_open,
      examDate: row.exam_date,
    },
    estimatedOperatorFee: row.estimated_operator_fee,
    eligibility: row.eligibility,
    pitchTemplate: row.pitch_template,
    upcomingPitchTemplate: row.upcoming_pitch_template,
    // Screened here rather than left to the schema. A logo is decoration: a bad path should cost
    // the card its picture, not drop a scheme an operator is about to pitch. The column's check
    // constraint makes this unreachable in practice.
    logoPath: isSchemeLogoPath(row.logo_path) ? row.logo_path : null,
    bannerPath: isSchemeLogoPath(row.banner_path) ? row.banner_path : null,
    illustrationPath: isSchemeLogoPath(row.illustration_path) ? row.illustration_path : null,
  };

  const parsed = schemeDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    // Slug and issue paths only. This table holds published government rules, never personal
    // data, so the row identifier is safe to log and is the only way to find the bad record.
    logger.warn('schemes.catalog_row_invalid', {
      slug: row.slug,
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
    return null;
  }
  return parsed.data;
}

/**
 * The catalogue an organisation sees: built-ins, overlaid with the published platform rows, then
 * overlaid with the centre's own.
 *
 * The built-ins are the floor and are never dropped, including when the query fails. An operator
 * mid-conversation should get a slightly stale list rather than an empty page, and the rules in
 * the build are the ones that change least.
 */
export async function loadSchemeCatalog(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
): Promise<SchemeDefinition[]> {
  const { data, error } = await supabase
    .from('schemes_catalog')
    .select(CATALOG_COLUMNS)
    // RLS already scopes this; stating it again is the house rule (CLAUDE.md, "authorization is
    // checked server-side in every route handler, and again by RLS").
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq('is_published', true);

  if (error) {
    logger.warn('schemes.catalog_load_failed', { code: error.code });
    return [...BUILT_IN_SCHEMES];
  }

  const rows = (data ?? []) as CatalogRow[];
  const platform: SchemeDefinition[] = [];
  const own: SchemeDefinition[] = [];

  for (const row of rows) {
    const scheme = schemeFromRow(row);
    if (!scheme) continue;
    (row.organization_id === null ? platform : own).push(scheme);
  }

  return inheritPlatformArtwork(
    mergeSchemes(own, mergeSchemes(platform, BUILT_IN_SCHEMES)),
    platform,
  );
}

/**
 * Keeps the platform images on a scheme a centre has overridden.
 *
 * A centre overrides a global scheme to correct a date or an age limit, not to change its
 * pictures, and it has no way to upload one — the bucket is platform-only. Without this, fixing
 * the closing date of SSC CGL would quietly swap its logo for the category icon and drop its
 * banner. Each kind is inherited on its own: a row that somehow carries a logo still takes the
 * platform's banner.
 */
const IMAGE_FIELDS = ['logoPath', 'bannerPath', 'illustrationPath'] as const;

export function inheritPlatformArtwork(
  merged: SchemeDefinition[],
  platform: readonly SchemeDefinition[],
): SchemeDefinition[] {
  const bySlug = new Map<string, SchemeDefinition>();
  for (const scheme of platform) {
    if (IMAGE_FIELDS.some((field) => scheme[field])) bySlug.set(scheme.slug, scheme);
  }
  if (bySlug.size === 0) return merged;

  return merged.map((scheme) => {
    const source = bySlug.get(scheme.slug);
    if (!source || source === scheme) return scheme;
    let next = scheme;
    for (const field of IMAGE_FIELDS) {
      if (!scheme[field] && source[field]) next = { ...next, [field]: source[field] };
    }
    return next;
  });
}

export async function loadScheme(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  slug: string,
): Promise<SchemeDefinition | null> {
  const catalog = await loadSchemeCatalog(supabase, organizationId);
  return catalog.find((scheme) => scheme.slug === slug) ?? getBuiltInScheme(slug) ?? null;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Columns the matcher needs. Selected explicitly so a widened `customers` table does not quietly
 * start pulling identity JSON into a list query. */
const MATCH_COLUMNS =
  'id, customer_code, full_name, mobile, date_of_birth, gender, category, address_json, education_json, certificates_json, identity_summary_json';

type MatchableCustomerRow = Pick<
  CustomerRow,
  | 'id'
  | 'customer_code'
  | 'full_name'
  | 'mobile'
  | 'date_of_birth'
  | 'gender'
  | 'category'
  | 'address_json'
  | 'education_json'
  | 'certificates_json'
  | 'identity_summary_json'
>;

/** Evaluates one customer against the whole catalogue. */
export async function buildCustomerSchemeReport(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  customer: CustomerRow,
  options: { asOfDate?: Date; includeUpcoming?: boolean } = {},
): Promise<CustomerSchemeReport> {
  const catalog = await loadSchemeCatalog(supabase, organizationId);
  const profile = schemeProfileFromValues(customerValuesFromRow(customer));

  return matchCustomerToAllSchemes(profile, catalog, {
    asOfDate: options.asOfDate,
    includeUpcoming: options.includeUpcoming,
    // Only the given name is used, and only to make the pitch script readable aloud.
    customerName: firstName(customer.full_name),
  });
}

export type EligibleCustomer = {
  id: string;
  customerCode: string;
  fullName: string;
  /** Present only so the operator can start a WhatsApp message from their own device. */
  mobile: string | null;
  result: SchemeMatchResult;
};

/**
 * The Reverse Audience Matcher: every customer of this centre who qualifies for one scheme.
 *
 * Capped rather than paginated on purpose. This is an outreach shortlist an operator works
 * through by hand, and a query that walks an unbounded customer table on every page render is a
 * slow page today and an incident later.
 */
export const REVERSE_MATCH_SCAN_LIMIT = 500;

export async function findEligibleCustomers(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  scheme: SchemeDefinition,
  options: { asOfDate?: Date; limit?: number } = {},
): Promise<{ matches: EligibleCustomer[]; scanned: number; scanLimitReached: boolean }> {
  const { data } = await supabase
    .from('customers')
    .select(MATCH_COLUMNS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(REVERSE_MATCH_SCAN_LIMIT);

  const rows = (data ?? []) as MatchableCustomerRow[];

  const candidates = rows.map((row) => ({
    subject: row,
    profile: schemeProfileFromValues(customerValuesFromRow(row as CustomerRow)),
  }));

  const matched = matchSchemeToCustomers(scheme, candidates, { asOfDate: options.asOfDate });
  const limit = options.limit ?? 100;

  return {
    matches: matched.slice(0, limit).map(({ subject, result }) => ({
      id: subject.id,
      customerCode: subject.customer_code,
      fullName: subject.full_name,
      mobile: subject.mobile,
      result,
    })),
    scanned: rows.length,
    scanLimitReached: rows.length >= REVERSE_MATCH_SCAN_LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Catalogue filtering for the hub
// ---------------------------------------------------------------------------

/** The hub's lifecycle tabs. `all` still hides closed windows — nothing shut is an opportunity. */
export const SCHEME_LIFECYCLE_FILTERS = ['all', 'open', 'upcoming', 'evergreen'] as const;
export type SchemeLifecycleFilter = (typeof SCHEME_LIFECYCLE_FILTERS)[number];

export function isLifecycleFilter(value: string): value is SchemeLifecycleFilter {
  return (SCHEME_LIFECYCLE_FILTERS as readonly string[]).includes(value);
}

const LIFECYCLE_FILTER_MATCHES: Record<
  SchemeLifecycleFilter,
  (status: SchemeLifecycleStatus) => boolean
> = {
  all: () => true,
  open: (status) => status === 'active' || status === 'closing_soon',
  upcoming: (status) => status === 'upcoming',
  evergreen: (status) => status === 'evergreen',
};

export type SchemeFilters = {
  q?: string;
  category?: string;
  state?: string;
  /** Highest qualification the customer holds; keeps schemes that qualification satisfies. */
  education?: string;
  lifecycle?: SchemeLifecycleFilter;
};

export type SchemeListing = {
  scheme: SchemeDefinition;
  status: SchemeLifecycleStatus;
  daysRemaining: number | null;
  daysUntilOpen: number | null;
};

const EDUCATION_LEVEL_SET = new Set<string>([
  'none',
  'class8',
  'class10',
  'class12',
  'iti',
  'diploma',
  'graduation',
  'post_graduation',
]);

function asEducationLevel(value: string | undefined): EducationLevel | null {
  return value && EDUCATION_LEVEL_SET.has(value) ? (value as EducationLevel) : null;
}

/**
 * The hub's list, already resolved against today's date.
 *
 * Lifecycle is computed once here and travels with each scheme, so the page never re-derives it
 * from a second `new Date()` and cannot render a badge that disagrees with the sort order.
 *
 * Closed schemes are dropped unconditionally, on every tab. A lapsed window is not a filter
 * preference — it is a form nobody can submit.
 */
export function filterSchemes(
  catalog: readonly SchemeDefinition[],
  filters: SchemeFilters,
  asOfDate: Date = new Date(),
): SchemeListing[] {
  const query = filters.q?.trim().toLowerCase() ?? '';
  const lifecycleFilter = filters.lifecycle ?? 'all';
  const matchesLifecycle = LIFECYCLE_FILTER_MATCHES[lifecycleFilter];
  const education = asEducationLevel(filters.education);

  const listings: SchemeListing[] = [];

  for (const scheme of catalog) {
    if (filters.category && scheme.category !== (filters.category as SchemeCategory)) continue;

    if (filters.state && isIndianStateCode(filters.state)) {
      const allowed = scheme.eligibility.allowedStates ?? [];
      // An All-India scheme is relevant to every state filter — an operator filtering to Bihar
      // still wants to see PM-Kisan.
      if (allowed.length > 0 && !allowed.includes(filters.state)) continue;
    }

    if (education) {
      const required = scheme.eligibility.minEducationLevel;
      if (
        required &&
        !educationSatisfies(education, required, scheme.eligibility.alsoAcceptsEducation)
      ) {
        continue;
      }
    }

    if (query) {
      const haystack = [
        scheme.title.en,
        scheme.title.hi,
        scheme.shortDescription.en,
        scheme.shortDescription.hi,
        scheme.portalName,
        scheme.slug,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    const lifecycle = resolveSchemeLifecycle(scheme.schedule, asOfDate);
    if (lifecycle.status === 'closed') continue;
    if (!matchesLifecycle(lifecycle.status)) continue;

    listings.push({
      scheme,
      status: lifecycle.status,
      daysRemaining: lifecycle.daysRemaining,
      daysUntilOpen: lifecycle.daysUntilOpen,
    });
  }

  return listings.sort(compareListings);
}

/**
 * Reading order for the hub: what shuts first, then what opens first, then everything undated,
 * with evergreen last. A countdown is the only thing on this page that expires.
 */
function compareListings(a: SchemeListing, b: SchemeListing): number {
  const rank = (listing: SchemeListing): number => {
    if (listing.status === 'closing_soon') return 0;
    if (listing.status === 'upcoming') return 1;
    if (listing.status === 'active') return 2;
    return 3;
  };

  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) return rankDiff;

  if (a.status === 'closing_soon' && b.status === 'closing_soon') {
    return (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
  }
  if (a.status === 'upcoming' && b.status === 'upcoming') {
    return (a.daysUntilOpen ?? 0) - (b.daysUntilOpen ?? 0);
  }
  return a.scheme.title.en.localeCompare(b.scheme.title.en);
}

/**
 * How many listings each lifecycle tab would show, from one `all` pass.
 *
 * Counted from the listings already resolved by `filterSchemes` rather than by filtering the
 * catalogue four more times, so a tab's count and the grid it opens are read from the same
 * evaluation and cannot disagree.
 */
export function countByLifecycle(
  listings: readonly SchemeListing[],
): Record<SchemeLifecycleFilter, number> {
  const counts = { all: 0, open: 0, upcoming: 0, evergreen: 0 };
  for (const listing of listings) {
    for (const filter of SCHEME_LIFECYCLE_FILTERS) {
      if (LIFECYCLE_FILTER_MATCHES[filter](listing.status)) counts[filter] += 1;
    }
  }
  return counts;
}

/** Keeps only the listings a lifecycle tab shows. The sort order from `filterSchemes` survives. */
export function listingsForLifecycle(
  listings: readonly SchemeListing[],
  lifecycle: SchemeLifecycleFilter,
): SchemeListing[] {
  return listings.filter((listing) => LIFECYCLE_FILTER_MATCHES[lifecycle](listing.status));
}

/**
 * The hub's sort orders. `deadline` is the default and is the order `filterSchemes` already
 * returns; the others are for an operator scanning the list for a name or for the cheapest form.
 */
export const SCHEME_SORTS = ['deadline', 'name', 'fee'] as const;
export type SchemeSort = (typeof SCHEME_SORTS)[number];

export function isSchemeSort(value: string): value is SchemeSort {
  return (SCHEME_SORTS as readonly string[]).includes(value);
}

export function sortListings(
  listings: readonly SchemeListing[],
  sort: SchemeSort,
  locale: 'en' | 'hi' = 'en',
): SchemeListing[] {
  const sorted = [...listings];
  if (sort === 'name') {
    sorted.sort((a, b) =>
      a.scheme.title[locale].localeCompare(b.scheme.title[locale], locale === 'hi' ? 'hi' : 'en'),
    );
  } else if (sort === 'fee') {
    // Stable, so schemes at the same charge keep their deadline order.
    sorted.sort((a, b) => a.scheme.estimatedOperatorFee - b.scheme.estimatedOperatorFee);
  }
  return sorted;
}

/** States any scheme in the catalogue is restricted to, for the hub's filter dropdown. */
export function schemeStateOptions(catalog: readonly SchemeDefinition[]): string[] {
  const codes = new Set<string>();
  for (const scheme of catalog) {
    for (const code of scheme.eligibility.allowedStates ?? []) codes.add(code);
  }
  return [...codes].sort();
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
