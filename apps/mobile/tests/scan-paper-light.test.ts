/**
 * The paper-lighting estimate behind the scanner's cleaned-up looks: it must follow the room's
 * light across the page and ignore everything printed on it, however large.
 */

import { describe, expect, it } from 'vitest';

import { estimatePaperLight, type GrayImage, maxPool } from '../lib/scan/paper-light';

function image(width: number, height: number, value: (x: number, y: number) => number): GrayImage {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels[y * width + x] = Math.round(value(x, y));
  }
  return { width, height, pixels };
}

const at = (img: GrayImage, x: number, y: number) => img.pixels[y * img.width + x] as number;

describe('maxPool', () => {
  it('keeps the brightest pixel of each block, so paper between text survives', () => {
    const text = image(8, 4, (x) => (x % 2 === 0 ? 20 : 200));
    const pooled = maxPool(text, 2);
    expect(pooled.width).toBe(4);
    expect(pooled.height).toBe(2);
    expect(Array.from(pooled.pixels)).toEqual(new Array(8).fill(200));
  });
});

describe('estimatePaperLight', () => {
  it('follows light falling off across the page', () => {
    const page = image(120, 160, (x) => 230 - x * 0.8);
    const light = estimatePaperLight(page);
    expect(Math.abs(at(light, 10, 80) - at(page, 10, 80))).toBeLessThanOrEqual(3);
    expect(Math.abs(at(light, 110, 80) - at(page, 110, 80))).toBeLessThanOrEqual(3);
  });

  it('sees through a wide black banner instead of taking it for shadow', () => {
    const banner = (y: number) => y >= 40 && y < 60;
    const page = image(120, 160, (x, y) => (banner(y) && x > 10 && x < 110 ? 30 : 220));
    const light = estimatePaperLight(page);
    expect(at(light, 60, 50)).toBeGreaterThan(205);
  });

  it('sees through a large passport photo', () => {
    const photo = (x: number, y: number) => x >= 60 && x < 100 && y >= 70 && y < 120;
    const page = image(120, 160, (x, y) => (photo(x, y) ? 90 : 220));
    const light = estimatePaperLight(page);
    expect(at(light, 80, 95)).toBeGreaterThan(205);
  });

  it('follows a soft shadow across the paper, so it evens out', () => {
    const shadow = (x: number) => Math.min(1, Math.max(0, (x - 50) / 20));
    const page = image(120, 160, (x) => 220 * (1 - 0.3 * shadow(x)));
    const light = estimatePaperLight(page);
    expect(Math.abs(at(light, 100, 80) - at(page, 100, 80))).toBeLessThanOrEqual(4);
    expect(Math.abs(at(light, 20, 80) - at(page, 20, 80))).toBeLessThanOrEqual(4);
  });

  it('returns the same size as its input', () => {
    const light = estimatePaperLight(image(37, 53, () => 200));
    expect(light.width).toBe(37);
    expect(light.height).toBe(53);
  });
});
