/**
 * Connect tab view model, plus the pure helpers its screen needs: the action cards, the "What
 * can CSC help with?" tiles, and how a nearby centre's distance and services are shown.
 *
 * Nothing here reads the phone's location or talks to a server. Finding centres near the
 * citizen needs both, and is a privacy decision still to be made; until then a production build
 * has no centres to show (`NO_NEARBY_CENTRES`), and only development builds show the mockup's
 * sample centre.
 */

import type { ImageSourcePropType } from 'react-native';

import type { Message } from '../home/dashboard';

/** The four cards under the hero, in display order. Each has copy at `connect.actions.<key>`. */
export const CONNECT_ACTIONS = [
  'find_nearby',
  'share_document',
  'connections',
  'request_help',
] as const;
export type ConnectAction = (typeof CONNECT_ACTIONS)[number];

/** The "What can CSC help with?" tiles, in display order. Copy at `connect.services.<key>`. */
export const CSC_HELP_TOPICS = [
  'form_filling',
  'document_upload',
  'identity_services',
  'scholarship',
  'pension_welfare',
  'other_government',
] as const;
export type CscHelpTopic = (typeof CSC_HELP_TOPICS)[number];

/** Services a centre lists on its card. Each has a label at `connect.offerings.<key>`. */
export const CSC_OFFERINGS = [
  'aadhaar',
  'pan',
  'voter_id',
  'ration_card',
  'pension',
  'scholarship',
  'certificates',
  'bill_payment',
  'form_filling',
  'document_upload',
  'caste_certificate',
] as const;
export type CscOffering = (typeof CSC_OFFERINGS)[number];

/** How many service chips fit on a centre card before the rest collapse into "+5". */
export const MAX_OFFERING_CHIPS = 3;

/** A point on the map, in decimal degrees. */
export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

export type NearbyCentre = {
  readonly id: string;
  /** The centre's own name, as it would come from a directory. Not translated. */
  readonly name: string;
  /** The line under the name, e.g. "Near Bus Stand, Arrah, Bhojpur". */
  readonly address: string;
  /** District and state, which search matches but the card does not show. */
  readonly region: string;
  /** Distance from the searched area, as the directory reports it. */
  readonly distanceMeters: number;
  readonly coordinates: Coordinates;
  readonly openNow: boolean;
  readonly offerings: readonly CscOffering[];
  /** Photos of the centre, the cover first. Empty shows the placeholder well. */
  readonly photos: readonly ImageSourcePropType[];
  /** Regular opening hours, or null when the directory does not list them. */
  readonly hours: OpeningHours | null;
  /** The centre's public phone number as listed, e.g. "+91 98765 43210". Null when unlisted. */
  readonly phone: string | null;
  /** True when the directory lists the centre as a government-authorised CSC. */
  readonly verified: boolean;
};

/** Days of the week, Monday first. Each has a short label at `connect.centre.weekdays.<day>`. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "Mon – Sat, 9:00 AM – 6:00 PM". Times are 24-hour "HH:MM" in the centre's local time. */
export type OpeningHours = {
  readonly firstDay: Weekday;
  readonly lastDay: Weekday;
  readonly opens: string;
  readonly closes: string;
};

/** The place centres were searched around: what the search field shows, and the map's middle. */
export type SearchArea = {
  readonly label: string;
  readonly origin: Coordinates;
};

export type NearbyCentres =
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ready';
      readonly area: SearchArea;
      readonly centres: readonly NearbyCentre[];
    };

/** What a production build shows until centre search exists. */
export const NO_NEARBY_CENTRES: NearbyCentres = { status: 'unavailable' };

/**
 * "850 m away" under a kilometre (to the nearest 10 m), then "1.2 km away", then "12 km away".
 * The short form drops "away" ("1.2 km"), for the map's label and a card's status line.
 */
export function distanceMessage(distanceMeters: number, form: 'away' | 'short' = 'away'): Message {
  const suffix = form === 'short' ? 'Short' : '';
  const meters = Math.max(0, distanceMeters);
  const roundedMeters = Math.round(meters / 10) * 10;
  // 995 m rounds up to a kilometre, so it reads "1 km", never "1000 m".
  if (roundedMeters < 1000) {
    return { key: `connect.nearby.distanceMeters${suffix}`, values: { distance: roundedMeters } };
  }
  const km = meters / 1000;
  const distance = km < 10 ? km.toFixed(1).replace(/\.0$/, '') : String(Math.round(km));
  return { key: `connect.nearby.distanceKm${suffix}`, values: { distance } };
}

/** The chips a centre card shows, and how many services the "+N" chip stands for. */
export function offeringChips(
  offerings: readonly CscOffering[],
  max: number = MAX_OFFERING_CHIPS,
): { readonly shown: readonly CscOffering[]; readonly more: number } {
  const unique = offerings.filter((offering, index) => offerings.indexOf(offering) === index);
  const limit = Math.max(0, max);
  return { shown: unique.slice(0, limit), more: Math.max(0, unique.length - limit) };
}

/** The carousel page a horizontal scroll offset lands on, clamped to the pages that exist. */
export function pageAt(offsetX: number, pageWidth: number, pageCount: number): number {
  if (pageCount <= 0 || pageWidth <= 0) return 0;
  return Math.min(pageCount - 1, Math.max(0, Math.round(offsetX / pageWidth)));
}
