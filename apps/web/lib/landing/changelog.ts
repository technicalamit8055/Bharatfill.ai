/**
 * The public changelog at `/changelog`: what shipped, newest first.
 *
 * Structure lives here; copy lives in `landing.changelog.*`. Each release's title and summary
 * sit at `landing.changelog.releases.<key>.{title,summary}`, and each item's sentence at
 * `landing.changelog.releases.<key>.items.<item>`. Tag and area labels come from
 * `landing.changelog.tags.*` and `landing.changelog.areas.*`.
 *
 * Only list what has shipped to `main` and what an operator or citizen can see. Internal
 * consoles, vendor choices and deploy plumbing stay out — this page is read by customers.
 */

import { z } from 'zod';

export const CHANGELOG_TAGS = ['new', 'improved', 'fixed'] as const;
export type ChangelogTag = (typeof CHANGELOG_TAGS)[number];

export const CHANGELOG_AREAS = [
  'dashboard',
  'extension',
  'documentTools',
  'citizenApp',
  'website',
] as const;
export type ChangelogArea = (typeof CHANGELOG_AREAS)[number];

export interface ChangelogItem {
  key: string;
  tag: ChangelogTag;
  area: ChangelogArea;
}

export interface ChangelogRelease {
  key: string;
  /** ISO calendar date (IST) the release landed. */
  date: string;
  items: readonly ChangelogItem[];
}

export const CHANGELOG: readonly ChangelogRelease[] = [
  {
    key: 'vaultHome',
    date: '2026-11-07',
    items: [
      { key: 'homeVault', tag: 'new', area: 'citizenApp' },
      { key: 'photoQuality', tag: 'new', area: 'citizenApp' },
      { key: 'scanPresets', tag: 'improved', area: 'citizenApp' },
    ],
  },
  {
    key: 'liveDomain',
    date: '2026-10-22',
    items: [{ key: 'pairLive', tag: 'improved', area: 'extension' }],
  },
  {
    key: 'earlyAccess',
    date: '2026-10-08',
    items: [{ key: 'signUp', tag: 'new', area: 'website' }],
  },
  {
    key: 'smartUploads',
    date: '2026-10-07',
    items: [
      { key: 'autoMatch', tag: 'new', area: 'extension' },
      { key: 'autoFit', tag: 'new', area: 'extension' },
      { key: 'alreadyMatched', tag: 'improved', area: 'dashboard' },
      { key: 'storedStatus', tag: 'improved', area: 'dashboard' },
      { key: 'sscEducation', tag: 'fixed', area: 'extension' },
    ],
  },
  {
    key: 'freshLook',
    date: '2026-10-01',
    items: [
      { key: 'dashboard', tag: 'improved', area: 'dashboard' },
      { key: 'landing', tag: 'improved', area: 'website' },
      { key: 'signIn', tag: 'improved', area: 'dashboard' },
    ],
  },
  {
    key: 'citizenPreview',
    date: '2026-09-25',
    items: [
      { key: 'scanner', tag: 'new', area: 'citizenApp' },
      { key: 'vault', tag: 'new', area: 'citizenApp' },
      { key: 'centres', tag: 'new', area: 'citizenApp' },
    ],
  },
  {
    key: 'multiStage',
    date: '2026-09-05',
    items: [
      { key: 'multiStage', tag: 'new', area: 'extension' },
      { key: 'documentPicker', tag: 'new', area: 'extension' },
      { key: 'dropPreview', tag: 'improved', area: 'dashboard' },
    ],
  },
  {
    key: 'roaming',
    date: '2026-09-03',
    items: [
      { key: 'roaming', tag: 'new', area: 'dashboard' },
      { key: 'roamingExtension', tag: 'new', area: 'extension' },
      { key: 'walkInDrop', tag: 'new', area: 'dashboard' },
    ],
  },
  {
    key: 'schemes',
    date: '2026-09-02',
    items: [{ key: 'schemes', tag: 'new', area: 'dashboard' }],
  },
  {
    key: 'directUpload',
    date: '2026-09-01',
    items: [
      { key: 'upload', tag: 'new', area: 'dashboard' },
      { key: 'openDashboard', tag: 'new', area: 'extension' },
      { key: 'reading', tag: 'fixed', area: 'dashboard' },
    ],
  },
  {
    key: 'dashboardRevamp',
    date: '2026-08-26',
    items: [
      { key: 'dashboard', tag: 'improved', area: 'dashboard' },
      { key: 'applications', tag: 'new', area: 'dashboard' },
      { key: 'documentTools', tag: 'new', area: 'documentTools' },
    ],
  },
  {
    key: 'newLogo',
    date: '2026-08-21',
    items: [
      { key: 'logo', tag: 'improved', area: 'website' },
      { key: 'editCustomer', tag: 'new', area: 'dashboard' },
    ],
  },
  {
    key: 'customerCrm',
    date: '2026-08-19',
    items: [
      { key: 'customers', tag: 'new', area: 'dashboard' },
      { key: 'languages', tag: 'new', area: 'dashboard' },
      { key: 'phones', tag: 'improved', area: 'website' },
    ],
  },
];

/* ── Interactive view ─────────────────────────────────────────────────────────────────────── */

/** One release with its copy resolved, as the interactive list receives it. */
export interface ChangelogReleaseView {
  key: string;
  date: string;
  dateLabel: string;
  title: string;
  summary: string;
  items: readonly ChangelogItemView[];
}

export interface ChangelogItemView extends ChangelogItem {
  text: string;
}

/** Resolves every release's copy once, on the server, so the client only filters strings. */
export function buildChangelogView(
  t: (key: string) => string,
  locale: 'en' | 'hi',
): ChangelogReleaseView[] {
  const prefix = 'landing.changelog.releases';
  return CHANGELOG.map(({ key, date, items }) => ({
    key,
    date,
    dateLabel: formatChangelogDate(date, locale),
    title: t(`${prefix}.${key}.title`),
    summary: t(`${prefix}.${key}.summary`),
    items: items.map((item) => ({ ...item, text: t(`${prefix}.${key}.items.${item.key}`) })),
  }));
}

export interface ChangelogFilter {
  query: string;
  /** Empty means every area. */
  areas: readonly ChangelogArea[];
  /** Empty means every tag. */
  tags: readonly ChangelogTag[];
}

export const EMPTY_FILTER: ChangelogFilter = { query: '', areas: [], tags: [] };

export function normalizeQuery(query: string): string {
  return query.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function isFilterActive(filter: ChangelogFilter): boolean {
  return normalizeQuery(filter.query) !== '' || filter.areas.length > 0 || filter.tags.length > 0;
}

/**
 * Keeps the items that pass the area and tag filters and match the query. A query that matches
 * a release's title, summary or date keeps all of that release's (area- and tag-filtered)
 * items; otherwise only items whose own text matches. Releases left with no items drop out.
 */
export function filterChangelog(
  releases: readonly ChangelogReleaseView[],
  filter: ChangelogFilter,
): ChangelogReleaseView[] {
  const query = normalizeQuery(filter.query);
  const matches = (text: string) =>
    !query || text.normalize('NFC').toLocaleLowerCase().includes(query);

  return releases.flatMap((release) => {
    const faceted = release.items.filter(
      (item) =>
        (filter.areas.length === 0 || filter.areas.includes(item.area)) &&
        (filter.tags.length === 0 || filter.tags.includes(item.tag)),
    );
    const releaseHit =
      matches(release.title) || matches(release.summary) || matches(release.dateLabel);
    const items = releaseHit ? faceted : faceted.filter((item) => matches(item.text));
    return items.length > 0 ? [{ ...release, items }] : [];
  });
}

export function countItems(releases: readonly ChangelogReleaseView[]): number {
  return releases.reduce((sum, release) => sum + release.items.length, 0);
}

/**
 * How many items each chip would show if picked, given the query and the *other* facet — the
 * usual faceted-search count, so picking a chip never surprises with an empty list.
 */
export function facetCounts(
  releases: readonly ChangelogReleaseView[],
  filter: ChangelogFilter,
): { areas: Record<ChangelogArea, number>; tags: Record<ChangelogTag, number> } {
  const areas = Object.fromEntries(CHANGELOG_AREAS.map((area) => [area, 0])) as Record<
    ChangelogArea,
    number
  >;
  const tags = Object.fromEntries(CHANGELOG_TAGS.map((tag) => [tag, 0])) as Record<
    ChangelogTag,
    number
  >;
  for (const release of filterChangelog(releases, { ...filter, areas: [] })) {
    for (const item of release.items) areas[item.area] += 1;
  }
  for (const release of filterChangelog(releases, { ...filter, tags: [] })) {
    for (const item of release.items) tags[item.tag] += 1;
  }
  return { areas, tags };
}

const MAX_QUERY_LENGTH = 80;

function listParam<T extends string>(allowed: readonly T[]) {
  return z
    .string()
    .catch('')
    .transform((value) => {
      const picked = new Set(value.split(','));
      // Canonical order, unknown values dropped: the URL is untrusted input.
      return allowed.filter((option) => picked.has(option));
    });
}

const FilterParams = z.object({
  q: z
    .string()
    .catch('')
    .transform((value) => value.slice(0, MAX_QUERY_LENGTH)),
  area: listParam(CHANGELOG_AREAS),
  tag: listParam(CHANGELOG_TAGS),
});

/** Reads `?q=…&area=a,b&tag=c` — the shareable form of a filtered view. Never throws. */
export function parseChangelogFilter(params: URLSearchParams): ChangelogFilter {
  const { q, area, tag } = FilterParams.parse({
    q: params.get('q') ?? '',
    area: params.get('area') ?? '',
    tag: params.get('tag') ?? '',
  });
  return { query: q, areas: area, tags: tag };
}

/** The inverse of `parseChangelogFilter`; an inactive filter serialises to ''. */
export function serializeChangelogFilter(filter: ChangelogFilter): string {
  const params = new URLSearchParams();
  const query = filter.query.trim().slice(0, MAX_QUERY_LENGTH);
  if (query) params.set('q', query);
  const areas = CHANGELOG_AREAS.filter((area) => filter.areas.includes(area));
  const tags = CHANGELOG_TAGS.filter((tag) => filter.tags.includes(tag));
  if (areas.length) params.set('area', areas.join(','));
  if (tags.length) params.set('tag', tags.join(','));
  return params.toString();
}

/** Splits `text` into runs for highlighting every case-insensitive occurrence of `query`. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const needle = normalizeQuery(query);
  const haystack = text.normalize('NFC');
  const lowered = haystack.toLocaleLowerCase();
  // Lower-casing can change length in a few scripts; then offsets would lie, so skip marking.
  if (!needle || lowered.length !== haystack.length) return [{ text: haystack, match: false }];

  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (let at = lowered.indexOf(needle); at !== -1; at = lowered.indexOf(needle, from)) {
    if (at > from) parts.push({ text: haystack.slice(from, at), match: false });
    parts.push({ text: haystack.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < haystack.length) parts.push({ text: haystack.slice(from), match: false });
  return parts;
}

/**
 * "7 November 2026" / "7 नवंबर 2026". The date is a calendar day, not an instant, so it is read
 * and printed in UTC: no time zone can move it to the day before.
 */
export function formatChangelogDate(isoDate: string, locale: 'en' | 'hi'): string {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Controls of the interactive list, under `landing.changelog.ui.*`. */
export const CHANGELOG_UI_KEYS = [
  'filtersLabel',
  'searchLabel',
  'searchPlaceholder',
  'searchHint',
  'clearSearch',
  'areaLabel',
  'tagLabel',
  'all',
  'results',
  'clearFilters',
  'emptyTitle',
  'emptyBody',
  'expandAll',
  'collapseAll',
  'itemCount.one',
  'itemCount.other',
  'copyLink',
  'copied',
] as const;

/** The only copy that interpolates, and the names each may use. */
export const CHANGELOG_PLACEHOLDERS: Readonly<Record<string, readonly string[]>> = {
  'landing.changelog.ui.results': ['changes', 'total'],
  'landing.changelog.ui.itemCount.other': ['count'],
};

/** Every copy key the page renders, so the catalogue test can check both locales. */
export function changelogCopyKeys(): string[] {
  const prefix = 'landing.changelog';
  return [
    ...['meta.title', 'meta.description', 'eyebrow', 'title', 'subtitle', 'back'].map(
      (key) => `${prefix}.${key}`,
    ),
    ...CHANGELOG_UI_KEYS.map((key) => `${prefix}.ui.${key}`),
    ...CHANGELOG_TAGS.map((tag) => `${prefix}.tags.${tag}`),
    ...CHANGELOG_AREAS.map((area) => `${prefix}.areas.${area}`),
    ...CHANGELOG.flatMap(({ key, items }) => [
      `${prefix}.releases.${key}.title`,
      `${prefix}.releases.${key}.summary`,
      ...items.map((item) => `${prefix}.releases.${key}.items.${item.key}`),
    ]),
  ];
}
