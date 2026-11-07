/**
 * The photo quality check, calibrated on synthetic pages at the scale the app measures at (an
 * 800px-wide copy of the photo): rows of printed-looking strokes on paper with sensor noise,
 * blurred by a known amount. No real document is used.
 */

import { describe, expect, it } from 'vitest';

import { assessPhotoQuality, DEFAULT_QUALITY, edgeSteepness } from '../lib/scan/photo-quality';
import type { GrayImage } from '../lib/scan/paper-light';

const WIDTH = 800;
const HEIGHT = 560;

/** A repeatable pseudo-random sequence, so every run sees the same page. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Paper with rows of dark glyph-like strokes, 2–4px wide, inside a margin. */
function printedPage(paper = 208, ink = 40, seed = 7): Float64Array {
  const next = random(seed);
  const page = new Float64Array(WIDTH * HEIGHT).fill(paper);
  const ink3 = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) page[y * WIDTH + x] = ink;
  };
  for (let top = 50; top < HEIGHT - 60; top += 26) {
    let x = 60;
    while (x < WIDTH - 80) {
      const glyph = 6 + Math.floor(next() * 8);
      const stroke = 2 + Math.floor(next() * 3);
      // A glyph: two uprights and a bar, like a printed letter.
      for (let y = top; y < top + 14; y += 1) {
        for (let s = 0; s < stroke; s += 1) {
          ink3(x + s, y);
          ink3(x + glyph - s, y);
        }
      }
      for (let gx = x; gx <= x + glyph; gx += 1) {
        for (let s = 0; s < stroke; s += 1) ink3(gx, top + 6 + s);
      }
      x += glyph + 4 + (next() < 0.18 ? 10 : 0);
    }
  }
  return page;
}

function gaussianBlur(source: Float64Array, sigma: number): Float64Array {
  if (sigma <= 0) return source;
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)),
  );
  const sum = kernel.reduce((a, b) => a + b, 0);
  const k = kernel.map((v) => v / sum);
  return separable(source, k);
}

function separable(source: Float64Array, k: readonly number[]): Float64Array {
  const radius = (k.length - 1) / 2;
  const across = new Float64Array(source.length);
  const out = new Float64Array(source.length);
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let acc = 0;
      for (let i = 0; i < k.length; i += 1) {
        acc += (k[i] as number) * (source[y * WIDTH + clamp(x + i - radius, WIDTH - 1)] as number);
      }
      across[y * WIDTH + x] = acc;
    }
  }
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let acc = 0;
      for (let i = 0; i < k.length; i += 1) {
        acc += (k[i] as number) * (across[clamp(y + i - radius, HEIGHT - 1) * WIDTH + x] as number);
      }
      out[y * WIDTH + x] = acc;
    }
  }
  return out;
}

/** A sideways smear of `length` pixels: the phone moved while the shutter was open. */
function motionBlur(source: Float64Array, length: number): Float64Array {
  const out = new Float64Array(source.length);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let acc = 0;
      for (let i = 0; i < length; i += 1) {
        acc += source[
          y * WIDTH + Math.min(WIDTH - 1, Math.max(0, x + i - (length >> 1)))
        ] as number;
      }
      out[y * WIDTH + x] = acc / length;
    }
  }
  return out;
}

/** Quantised to 8 bits with sensor noise added after the blur, as a camera would. */
function toImage(values: Float64Array, noise = 2, scale = 1, seed = 11): GrayImage {
  const next = random(seed);
  const pixels = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const n = (next() + next() + next() - 1.5) * 2 * noise;
    pixels[i] = Math.round(Math.min(255, Math.max(0, (values[i] as number) * scale + n)));
  }
  return { width: WIDTH, height: HEIGHT, pixels };
}

const PAGE = printedPage();
const steepness = (image: GrayImage) => edgeSteepness(image);

describe('edgeSteepness', () => {
  it('falls steadily as the page goes out of focus', () => {
    const values = [0, 0.8, 1.2, 2.2, 3].map((sigma) =>
      steepness(toImage(gaussianBlur(PAGE, sigma))),
    );
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] as number).toBeLessThan(values[i - 1] as number);
    }
  });

  it('falls as a smear gets longer', () => {
    const values = [3, 9, 15].map((length) => steepness(toImage(motionBlur(PAGE, length))));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] as number).toBeLessThan(values[i - 1] as number);
    }
  });

  it('stays within 0–1', () => {
    for (const sigma of [0, 3]) {
      const value = steepness(toImage(gaussianBlur(PAGE, sigma)));
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('assessPhotoQuality: blur', () => {
  it.each([0, 0.8, 1.2])('passes a readable page (σ %s)', (sigma) => {
    const quality = assessPhotoQuality(toImage(gaussianBlur(PAGE, sigma)));
    expect(quality.sharpnessJudged).toBe(true);
    expect(quality.issues).not.toContain('blurry');
  });

  it.each([2.2, 3])('flags an out-of-focus page (σ %s)', (sigma) => {
    expect(assessPhotoQuality(toImage(gaussianBlur(PAGE, sigma))).issues).toContain('blurry');
  });

  it('passes a slight shake', () => {
    expect(assessPhotoQuality(toImage(motionBlur(PAGE, 3))).issues).not.toContain('blurry');
  });

  it.each([9, 15])('flags a page smeared %spx by a moving phone', (length) => {
    expect(assessPhotoQuality(toImage(motionBlur(PAGE, length))).issues).toContain('blurry');
  });

  it('never calls blank paper blurry: there is nothing to judge', () => {
    const blank = new Float64Array(WIDTH * HEIGHT).fill(205);
    for (const sigma of [0, 3]) {
      const quality = assessPhotoQuality(toImage(gaussianBlur(blank, sigma)));
      expect(quality.sharpnessJudged).toBe(false);
      expect(quality.issues).toEqual([]);
    }
  });

  it('does not mistake a ruled form, with no upright edges, for a blurred one', () => {
    const form = new Float64Array(WIDTH * HEIGHT).fill(210);
    for (let top = 40; top < HEIGHT - 20; top += 30) {
      for (let y = top; y < top + 2; y += 1) {
        for (let x = 30; x < WIDTH - 30; x += 1) form[y * WIDTH + x] = 50;
      }
    }
    expect(assessPhotoQuality(toImage(form)).issues).toEqual([]);
  });

  it('only looks inside the region', () => {
    // Sharp text on the left half, heavily blurred on the right.
    const sharp = toImage(PAGE);
    const blurred = toImage(gaussianBlur(PAGE, 3));
    const pixels = new Uint8Array(sharp.pixels);
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = WIDTH / 2; x < WIDTH; x += 1) {
        pixels[y * WIDTH + x] = blurred.pixels[y * WIDTH + x] as number;
      }
    }
    const mixed = { width: WIDTH, height: HEIGHT, pixels };
    const left = { x: 40, y: 40, width: WIDTH / 2 - 60, height: HEIGHT - 80 };
    const right = { x: WIDTH / 2 + 20, y: 40, width: WIDTH / 2 - 60, height: HEIGHT - 80 };
    expect(assessPhotoQuality(mixed, left).issues).not.toContain('blurry');
    expect(assessPhotoQuality(mixed, right).issues).toContain('blurry');
  });
});

describe('assessPhotoQuality: light', () => {
  it('flags a page too dark to recover', () => {
    const quality = assessPhotoQuality(toImage(PAGE, 2, 45 / 208));
    expect(quality.paperLevel).toBeLessThan(DEFAULT_QUALITY.darkPaper);
    expect(quality.issues).toContain('dark');
  });

  it('accepts a dim but usable page', () => {
    const quality = assessPhotoQuality(toImage(PAGE, 2, 110 / 208));
    expect(quality.issues).not.toContain('dark');
    expect(quality.issues).not.toContain('blurry');
  });

  it('flags a hotspot of glare on a laminated card', () => {
    const page = printedPage(190);
    // About 6% of the page, clipped to white.
    for (let y = 200; y < 300; y += 1) {
      for (let x = 300; x < 570; x += 1) page[y * WIDTH + x] = 255;
    }
    const quality = assessPhotoQuality(toImage(page, 0));
    expect(quality.glare).toBeGreaterThan(0.05);
    expect(quality.issues).toContain('glare');
  });

  it('does not call evenly bright paper glare', () => {
    const quality = assessPhotoQuality(toImage(printedPage(252), 1));
    expect(quality.issues).not.toContain('glare');
  });

  it('passes a good page with no issues at all', () => {
    expect(assessPhotoQuality(toImage(PAGE)).issues).toEqual([]);
  });

  it('copes with an empty region', () => {
    const quality = assessPhotoQuality(toImage(PAGE), { x: 10, y: 10, width: 0, height: 0 });
    expect(quality.issues).toEqual([]);
  });
});
