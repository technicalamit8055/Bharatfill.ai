/**
 * Home dashboard view model, plus the small pure helpers its screen needs: the greeting name,
 * avatar initials, "2 hours ago" ages, "3 documents" counts and how many cards fit in a row.
 *
 * Nothing fills a dashboard from real data yet — there is no vault store or saved profile (see
 * the Home route). Keeping the shape here means that store only has to produce a
 * `HomeDashboard` when it lands; the screen does not change.
 *
 * The citizen's name is only ever read for display here: never logged or persisted.
 */

import type { ImageSourcePropType } from 'react-native';

import type { TranslateValues } from '../i18n';
import { normaliseFullName } from '../profile/profile';
import type { VaultCategoryKey } from '../vault/categories';

/**
 * The scanner presets offered as shortcuts on Home, in display order: plain documents plus the
 * dedicated modes in `docs/CITIZEN_MOBILE_APP_SPEC.md` §3 Feature 1.5. Each has copy at
 * `home.quickActions.<mode>`.
 */
export const QUICK_SCAN_MODES = [
  'document',
  'id_card',
  'photo',
  'signature',
  'multi_page',
] as const;
export type QuickScanMode = (typeof QUICK_SCAN_MODES)[number];

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
  /** Newest first. */
  readonly recentDocuments: readonly RecentDocument[];
};

/** What a citizen with no profile and an empty vault sees. */
export const EMPTY_HOME_DASHBOARD: HomeDashboard = {
  citizenName: null,
  hasUnreadNotifications: false,
  documentCounts: { identity: 0, academic: 0, certificate: 0, form_asset: 0 },
  recentDocuments: [],
};

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
