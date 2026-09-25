/**
 * The Connect tab's pure helpers: how far away a centre reads, which service chips its card
 * shows, and which carousel page a scroll lands on. Sample values only — no real centres.
 */

import { describe, expect, it } from 'vitest';

import {
  CSC_OFFERINGS,
  distanceMessage,
  MAX_OFFERING_CHIPS,
  NO_NEARBY_CENTRES,
  offeringChips,
  pageAt,
} from '../lib/connect/connect-screen';
import { createTranslator } from '../lib/i18n';

describe('distanceMessage', () => {
  const t = createTranslator('en');
  const read = (meters: number) => {
    const message = distanceMessage(meters);
    return t(message.key, message.values);
  };

  it('reads metres to the nearest 10 below a kilometre', () => {
    expect(read(0)).toBe('0 m away');
    expect(read(847)).toBe('850 m away');
    expect(read(994)).toBe('990 m away');
  });

  it('reads one decimal of a kilometre below 10 km, dropping ".0"', () => {
    expect(read(996)).toBe('1 km away');
    expect(read(1000)).toBe('1 km away');
    expect(read(1200)).toBe('1.2 km away');
    expect(read(9940)).toBe('9.9 km away');
  });

  it('reads whole kilometres from 10 km', () => {
    expect(read(12_400)).toBe('12 km away');
  });

  it('never reads a negative distance', () => {
    expect(read(-50)).toBe('0 m away');
  });

  it('drops "away" in the short form', () => {
    const short = (meters: number) => {
      const message = distanceMessage(meters, 'short');
      return t(message.key, message.values);
    };
    expect(short(1200)).toBe('1.2 km');
    expect(short(640)).toBe('640 m');
  });
});

describe('offeringChips', () => {
  it(`shows ${MAX_OFFERING_CHIPS} services and counts the rest`, () => {
    expect(offeringChips(CSC_OFFERINGS)).toEqual({
      shown: ['aadhaar', 'pan', 'voter_id'],
      more: CSC_OFFERINGS.length - MAX_OFFERING_CHIPS,
    });
  });

  it('shows every service when they fit', () => {
    expect(offeringChips(['pan', 'aadhaar'])).toEqual({ shown: ['pan', 'aadhaar'], more: 0 });
    expect(offeringChips([])).toEqual({ shown: [], more: 0 });
  });

  it('counts a service listed twice once', () => {
    expect(offeringChips(['pan', 'pan', 'aadhaar', 'pan'])).toEqual({
      shown: ['pan', 'aadhaar'],
      more: 0,
    });
  });

  it('treats a negative limit as none', () => {
    expect(offeringChips(['pan', 'aadhaar'], -1)).toEqual({ shown: [], more: 2 });
  });
});

describe('pageAt', () => {
  it('rounds to the nearest page and clamps to the pages that exist', () => {
    expect(pageAt(0, 320, 3)).toBe(0);
    expect(pageAt(170, 320, 3)).toBe(1);
    expect(pageAt(640, 320, 3)).toBe(2);
    expect(pageAt(2000, 320, 3)).toBe(2);
    expect(pageAt(-40, 320, 3)).toBe(0);
  });

  it('is the first page when there is nothing to page through', () => {
    expect(pageAt(500, 320, 0)).toBe(0);
    expect(pageAt(500, 0, 3)).toBe(0);
  });
});

describe('NO_NEARBY_CENTRES', () => {
  it('lists no centres', () => {
    expect(NO_NEARBY_CENTRES).toEqual({ status: 'unavailable' });
  });
});
