/**
 * The paper-lighting estimate behind the scanner's cleaned-up looks: it must follow the room's
 * light across the page and ignore everything printed on it, however large.
 */

import { describe, expect, it } from 'vitest';

import { estimatePaperLight, type GrayImage, maxPool, poolFactor } from '../lib/scan/paper-light';

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

describe('poolFactor', () => {
  it('folds a fine copy down to about the grid size', () => {
    expect(poolFactor(1536, 256)).toBe(6);
    expect(poolFactor(800, 256)).toBe(3);
    expect(poolFactor(512, 256)).toBe(2);
  });

  it('still pools a copy already at or under grid size, so text is lost', () => {
    expect(poolFactor(240, 256)).toBe(2);
    expect(poolFactor(0, 256)).toBe(2);
  });
});

describe('a faint line-art seal under a shadow', () => {
  // A 600 × 780 copy of a page: paper at 220, the right half in a soft shadow (70% light), and
  // on the lit half a faint seal of rings, 2px strokes at 75% of the paper with 4px of paper
  // between them, 100px across.
  const PAPER = 220;
  const SEAL = { x: 150, y: 390, radius: 50 };
  const shade = (x: number) => 1 - 0.3 * Math.min(1, Math.max(0, (x - 330) / 60));
  const page = image(600, 780, (x, y) => {
    const r = Math.hypot(x - SEAL.x, y - SEAL.y);
    const stroke = r < SEAL.radius && r % 6 < 2;
    return PAPER * shade(x) * (stroke ? 0.75 : 1);
  });
  const factor = 6;
  const cell = (v: number) => Math.floor(v / factor);

  it('is not taken for shadow when the paper between its lines is pooled', () => {
    const light = estimatePaperLight(maxPool(page, factor));
    // The estimate inside the seal is the paper's own light: dividing by it leaves the seal.
    expect(at(light, cell(SEAL.x), cell(SEAL.y))).toBeGreaterThanOrEqual(PAPER - 4);
    expect(at(light, cell(SEAL.x + 25), cell(SEAL.y - 20))).toBeGreaterThanOrEqual(PAPER - 4);
  });

  it('still leaves the shadow in the estimate, so it is whitened', () => {
    const light = estimatePaperLight(maxPool(page, factor));
    expect(Math.abs(at(light, cell(540), cell(390)) - PAPER * 0.7)).toBeLessThanOrEqual(4);
    expect(Math.abs(at(light, cell(540), cell(100)) - PAPER * 0.7)).toBeLessThanOrEqual(4);
  });
});

describe('light print against shadow', () => {
  // Grids as `estimatePaperLight` gets them: already pooled, paper at 220.
  const PAPER = 220;
  const inDisc = (x: number, y: number, cx: number, cy: number, r: number) =>
    Math.hypot(x - cx, y - cy) < r;

  it('keeps a solid light-grey seal: the estimate under it is the paper around it', () => {
    const softShadow = (x: number) => 1 - 0.3 * Math.min(1, Math.max(0, (x - 130) / 20));
    const page = image(180, 240, (x, y) =>
      inDisc(x, y, 60, 120, 18) ? PAPER * 0.8 : PAPER * softShadow(x),
    );
    const light = estimatePaperLight(page);
    expect(at(light, 60, 120)).toBeGreaterThanOrEqual(PAPER - 4);
    expect(at(light, 70, 112)).toBeGreaterThanOrEqual(PAPER - 4);
    // The shadow on the same page is still followed, so it is still whitened.
    expect(Math.abs(at(light, 170, 120) - PAPER * 0.7)).toBeLessThanOrEqual(4);
  });

  it('keeps a seal lying in a shadow, near the shadow’s edge', () => {
    // Shadowed paper this close to lit paper is dim too; the seal's crisp edge sets it apart.
    const shadow = (x: number) => 1 - 0.3 * Math.min(1, Math.max(0, (x - 4) / 8));
    const page = image(120, 160, (x, y) =>
      inDisc(x, y, 43, 80, 13) ? PAPER * shadow(x) * 0.8 : PAPER * shadow(x),
    );
    const light = estimatePaperLight(page);
    const shadowed = PAPER * 0.7;
    expect(Math.abs(at(light, 43, 80) - shadowed)).toBeLessThanOrEqual(6);
    expect(Math.abs(at(light, 50, 80) - shadowed)).toBeLessThanOrEqual(6);
  });

  it('keeps a shaded table row and a photo with a pale backdrop', () => {
    const row = (x: number, y: number) => x >= 20 && x < 160 && y >= 40 && y < 52;
    const photo = (x: number, y: number) => x >= 110 && x < 150 && y >= 120 && y < 170;
    const figure = (x: number, y: number) => inDisc(x, y, 130, 150, 12);
    const page = image(180, 240, (x, y) => {
      if (row(x, y)) return PAPER * 0.85;
      if (figure(x, y)) return PAPER * 0.3;
      if (photo(x, y)) return PAPER * 0.82;
      return PAPER;
    });
    const light = estimatePaperLight(page);
    expect(at(light, 90, 46)).toBeGreaterThanOrEqual(PAPER - 4);
    expect(at(light, 115, 125)).toBeGreaterThanOrEqual(PAPER - 6);
  });

  it('keeps a pale face walled in by a dark photo', () => {
    const photo = (x: number, y: number) => x >= 60 && x < 120 && y >= 80 && y < 160;
    const page = image(180, 240, (x, y) => {
      if (inDisc(x, y, 90, 120, 14)) return PAPER * 0.75;
      return photo(x, y) ? PAPER * 0.25 : PAPER;
    });
    const light = estimatePaperLight(page);
    expect(at(light, 90, 120)).toBeGreaterThan(PAPER - 15);
  });

  it('still whitens a soft-edged shadow lying wholly inside the page', () => {
    // Same depth as the seal, but fading out over many cells.
    const dip = (x: number, y: number) =>
      1 - 0.25 * Math.exp(-((x - 90) ** 2 + (y - 120) ** 2) / (2 * 22 ** 2));
    const page = image(180, 240, (x, y) => PAPER * dip(x, y));
    const light = estimatePaperLight(page);
    expect(Math.abs(at(light, 90, 120) - at(page, 90, 120))).toBeLessThanOrEqual(5);
  });

  it('still whitens a hard-edged shadow that comes in from the edge of the page', () => {
    const page = image(180, 240, (x, y) => (x < 50 && y > 90 && y < 150 ? PAPER * 0.75 : PAPER));
    const light = estimatePaperLight(page);
    expect(Math.abs(at(light, 20, 120) - PAPER * 0.75)).toBeLessThanOrEqual(4);
  });

  it('still whitens a dim area too large to be print', () => {
    const page = image(180, 240, (x, y) =>
      x >= 20 && x < 160 && y >= 30 && y < 210 ? PAPER * 0.8 : PAPER,
    );
    const light = estimatePaperLight(page);
    expect(Math.abs(at(light, 90, 120) - PAPER * 0.8)).toBeLessThanOrEqual(4);
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
