/**
 * Centre details' pure helpers: opening hours, the full address, the Available Services list,
 * what Share sends, and how the route's params are read. Sample centres only.
 */

import { describe, expect, it } from 'vitest';

import {
  DETAIL_SERVICES_PREVIEW,
  detailServices,
  formatTime,
  fullAddress,
  hoursLines,
  parseCentreParams,
  shareMessage,
} from '../lib/connect/centre-details';
import { CSC_OFFERINGS, type NearbyCentre } from '../lib/connect/connect-screen';
import { createTranslator } from '../lib/i18n';

const t = createTranslator('en');

const CENTRE: NearbyCentre = {
  id: 'sample',
  name: 'Sample CSC Centre',
  address: 'Main Road, Sampletown, Sample District',
  region: 'Sample District, Sample State',
  distanceMeters: 1200,
  coordinates: { latitude: 25.5, longitude: 84.6 },
  openNow: true,
  offerings: ['form_filling', 'aadhaar'],
  photos: [],
  hours: { firstDay: 'mon', lastDay: 'sat', opens: '09:00', closes: '18:00' },
  phone: '+91 00000 00000',
  verified: true,
};

describe('formatTime', () => {
  it('reads 24-hour times on a 12-hour clock', () => {
    expect(formatTime('09:00', t)).toBe('9:00 AM');
    expect(formatTime('18:30', t)).toBe('6:30 PM');
    expect(formatTime('12:00', t)).toBe('12:00 PM');
    expect(formatTime('00:15', t)).toBe('12:15 AM');
  });

  it('refuses malformed times', () => {
    expect(formatTime('9:00', t)).toBeNull();
    expect(formatTime('24:00', t)).toBeNull();
    expect(formatTime('10:60', t)).toBeNull();
    expect(formatTime('', t)).toBeNull();
  });
});

describe('hoursLines', () => {
  it('reads a day range and a time range', () => {
    expect(hoursLines(CENTRE.hours, t)).toEqual({ days: 'Mon - Sat', times: '9:00 AM - 6:00 PM' });
  });

  it('reads a single day once', () => {
    expect(
      hoursLines({ firstDay: 'sun', lastDay: 'sun', opens: '10:00', closes: '14:00' }, t)?.days,
    ).toBe('Sun');
  });

  it('shows nothing for missing or malformed hours', () => {
    expect(hoursLines(null, t)).toBeNull();
    expect(
      hoursLines({ firstDay: 'mon', lastDay: 'fri', opens: 'morning', closes: '18:00' }, t),
    ).toBeNull();
  });

  it('reads Hindi day names', () => {
    const hindi = hoursLines(CENTRE.hours, createTranslator('hi'));
    expect(hindi?.days).toMatch(/^\S+ - \S+$/);
    expect(hindi?.days).not.toContain('Mon');
  });
});

describe('fullAddress', () => {
  it('adds the parts of the region the address leaves out, once', () => {
    expect(fullAddress(CENTRE)).toBe('Main Road, Sampletown, Sample District, Sample State');
  });

  it('ignores case and stray spaces when comparing parts', () => {
    expect(fullAddress({ address: ' Main Road ,sampletown', region: 'SAMPLETOWN, State ' })).toBe(
      'Main Road, sampletown, State',
    );
  });
});

describe('detailServices', () => {
  it(`shows ${DETAIL_SERVICES_PREVIEW} services until expanded`, () => {
    expect(detailServices(CSC_OFFERINGS, false)).toEqual({
      shown: CSC_OFFERINGS.slice(0, DETAIL_SERVICES_PREVIEW),
      hidden: CSC_OFFERINGS.length - DETAIL_SERVICES_PREVIEW,
    });
    expect(detailServices(CSC_OFFERINGS, true)).toEqual({ shown: CSC_OFFERINGS, hidden: 0 });
  });

  it('counts a service listed twice once', () => {
    expect(detailServices(['pan', 'pan', 'aadhaar'], false)).toEqual({
      shown: ['pan', 'aadhaar'],
      hidden: 0,
    });
  });
});

describe('shareMessage', () => {
  it("sends the centre's public listing", () => {
    expect(shareMessage(CENTRE, t)).toBe(
      [
        'Sample CSC Centre',
        'Main Road, Sampletown, Sample District, Sample State',
        'Mon - Sat, 9:00 AM - 6:00 PM',
        '+91 00000 00000',
      ].join('\n'),
    );
  });

  it('leaves out what the centre does not list', () => {
    expect(shareMessage({ ...CENTRE, hours: null, phone: null }, t)).toBe(
      'Sample CSC Centre\nMain Road, Sampletown, Sample District, Sample State',
    );
  });
});

describe('parseCentreParams', () => {
  it('reads the centre id, taking the first of repeated params', () => {
    expect(parseCentreParams({ id: 'demo-csc-main' })).toBe('demo-csc-main');
    expect(parseCentreParams({ id: ['a', 'b'] })).toBe('a');
  });

  it('is null for a missing or malformed id', () => {
    expect(parseCentreParams({})).toBeNull();
    expect(parseCentreParams(undefined)).toBeNull();
    expect(parseCentreParams({ id: '' })).toBeNull();
    expect(parseCentreParams({ id: 'x'.repeat(101) })).toBeNull();
    expect(parseCentreParams({ id: 42 })).toBeNull();
  });
});
