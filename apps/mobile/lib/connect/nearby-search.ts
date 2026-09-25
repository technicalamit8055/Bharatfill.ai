/**
 * Nearby CSC Centers view model: which centres the distance chips, Open Now, the service filter
 * and the search field leave on screen, and where each one sits on the map preview.
 *
 * Everything works on centres the route already has. Nothing here reads the phone's location,
 * geocodes what the citizen types, or fetches map tiles — search only matches the words of a
 * centre's name and address.
 */

import { z } from 'zod';

import type { Coordinates, CscOffering, NearbyCentre } from './connect-screen';

/** The distance chips, in kilometres, in display order. Copy at `connect.finder.within`. */
export const NEARBY_RADII_KM = [5, 10] as const;
export type NearbyRadiusKm = (typeof NEARBY_RADII_KM)[number];

export const NEARBY_VIEWS = ['list', 'map'] as const;
export type NearbyView = (typeof NEARBY_VIEWS)[number];

const firstParam = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const nearbyParamsSchema = z.object({
  view: z.preprocess(firstParam, z.enum(NEARBY_VIEWS).catch('list')).default('list'),
  centre: z.preprocess(firstParam, z.string().min(1).max(100).optional().catch(undefined)),
});

export type NearbyParams = {
  readonly view: NearbyView;
  /** The centre to highlight when the screen opens, if one was tapped to get here. */
  readonly centreId: string | null;
};

/** Reads Nearby CSC Centers' route params; anything unexpected falls back to the list. */
export function parseNearbyParams(params: unknown): NearbyParams {
  const parsed = nearbyParamsSchema.safeParse(params ?? {});
  if (!parsed.success) return { view: 'list', centreId: null };
  return { view: parsed.data.view, centreId: parsed.data.centre ?? null };
}

export type NearbyFilters = {
  /** Null shows centres at any distance. */
  readonly radiusKm: NearbyRadiusKm | null;
  readonly openNow: boolean;
  /** Null shows centres whatever they offer. */
  readonly offering: CscOffering | null;
  readonly search: string;
};

/** What the screen opens with: the nearest chip picked, nothing else narrowed. */
export const DEFAULT_NEARBY_FILTERS: NearbyFilters = {
  radiusKm: 5,
  openNow: false,
  offering: null,
  search: '',
};

/** Lower-cased words of a search, split on spaces and commas. */
function searchWords(search: string): string[] {
  return search
    .toLocaleLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 0);
}

/** True when every word of the search appears in the centre's name, address or region. */
export function matchesSearch(centre: NearbyCentre, search: string): boolean {
  const haystack = [centre.name, centre.address, centre.region].join(' ').toLocaleLowerCase();
  return searchWords(search).every((word) => haystack.includes(word));
}

/** The centres a set of filters leaves on screen, nearest first. */
export function filterCentres(
  centres: readonly NearbyCentre[],
  filters: NearbyFilters,
): NearbyCentre[] {
  return centres
    .filter((centre) => {
      if (filters.radiusKm !== null && centre.distanceMeters > filters.radiusKm * 1000) {
        return false;
      }
      if (filters.openNow && !centre.openNow) return false;
      if (filters.offering !== null && !centre.offerings.includes(filters.offering)) return false;
      return matchesSearch(centre, filters.search);
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * How many filters behind the Filters chip are on, for its badge. Distance and Open Now have
 * chips of their own, so only the service counts.
 */
export function sheetFilterCount(filters: NearbyFilters): number {
  return filters.offering !== null ? 1 : 0;
}

/** Tapping the picked distance chip again clears it; tapping another picks that one. */
export function toggleRadius(
  current: NearbyRadiusKm | null,
  tapped: NearbyRadiusKm,
): NearbyRadiusKm | null {
  return current === tapped ? null : tapped;
}

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** The point `distanceMeters` from `origin` along a compass bearing (0 = north, 90 = east). */
export function offsetCoordinates(
  origin: Coordinates,
  distanceMeters: number,
  bearingDegrees: number,
): Coordinates {
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.latitude);
  const lon1 = toRadians(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { latitude: toDegrees(lat2), longitude: toDegrees(lon2) };
}

/** Kilometres east and north of `origin`, flat-earth, which is close enough across a town. */
function kmFrom(origin: Coordinates, point: Coordinates): { east: number; north: number } {
  const kmPerDegree = (Math.PI * EARTH_RADIUS_METERS) / 180 / 1000;
  return {
    east: (point.longitude - origin.longitude) * kmPerDegree * Math.cos(toRadians(origin.latitude)),
    north: (point.latitude - origin.latitude) * kmPerDegree,
  };
}

export type MapBox = {
  readonly width: number;
  readonly height: number;
  /** Space kept clear at every edge so a pin is never cut off. */
  readonly padding: number;
};

export type MapPoint = { readonly x: number; readonly y: number };

/**
 * Where each point sits in a map box, in pixels from its top-left corner, with `origin` in the
 * middle. One scale for both axes, chosen so the farthest point just fits inside the padding;
 * north is up.
 */
export function projectToMap(
  origin: Coordinates,
  points: readonly Coordinates[],
  box: MapBox,
): MapPoint[] {
  const halfWidth = Math.max(0, box.width / 2 - box.padding);
  const halfHeight = Math.max(0, box.height / 2 - box.padding);
  const offsets = points.map((point) => kmFrom(origin, point));

  const maxEast = Math.max(0, ...offsets.map((offset) => Math.abs(offset.east)));
  const maxNorth = Math.max(0, ...offsets.map((offset) => Math.abs(offset.north)));
  const scale = Math.min(
    maxEast > 0 ? halfWidth / maxEast : Number.POSITIVE_INFINITY,
    maxNorth > 0 ? halfHeight / maxNorth : Number.POSITIVE_INFINITY,
  );
  const pxPerKm = Number.isFinite(scale) ? scale : 0;

  return offsets.map((offset) => ({
    x: box.width / 2 + offset.east * pxPerKm,
    y: box.height / 2 - offset.north * pxPerKm,
  }));
}
