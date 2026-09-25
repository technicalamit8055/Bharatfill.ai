/**
 * Nearby CSC Centers' pure helpers: which centres the distance chips, Open Now, the service
 * filter and search leave on screen, how route params are read, and where pins land on the map.
 * Sample centres only — no real directory data.
 */

import { describe, expect, it } from 'vitest';

import type { Coordinates, NearbyCentre } from '../lib/connect/connect-screen';
import {
  DEFAULT_NEARBY_FILTERS,
  filterCentres,
  matchesSearch,
  type NearbyFilters,
  offsetCoordinates,
  parseNearbyParams,
  projectToMap,
  sheetFilterCount,
  toggleRadius,
} from '../lib/connect/nearby-search';

const ORIGIN: Coordinates = { latitude: 25.5, longitude: 84.6 };

function centre(overrides: Partial<NearbyCentre> & Pick<NearbyCentre, 'id'>): NearbyCentre {
  return {
    name: `Sample Centre ${overrides.id}`,
    address: 'Main Road, Sampletown',
    region: 'Sample District, Sample State',
    distanceMeters: 1000,
    coordinates: ORIGIN,
    openNow: true,
    offerings: [],
    photos: [],
    hours: null,
    phone: null,
    verified: false,
    ...overrides,
  };
}

const NEAR = centre({ id: 'near', distanceMeters: 1200, offerings: ['aadhaar', 'pan'] });
const CLOSED = centre({
  id: 'closed',
  name: 'Station Road Centre',
  address: 'Station Road, Sampletown',
  distanceMeters: 3600,
  openNow: false,
  offerings: ['pension'],
});
const MID = centre({ id: 'mid', distanceMeters: 7400, offerings: ['pan'] });
const FAR = centre({ id: 'far', address: 'Hill Road, Otherville', distanceMeters: 12_000 });
const CENTRES = [FAR, MID, CLOSED, NEAR];

const ANY: NearbyFilters = { radiusKm: null, openNow: false, offering: null, search: '' };
const ids = (centres: readonly NearbyCentre[]) => centres.map((each) => each.id);

describe('filterCentres', () => {
  it('lists every centre nearest first with nothing narrowed', () => {
    expect(ids(filterCentres(CENTRES, ANY))).toEqual(['near', 'closed', 'mid', 'far']);
  });

  it('opens on the 5 km chip', () => {
    expect(ids(filterCentres(CENTRES, DEFAULT_NEARBY_FILTERS))).toEqual(['near', 'closed']);
  });

  it('keeps centres within the picked distance, the edge included', () => {
    expect(ids(filterCentres(CENTRES, { ...ANY, radiusKm: 10 }))).toEqual([
      'near',
      'closed',
      'mid',
    ]);
    expect(
      ids(filterCentres([centre({ id: 'edge', distanceMeters: 5000 })], { ...ANY, radiusKm: 5 })),
    ).toEqual(['edge']);
  });

  it('leaves closed centres out under Open Now', () => {
    expect(ids(filterCentres(CENTRES, { ...ANY, openNow: true }))).toEqual(['near', 'mid', 'far']);
  });

  it('keeps only centres offering the picked service', () => {
    expect(ids(filterCentres(CENTRES, { ...ANY, offering: 'pan' }))).toEqual(['near', 'mid']);
  });

  it('combines every filter', () => {
    expect(
      ids(
        filterCentres(CENTRES, { radiusKm: 10, openNow: true, offering: 'pan', search: 'sample' }),
      ),
    ).toEqual(['near', 'mid']);
  });

  it('does not reorder the list it was given', () => {
    const given = [...CENTRES];
    filterCentres(given, ANY);
    expect(given).toEqual(CENTRES);
  });
});

describe('matchesSearch', () => {
  it('needs every word, in any order, ignoring case and commas', () => {
    expect(matchesSearch(CLOSED, 'station, sampletown')).toBe(true);
    expect(matchesSearch(CLOSED, 'SAMPLETOWN station')).toBe(true);
    expect(matchesSearch(CLOSED, 'station otherville')).toBe(false);
  });

  it('matches the region the card does not show', () => {
    expect(matchesSearch(NEAR, 'Sampletown, Sample District, Sample State')).toBe(true);
  });

  it('matches everything when the search is blank', () => {
    expect(matchesSearch(FAR, '  , ')).toBe(true);
  });
});

describe('chips', () => {
  it('clears the picked distance when it is tapped again', () => {
    expect(toggleRadius(5, 5)).toBeNull();
    expect(toggleRadius(5, 10)).toBe(10);
    expect(toggleRadius(null, 5)).toBe(5);
  });

  it('counts only the service behind the Filters chip', () => {
    expect(sheetFilterCount({ ...ANY, openNow: true, radiusKm: 5 })).toBe(0);
    expect(sheetFilterCount({ ...ANY, offering: 'pan' })).toBe(1);
  });
});

describe('parseNearbyParams', () => {
  it('reads the view and the centre to highlight', () => {
    expect(parseNearbyParams({ view: 'map', centre: 'demo-1' })).toEqual({
      view: 'map',
      centreId: 'demo-1',
    });
  });

  it('takes the first of repeated params', () => {
    expect(parseNearbyParams({ view: ['map', 'list'], centre: ['a', 'b'] })).toEqual({
      view: 'map',
      centreId: 'a',
    });
  });

  it('falls back to the list for anything unexpected', () => {
    expect(parseNearbyParams({})).toEqual({ view: 'list', centreId: null });
    expect(parseNearbyParams(undefined)).toEqual({ view: 'list', centreId: null });
    expect(parseNearbyParams({ view: 'satellite', centre: '' })).toEqual({
      view: 'list',
      centreId: null,
    });
    expect(parseNearbyParams({ centre: 'x'.repeat(500) })).toEqual({
      view: 'list',
      centreId: null,
    });
  });
});

describe('offsetCoordinates', () => {
  it('moves north and east by about the distance asked for', () => {
    const north = offsetCoordinates(ORIGIN, 1112, 0);
    expect(north.latitude - ORIGIN.latitude).toBeCloseTo(0.01, 3);
    expect(north.longitude).toBeCloseTo(ORIGIN.longitude, 6);

    const east = offsetCoordinates(ORIGIN, 1000, 90);
    expect(east.longitude).toBeGreaterThan(ORIGIN.longitude);
    expect(east.latitude).toBeCloseTo(ORIGIN.latitude, 4);
  });
});

describe('projectToMap', () => {
  const BOX = { width: 300, height: 200, padding: 20 };

  it('puts the origin in the middle, north up and east right', () => {
    const [middle, north, east] = projectToMap(
      ORIGIN,
      [ORIGIN, offsetCoordinates(ORIGIN, 1000, 0), offsetCoordinates(ORIGIN, 1000, 90)],
      BOX,
    );
    expect(middle).toEqual({ x: 150, y: 100 });
    expect(north?.y).toBeLessThan(100);
    expect(north?.x).toBeCloseTo(150, 3);
    expect(east?.x).toBeGreaterThan(150);
    // A great-circle bearing of 90° drifts a hair south of the parallel; well under a pixel.
    expect(east?.y).toBeCloseTo(100, 1);
  });

  it('scales so the farthest point just fits inside the padding', () => {
    const points = projectToMap(
      ORIGIN,
      [offsetCoordinates(ORIGIN, 4000, 0), offsetCoordinates(ORIGIN, 2000, 270)],
      BOX,
    );
    // North is the tighter axis: 4 km has to fit into 100 − 20 px.
    expect(points[0]?.y).toBeCloseTo(BOX.padding, 1);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.padding - 0.001);
      expect(point.x).toBeLessThanOrEqual(BOX.width - BOX.padding + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(BOX.padding - 0.001);
      expect(point.y).toBeLessThanOrEqual(BOX.height - BOX.padding + 0.001);
    }
  });

  it('keeps a lone point at the origin in the middle', () => {
    expect(projectToMap(ORIGIN, [ORIGIN], BOX)).toEqual([{ x: 150, y: 100 }]);
    expect(projectToMap(ORIGIN, [], BOX)).toEqual([]);
  });
});
