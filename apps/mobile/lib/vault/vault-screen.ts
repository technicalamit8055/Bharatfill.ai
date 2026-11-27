/**
 * Vault tab view model, plus the pure helpers its screen needs: which documents a filter, a
 * category, a search and a sort leave on screen, the per-category counts, and the "JPG ·
 * 2.4 MB · 12 Sep 2026" line under each title.
 *
 * The route turns vault index entries (or, in development builds, the mockup's sample
 * documents) into `VaultItem`s; the screen only ever sees items. Titles are display strings the
 * route already translated — nothing here is logged or persisted.
 */

import type { ImageSourcePropType } from 'react-native';

import type { Translate } from '../i18n';
import { MONTH_KEYS } from '../profile/date-of-birth';
import type { Message } from '../home/dashboard';
import { textMatches } from '../ocr/document-reading';
import { VAULT_CATEGORIES, type VaultCategoryKey } from './categories';
import type { PageMimeType } from './vault-index';

/**
 * The chips under the header, in display order. Each has copy at `vault.filters.<filter>`.
 * "Everyday" gathers the bills, vehicle papers and other everyday papers (`everyday.ts`), which
 * have no folder of their own because they never leave the phone.
 */
export const VAULT_FILTERS = ['all', 'folders', 'everyday', 'recent', 'starred'] as const;
export type VaultFilter = (typeof VAULT_FILTERS)[number];

/** List orders offered by "Sort by". Each has copy at `vault.sort.options.<sort>`. */
export const VAULT_SORTS = ['newest', 'oldest', 'name'] as const;
export type VaultSort = (typeof VAULT_SORTS)[number];

export const VAULT_LAYOUTS = ['list', 'grid'] as const;
export type VaultLayout = (typeof VAULT_LAYOUTS)[number];

/** How far back "Recent" reaches. */
export const RECENT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a document's thumbnail comes from: a bundled image (development sample documents), or
 * the document's first page in the encrypted vault, which the screen asks the route to decrypt
 * only while the row is on screen.
 */
export type VaultThumbnail =
  | { readonly kind: 'asset'; readonly source: ImageSourcePropType }
  | { readonly kind: 'vault' }
  | { readonly kind: 'none' };

export type VaultItem = {
  readonly id: string;
  /** What the citizen calls the document, e.g. "10th Marksheet". */
  readonly title: string;
  /** Null until the document has been placed in a vault category. */
  readonly category: VaultCategoryKey | null;
  /** A second, grey tag: the document type ("Aadhaar") or where it came from ("Scanned"). */
  readonly tag: string | null;
  /** The citizen's own tags from Save Document. Search matches them; the card does not show them. */
  readonly tags?: readonly string[];
  /**
   * What the phone read off the document (`lib/ocr`) and the details it found, for search.
   * Held in memory only, while the Vault tab is open.
   */
  readonly searchText?: string;
  /** An everyday paper (a bill, a PUC): listed under "Everyday". */
  readonly everyday?: boolean;
  readonly createdAt: Date;
  readonly pageCount: number;
  readonly mimeType: PageMimeType;
  /** Null when the size is not known. */
  readonly sizeBytes: number | null;
  readonly starred: boolean;
  readonly thumbnail: VaultThumbnail;
  /** Backed up, but the copy cyber cafes use failed on the server (`centreCopyFailed`). */
  readonly centreCopyFailed?: boolean;
};

export type VaultQuery = {
  readonly filter: VaultFilter;
  /** Narrows the list to one category after a folder tile is tapped. */
  readonly category: VaultCategoryKey | null;
  readonly search: string;
  readonly sort: VaultSort;
  readonly now: Date;
};

export function isRecent(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < RECENT_DAYS * DAY_MS;
}

function matchesSearch(item: VaultItem, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  return (
    [item.title, item.tag ?? '', ...(item.tags ?? [])].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    ) || matchedInText(item, search)
  );
}

/**
 * Whether a search found this document by what is printed on it (a roll number, a name), not
 * by its name or tags. A number matches however it is spaced.
 */
export function matchedInText(item: VaultItem, search: string): boolean {
  if (search.trim().length === 0 || !item.searchText) return false;
  return textMatches(item.searchText, search);
}

function compare(sort: VaultSort): (a: VaultItem, b: VaultItem) => number {
  switch (sort) {
    case 'newest':
      return (a, b) => b.createdAt.getTime() - a.createdAt.getTime();
    case 'oldest':
      return (a, b) => a.createdAt.getTime() - b.createdAt.getTime();
    case 'name':
      return (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  }
}

/** The documents the list shows for a query, in order. "Folders" shows the tiles, not a list. */
export function visibleItems(items: readonly VaultItem[], query: VaultQuery): VaultItem[] {
  if (query.filter === 'folders' && query.category === null) return [];

  return items
    .filter((item) => {
      if (query.category !== null && item.category !== query.category) return false;
      if (query.filter === 'starred' && !item.starred) return false;
      if (query.filter === 'everyday' && item.everyday !== true) return false;
      if (query.filter === 'recent' && !isRecent(item.createdAt, query.now)) return false;
      return matchesSearch(item, query.search);
    })
    .sort(compare(query.sort));
}

/** Documents per category, for the folder tiles. Uncategorised documents count nowhere. */
export function categoryCounts(items: readonly VaultItem[]): Record<VaultCategoryKey, number> {
  const counts = Object.fromEntries(VAULT_CATEGORIES.map((category) => [category, 0])) as Record<
    VaultCategoryKey,
    number
  >;
  for (const item of items) {
    if (item.category !== null) counts[item.category] += 1;
  }
  return counts;
}

/** Why the list is empty, as a translation key. */
export function emptyListMessage(itemCount: number, query: VaultQuery): Message {
  if (itemCount === 0) return { key: 'vault.empty.vault' };
  if (query.search.trim().length > 0) {
    return { key: 'vault.empty.search', values: { search: query.search.trim() } };
  }
  if (query.filter === 'starred') return { key: 'vault.empty.starred' };
  if (query.filter === 'everyday') return { key: 'vault.empty.everyday' };
  if (query.filter === 'recent')
    return { key: 'vault.empty.recent', values: { days: RECENT_DAYS } };
  return { key: 'vault.empty.category' };
}

const KB = 1024;
const MB = KB * 1024;

/** "0.3 MB", "2.4 MB", or "48 KB" below a tenth of a megabyte. */
export function formatFileSize(bytes: number): string {
  if (bytes < MB / 10) return `${Math.max(1, Math.round(bytes / KB))} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

const FORMAT_LABELS: Record<PageMimeType, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'image/webp': 'WEBP',
};

/** "JPG" for a one-page document; "3 pages" for a booklet. */
export function formatMessage(item: Pick<VaultItem, 'mimeType' | 'pageCount'>): Message {
  if (item.pageCount > 1) return { key: 'vault.meta.pages', values: { count: item.pageCount } };
  return { key: 'vault.meta.format', values: { format: FORMAT_LABELS[item.mimeType] } };
}

/** "12 Sep 2026" in the phone's time zone, with the month in the citizen's language. */
export function formatVaultDate(date: Date, t: Translate): string {
  const month = MONTH_KEYS[date.getMonth()] ?? MONTH_KEYS[0];
  return t('vault.meta.date', {
    day: String(date.getDate()).padStart(2, '0'),
    month: t(`profileSetup.months.${month}`),
    year: date.getFullYear(),
  });
}

/** The line under a document's title: format or page count, size when known, and date. */
export function metaLine(item: VaultItem, t: Translate): string {
  const format = formatMessage(item);
  return [
    t(format.key, format.values),
    item.sizeBytes === null ? null : formatFileSize(item.sizeBytes),
    formatVaultDate(item.createdAt, t),
  ]
    .filter((part): part is string => part !== null)
    .join('  •  ');
}
