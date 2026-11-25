/**
 * Home dashboard view model, plus the small pure helpers its screen needs: the greeting name,
 * avatar initials, "2 hours ago" ages, "3 documents" counts and how many cards fit in a row.
 *
 * The Home route fills the dashboard from the encrypted vault (`vaultDashboardSummary`): counts
 * per category and the newest documents. There is no saved profile, so the name stays empty.
 *
 * The citizen's name is only ever read for display here: never logged or persisted.
 */

import type { ImageSourcePropType } from 'react-native';

import type { DocumentChecklistItem } from '../checklist/checklist';
import type { TranslateValues } from '../i18n';
import { normaliseFullName } from '../profile/profile';
import { VAULT_CATEGORIES, type VaultCategoryKey } from '../vault/categories';
import type { VaultDocument } from '../vault/vault-index';

/**
 * The scans offered as shortcuts on Home, in display order. Each has copy at
 * `home.quickActions.<mode>`. ID cards, photos and signatures are added from the document
 * checklist instead, which knows which document is wanted (`lib/checklist`).
 */
export const QUICK_SCAN_MODES = ['document', 'multi_page'] as const;
export type QuickScanMode = (typeof QUICK_SCAN_MODES)[number];

/**
 * The tiles under Home's hero, in display order: the scanner shortcuts, with Upload (a photo or
 * PDF already on the phone, `app/import.tsx`) second, next to the plain document scan. Each has
 * copy at `home.quickActions.<action>`.
 */
export const QUICK_ACTIONS = ['document', 'upload', 'multi_page'] as const satisfies readonly (
  QuickScanMode | 'upload'
)[];
export type QuickAction = (typeof QUICK_ACTIONS)[number];

/** Route params for `/scanner` (`app/scanner.tsx`). */
export type ScannerParams = { readonly mode: 'single' | 'multi' };

/** What a quick action opens: the ordinary scanner, for one page or several. */
export function quickScanParams(mode: QuickScanMode): ScannerParams {
  return { mode: mode === 'multi_page' ? 'multi' : 'single' };
}

export type RecentDocument = {
  readonly id: string;
  /** What the citizen calls the document, e.g. "10th Marksheet". */
  readonly title: string;
  readonly createdAt: Date;
  readonly thumbnail: ImageSourcePropType;
};

export type HomeDashboard = {
  /** Null until the citizen has a saved profile. */
  readonly citizenName: string | null;
  readonly hasUnreadNotifications: boolean;
  readonly documentCounts: Readonly<Record<VaultCategoryKey, number>>;
  /** The everyday documents, ticked or not. Empty hides the card: the vault is not read yet. */
  readonly checklist: readonly DocumentChecklistItem[];
  /** Newest first. */
  readonly recentDocuments: readonly RecentDocument[];
};

/** What a citizen with no profile and an empty vault sees. */
export const EMPTY_HOME_DASHBOARD: HomeDashboard = {
  citizenName: null,
  hasUnreadNotifications: false,
  documentCounts: { identity: 0, academic: 0, certificate: 0, form_asset: 0 },
  checklist: [],
  recentDocuments: [],
};

/** How many recent documents Home shows; the mockup's row holds four. */
export const RECENT_DOCUMENT_LIMIT = 4;

export type VaultDashboardSummary = {
  readonly documentCounts: Readonly<Record<VaultCategoryKey, number>>;
  /** Newest first, at most `limit`. */
  readonly recent: readonly VaultDocument[];
};

/**
 * Counts per vault category and the newest documents, from the vault's index. A document filed
 * in no category counts in none. Newest by `createdAt`; ties keep the index's order.
 */
export function vaultDashboardSummary(
  documents: readonly VaultDocument[],
  limit: number = RECENT_DOCUMENT_LIMIT,
): VaultDashboardSummary {
  const counts = Object.fromEntries(VAULT_CATEGORIES.map((key) => [key, 0])) as Record<
    VaultCategoryKey,
    number
  >;
  for (const document of documents) {
    if (document.category) counts[document.category] += 1;
  }
  const recent = documents
    .map((document, index) => ({ document, index, at: Date.parse(document.createdAt) }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ document }) => document);
  return { documentCounts: counts, recent };
}

/** A translation key plus its interpolation values, resolved by the screen with `t`. */
export type Message = {
  readonly key: string;
  readonly values?: TranslateValues;
};

function words(fullName: string | null): string[] {
  if (!fullName) return [];
  return normaliseFullName(fullName).split(' ').filter(Boolean);
}

/** First word of the name, for the greeting: "Amit Kumar" → "Amit". */
export function firstNameOf(fullName: string | null): string | null {
  return words(fullName)[0] ?? null;
}

/**
 * Avatar initials from the first and last words: "Amit Kumar" → "AK", "Asha" → "A".
 * Takes the first letter of each word, so a leading apostrophe or hyphen is skipped, and works
 * for Devanagari: "अमित कुमार" → "अक".
 */
export function initialsOf(fullName: string | null): string | null {
  const parts = words(fullName);
  if (parts.length === 0) return null;

  const initial = (word: string | undefined) => word?.match(/\p{L}/u)?.[0] ?? '';
  const first = initial(parts[0]);
  const last = parts.length > 1 ? initial(parts[parts.length - 1]) : '';
  const initials = (first + last).toLocaleUpperCase('en-IN');
  return initials.length > 0 ? initials : null;
}

const MINUTE_MS = 60 * 1000;

function ageMessage(unit: 'minutes' | 'hours' | 'days', count: number): Message {
  return { key: `home.recent.age.${unit}${count === 1 ? 'One' : 'Other'}`, values: { count } };
}

/**
 * "2 hours ago" for a document's card. Rounds down, so a document is "1 day ago" from its 24th
 * hour. A timestamp in the future (a phone clock running behind the server) reads as "Just now"
 * rather than a negative age.
 */
export function documentAgeMessage(createdAt: Date, now: Date): Message {
  const minutes = Math.floor((now.getTime() - createdAt.getTime()) / MINUTE_MS);
  if (!Number.isFinite(minutes) || minutes < 1) return { key: 'home.recent.age.justNow' };
  if (minutes < 60) return ageMessage('minutes', minutes);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ageMessage('hours', hours);

  return ageMessage('days', Math.floor(hours / 24));
}

/** "No documents", "1 document" or "3 documents" under a vault category. */
export function documentCountMessage(count: number): Message {
  if (count < 1) return { key: 'home.vault.count.none' };
  if (count === 1) return { key: 'home.vault.count.one' };
  return { key: 'home.vault.count.other', values: { count } };
}

export type RowLayout = {
  readonly itemWidth: number;
  readonly scrolls: boolean;
};

/**
 * Sizes a row of `count` equal items across `available` width. When every item can be at least
 * `minItemWidth` the row fills the width; otherwise items stay at `minItemWidth` and the row
 * scrolls sideways.
 *
 * The mockup fits five quick actions and four recent documents across, but on a 360–412dp phone
 * that needs type well below a readable size, so those rows scroll there instead.
 */
export function rowLayout(
  available: number,
  count: number,
  minItemWidth: number,
  gap: number,
): RowLayout {
  if (count < 1) return { itemWidth: minItemWidth, scrolls: false };

  const fill = Math.floor((available - gap * (count - 1)) / count);
  return fill >= minItemWidth
    ? { itemWidth: fill, scrolls: false }
    : { itemWidth: minItemWidth, scrolls: true };
}
