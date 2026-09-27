/**
 * The scraper ingestion vocabulary and its diff engine.
 *
 * The pipeline exists because of one asymmetry: the *rules* of a government scheme change
 * rarely, but the *dates* change with every notification, and a stale date read aloud at a
 * counter is worse than no date at all (see the header of 0020_schemes_catalog.sql). Watching a
 * few dozen notification pages by hand does not scale; letting a robot write straight into the
 * catalogue every centre reads from is not acceptable either.
 *
 * So nothing a scraper produces is ever live. It lands in a staging queue as a *candidate*, is
 * diffed against what is currently published, and a human approves the diff. That is what the
 * types here describe, and the diff itself is pure so it can be tested exhaustively without a
 * database, a network or a browser.
 *
 * Nothing in this module touches personal data. Scraper sources are public government
 * notification pages; a staged item is a claim about a published rule.
 */

import { z } from 'zod';
import { schemeDefinitionSchema, type SchemeDefinition } from '../schemes/types';

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * How a source produces candidates.
 *
 *   manual  — a person pastes a notification's text and it is parsed into a candidate. Always
 *             available, needs no network, and is the honest default: a human already read the
 *             page.
 *   fixture — candidates come from the source's own `config.items`. Used by seed data and the
 *             test suite so the whole pipeline can be exercised deterministically.
 *   http    — fetches the source URL over the network. Gated by an explicit deployment switch, a
 *             public-URL check and a robots.txt check; see
 *             apps/web/lib/admin/scraper/fetchers/http.ts. Off unless someone turns it on.
 */
export const SCRAPER_FETCHERS = ['manual', 'fixture', 'http'] as const;
export type ScraperFetcher = (typeof SCRAPER_FETCHERS)[number];

export const SCRAPER_FETCHER_LABELS: Record<ScraperFetcher, { en: string; hi: string }> = {
  manual: { en: 'Manual paste', hi: 'मैनुअल पेस्ट' },
  fixture: { en: 'Fixture', hi: 'फिक्स्चर' },
  http: { en: 'HTTP fetch', hi: 'एचटीटीपी फ़ेच' },
};

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export const SCRAPER_RUN_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'partial',
  'failed',
  'cancelled',
] as const;
export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number];

export const SCRAPER_TRIGGERS = ['manual', 'schedule'] as const;
export type ScraperTrigger = (typeof SCRAPER_TRIGGERS)[number];

/** A run that found nothing new is a success, not a failure — most polls find nothing. */
export const SCRAPER_TERMINAL_RUN_STATUSES: readonly ScraperRunStatus[] = [
  'succeeded',
  'partial',
  'failed',
  'cancelled',
];

export function isTerminalRunStatus(status: ScraperRunStatus): boolean {
  return SCRAPER_TERMINAL_RUN_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export const QUEUE_ITEM_STATUSES = [
  'pending',
  'approved',
  'rejected',
  /** A newer candidate for the same scheme arrived before anyone reviewed this one. */
  'superseded',
] as const;
export type QueueItemStatus = (typeof QUEUE_ITEM_STATUSES)[number];

export const QUEUE_ITEM_STATUS_LABELS: Record<QueueItemStatus, { en: string; hi: string }> = {
  pending: { en: 'Awaiting review', hi: 'समीक्षा प्रतीक्षित' },
  approved: { en: 'Published', hi: 'प्रकाशित' },
  rejected: { en: 'Rejected', hi: 'अस्वीकृत' },
  superseded: { en: 'Superseded', hi: 'अधिक्रमित' },
};

/**
 * What a candidate would do to the live catalogue.
 *
 * `deadline_only` is called out because it is both the commonest case and the safest one: the
 * scheme's rules are unchanged and only its window moved, which is precisely the change a
 * reviewer can confirm against the notification in seconds.
 */
export const QUEUE_CHANGE_KINDS = ['new', 'deadline_only', 'update', 'no_change'] as const;
export type QueueChangeKind = (typeof QUEUE_CHANGE_KINDS)[number];

export const QUEUE_CHANGE_KIND_LABELS: Record<QueueChangeKind, { en: string; hi: string }> = {
  new: { en: 'New scheme', hi: 'नई योजना' },
  deadline_only: { en: 'Dates only', hi: 'केवल तिथियाँ' },
  update: { en: 'Content change', hi: 'सामग्री परिवर्तन' },
  no_change: { en: 'No change', hi: 'कोई परिवर्तन नहीं' },
};

/** Legal review transitions. A reviewed item is final; re-reviewing it is a bug, not a feature. */
const QUEUE_TRANSITIONS: Record<QueueItemStatus, readonly QueueItemStatus[]> = {
  pending: ['approved', 'rejected', 'superseded'],
  approved: [],
  rejected: [],
  superseded: [],
};

export function canTransitionQueueItem(from: QueueItemStatus, to: QueueItemStatus): boolean {
  return QUEUE_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// The candidate a fetcher produces
// ---------------------------------------------------------------------------

/**
 * A scraped candidate.
 *
 * `scheme` is a full scheme definition minus the id, because a candidate has no identity in the
 * catalogue until it is published. It is validated with the same schema the live catalogue uses —
 * a scraper gets no leniency a human editor would not get.
 */
export const scrapedCandidateSchema = z.object({
  // No image paths either: a logo or banner is an object an admin uploaded, and a fetcher has no
  // bytes in the bucket to point at. Zod strips the keys, so a scraped path never reaches the
  // catalogue.
  scheme: schemeDefinitionSchema.omit({
    id: true,
    logoPath: true,
    bannerPath: true,
    illustrationPath: true,
  }),
  /** The exact page this claim came from, so a reviewer can check it in one click. */
  sourceUrl: z.string().url(),
  /**
   * The fetcher's own confidence, 0–1. Advisory only: it orders the inbox, and decides nothing.
   * There is no confidence threshold above which something auto-publishes.
   */
  confidence: z.number().min(0).max(1).default(0.5),
  /** Free-text note from the fetcher, e.g. which heading the dates were read from. */
  note: z.string().max(500).optional(),
});

export type ScrapedCandidate = z.infer<typeof scrapedCandidateSchema>;
export type CandidateScheme = ScrapedCandidate['scheme'];

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export const DIFF_GROUPS = [
  'schedule',
  'identity',
  'content',
  'eligibility',
  'commercial',
] as const;
export type DiffGroup = (typeof DIFF_GROUPS)[number];

export type SchemeFieldDiff = {
  /** Dot path into the scheme definition, e.g. `schedule.applicationEndDate`. */
  path: string;
  group: DiffGroup;
  /** The live value; `null` when unset. */
  before: unknown;
  after: unknown;
};

export type SchemeDiff = {
  changeKind: QueueChangeKind;
  changes: SchemeFieldDiff[];
  /** True when every change is inside `schedule` — the fast-path review. */
  scheduleOnly: boolean;
};

/**
 * Every field a candidate is allowed to change, and which group it belongs to.
 *
 * An allowlist rather than a walk of the object, on purpose. A scraper that invents a key must
 * not be able to smuggle it into a diff and from there into the catalogue; anything not named
 * here is simply not a change this pipeline can make.
 */
const DIFFABLE_FIELDS: readonly { path: string; group: DiffGroup }[] = [
  { path: 'slug', group: 'identity' },
  { path: 'category', group: 'identity' },
  { path: 'portalName', group: 'identity' },
  { path: 'portalUrl', group: 'identity' },
  { path: 'adapterSlug', group: 'identity' },
  { path: 'officialNotificationUrl', group: 'identity' },

  { path: 'title', group: 'content' },
  { path: 'shortDescription', group: 'content' },
  { path: 'benefitsSummary', group: 'content' },
  { path: 'benefitHighlight', group: 'content' },
  { path: 'pitchTemplate', group: 'content' },
  { path: 'upcomingPitchTemplate', group: 'content' },

  { path: 'schedule.applicationStartDate', group: 'schedule' },
  { path: 'schedule.applicationEndDate', group: 'schedule' },
  { path: 'schedule.isAlwaysOpen', group: 'schedule' },
  { path: 'schedule.examDate', group: 'schedule' },

  { path: 'eligibility', group: 'eligibility' },

  { path: 'estimatedOperatorFee', group: 'commercial' },
];

function valueAt(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Order-insensitive deep equality.
 *
 * Object key order matters to `JSON.stringify` and to nobody else. Comparing serialised forms
 * directly would report a change every time a fetcher happened to emit `{maxAge, minAge}` rather
 * than `{minAge, maxAge}`, which is how a review queue fills with noise and stops being read.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // `undefined` and `null` both mean "not set" here: the database stores null, the domain type
  // uses optional properties, and treating them as different would diff every optional field.
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const defined = (value: object) =>
      Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined);
    const aKeys = defined(a);
    const bKeys = defined(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

/**
 * What publishing this candidate would change.
 *
 * `live` is `null` for a scheme the catalogue has never seen, which yields `changeKind: 'new'`
 * and no field rows — a reviewer of a new scheme reads the whole candidate, not a diff against
 * nothing.
 */
export function diffScheme(live: SchemeDefinition | null, candidate: CandidateScheme): SchemeDiff {
  if (!live) return { changeKind: 'new', changes: [], scheduleOnly: false };

  const changes: SchemeFieldDiff[] = [];
  for (const field of DIFFABLE_FIELDS) {
    const before = valueAt(live, field.path);
    const after = valueAt(candidate, field.path);
    if (deepEqual(before, after)) continue;
    changes.push({
      path: field.path,
      group: field.group,
      before: before ?? null,
      after: after ?? null,
    });
  }

  if (changes.length === 0) {
    return { changeKind: 'no_change', changes, scheduleOnly: false };
  }

  const scheduleOnly = changes.every((change) => change.group === 'schedule');
  return { changeKind: scheduleOnly ? 'deadline_only' : 'update', changes, scheduleOnly };
}

// ---------------------------------------------------------------------------
// Content hashing — deduplication
// ---------------------------------------------------------------------------

/**
 * Stable JSON: object keys sorted, `undefined` dropped. Two candidates that say the same thing
 * must hash the same however their fetcher happened to build the object.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * FNV-1a over the stable serialisation, as 16 hex characters.
 *
 * Non-cryptographic on purpose: this is a deduplication key, not a security boundary, and a
 * pure-JS implementation keeps this module free of node-only APIs so the same code runs in the
 * dashboard, the worker and a test. A collision costs one redundant queue row.
 */
export function candidateContentHash(candidate: CandidateScheme): string {
  const canonical = stableStringify(candidate);
  const mask = 0xffffffffffffffffn;
  const prime = 0x100000001b3n;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash ^ BigInt(canonical.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

/**
 * A scraper source. `sourceUrl` must be a public https page — the spec forbids scraping
 * protected government data (§7.3), and the fetchers enforce that again at request time.
 */
export const scraperSourceInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug'),
  name: z.string().trim().min(1).max(120),
  portalName: z.string().trim().min(1).max(120),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'admin.scrapers.httpsRequired'),
  fetcher: z.enum(SCRAPER_FETCHERS),
  isEnabled: z.boolean().default(true),
  /** Minutes between scheduled polls. Floored at an hour: notification pages are not live feeds. */
  intervalMinutes: z.number().int().min(60).max(20_160).default(1440),
  notes: z.string().trim().max(2000).optional(),
});

export type ScraperSourceInput = z.infer<typeof scraperSourceInputSchema>;
