/**
 * The per-page tone curve: fitting ink and paper levels from a histogram, the curve between
 * them, and the chroma curve that greys out colour noise.
 */

import { describe, expect, it } from 'vitest';

import { chromaCurve, DEFAULT_LEVELS, levelsCurve, pageLevels } from '../lib/scan/tone-curve';

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
