/**
 * The per-page tone curve: fitting ink and paper levels from a histogram, the curve between
 * them, and the chroma curve that greys out colour noise.
 */

import { describe, expect, it } from 'vitest';

import {
  chromaCurve,
  contrastStretch,
  DEFAULT_LEVELS,
  levelsCurve,
  pageLevels,
  photoLevels,
} from '../lib/scan/tone-curve';

/** A histogram of a lighting-evened page: paper around `paper`, a little ink around `ink`. */
function pageHistogram(paper: number, paperSpread: number, ink: number, inkShare = 0.05): number[] {
  const bins = new Array<number>(256).fill(0);
  const total = 100_000;
  for (let v = 0; v < 256; v += 1) {
    const paperWeight = Math.exp(-((v - paper) ** 2) / (2 * paperSpread ** 2));
    const inkWeight = Math.exp(-((v - ink) ** 2) / (2 * 6 ** 2));
    bins[v] = Math.round(
      total * (((1 - inkShare) * paperWeight) / (paperSpread * 2.5) + (inkShare * inkWeight) / 15),
    );
  }
  return bins;
}

describe('pageLevels', () => {
  it('puts the white point just below the paper, clear of its grain', () => {
    const { white } = pageLevels(pageHistogram(220, 3, 30));
    expect(white).toBeLessThan(220 - 3 * 2);
    expect(white).toBeGreaterThan(200);
  });

  it('lowers the white point for grainier paper', () => {
    const smooth = pageLevels(pageHistogram(220, 2, 30)).white;
    const grainy = pageLevels(pageHistogram(220, 6, 30)).white;
    expect(grainy).toBeLessThan(smooth);
  });

  it('puts the black point at the darkest ink', () => {
    const { black } = pageLevels(pageHistogram(220, 3, 30));
    expect(black).toBeGreaterThan(10);
    expect(black).toBeLessThan(35);
  });

  it('never lifts the black point into the midtones on a page with almost no ink', () => {
    const levels = pageLevels(pageHistogram(220, 3, 150, 0.001));
    expect(levels.black).toBeLessThanOrEqual(0.45 * levels.white);
  });

  it('falls back to defaults for an empty histogram', () => {
    expect(pageLevels(new Array<number>(256).fill(0))).toEqual(DEFAULT_LEVELS);
  });
});

describe('levelsCurve', () => {
  const curve = levelsCurve({ black: 30, white: 210 });

  it('has one entry per 8-bit level', () => {
    expect(curve).toHaveLength(256);
  });

  it('turns paper pure white and ink pure black', () => {
    for (let i = 210; i < 256; i += 1) expect(curve[i]).toBe(255);
    for (let i = 0; i <= 30; i += 1) expect(curve[i]).toBe(0);
  });

  it('never reverses tones, so photos and stamps keep their shading', () => {
    for (let i = 1; i < 256; i += 1) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] as number);
    }
  });

  it('keeps midtones as midtones, a little deepened', () => {
    const middle = curve[120] as number;
    expect(middle).toBeGreaterThan(80);
    expect(middle).toBeLessThan(128);
  });
});

describe('chromaCurve', () => {
  const curve = chromaCurve(6, 1.2);

  it('snaps faint tints to neutral grey', () => {
    for (let i = 122; i <= 134; i += 1) expect(curve[i]).toBe(128);
  });

  it('keeps real colour on the same side of neutral, a little stronger', () => {
    expect(curve[168]).toBeGreaterThan(160);
    expect(curve[88]).toBeLessThan(96);
  });

  it('stays in range and never reverses', () => {
    for (let i = 1; i < 256; i += 1) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] as number);
    }
    expect(curve[0]).toBe(0);
    expect(curve[255]).toBe(255);
  });
});

/** A histogram with the given number of pixels at each listed level. */
function spikes(levels: Record<number, number>): Uint32Array {
  const histogram = new Uint32Array(256);
  for (const [level, count] of Object.entries(levels)) histogram[Number(level)] = count;
  return histogram;
}

describe('contrastStretch', () => {
  it('spreads a light page on a light desk over the whole range', () => {
    const table = contrastStretch(spikes({ 150: 4000, 190: 5000, 215: 1000 })) as Uint8Array;
    expect(table).not.toBeNull();
    expect(table[150]).toBe(0);
    expect(table[215]).toBe(255);
    // A 25-level step becomes about 100 levels.
    expect((table[215] as number) - (table[190] as number)).toBeGreaterThan(90);
  });

  it('never reverses an order of tones', () => {
    const table = contrastStretch(spikes({ 120: 10, 140: 50, 200: 40 })) as Uint8Array;
    for (let i = 1; i < 256; i += 1) {
      expect(table[i] as number).toBeGreaterThanOrEqual(table[i - 1] as number);
    }
  });

  it('ignores the brightest and darkest specks when choosing its range', () => {
    const table = contrastStretch(spikes({ 0: 5, 150: 5000, 200: 5000, 255: 5 })) as Uint8Array;
    expect(table[150]).toBe(0);
    expect(table[200]).toBe(255);
  });

  it('skips images with enough contrast already, and flat or empty ones', () => {
    expect(contrastStretch(spikes({ 30: 3000, 220: 7000 }))).toBeNull();
    expect(contrastStretch(spikes({ 180: 10000 }))).toBeNull();
    expect(contrastStretch(new Uint32Array(256))).toBeNull();
  });
});

describe('photoLevels', () => {
  it('stretches a dull print, but only so far', () => {
    const levels = photoLevels(spikes({ 80: 3000, 120: 4000, 160: 3000 }));
    const gain = 255 / (levels.white - levels.black);
    expect(gain).toBeLessThanOrEqual(1.35);
    expect(gain).toBeGreaterThan(1.3);
    expect(levels.black).toBeLessThanOrEqual(80);
    expect(levels.white).toBeGreaterThanOrEqual(160);
  });

  it("uses the photo's own ends when it already has range", () => {
    expect(photoLevels(spikes({ 10: 3000, 120: 4000, 240: 3000 }))).toEqual({
      black: 10,
      white: 240,
    });
  });

  it('stays inside 0–255', () => {
    for (const levels of [
      photoLevels(spikes({ 5: 1000, 20: 1000 })),
      photoLevels(spikes({ 240: 1000, 252: 1000 })),
    ]) {
      expect(levels.black).toBeGreaterThanOrEqual(0);
      expect(levels.white).toBeLessThanOrEqual(255);
      expect(levels.white).toBeGreaterThan(levels.black);
    }
  });

  it('leaves an empty histogram alone', () => {
    expect(photoLevels(new Uint32Array(256))).toEqual({ black: 0, white: 255 });
  });
});
