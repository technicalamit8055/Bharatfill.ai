import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DPI,
  centredCropForAspect,
  clampRectToBounds,
  fitWithin,
  formatDimension,
  fromMm,
  mmToPx,
  presetAspectRatio,
  presetTargetSize,
  pxToMm,
  toMm,
} from './units';
import type { RequirementPreset } from './types';

const base: RequirementPreset = {
  code: 'test.preset',
  portal: 'Test',
  label: 'Test',
  category: 'photo',
  outputMime: 'image/jpeg',
  source: 'test',
  confidence: 'published',
};

describe('unit conversion', () => {
  it('round-trips every unit through millimetres', () => {
    for (const unit of ['mm', 'cm', 'in', 'px'] as const) {
      expect(fromMm(toMm(7, unit), unit)).toBeCloseTo(7, 6);
    }
  });

  it('converts the passport photo size operators quote in centimetres', () => {
    expect(toMm(3.5, 'cm')).toBe(35);
    expect(toMm(4.5, 'cm')).toBe(45);
    expect(toMm(1, 'in')).toBe(25.4);
  });

  it('rounds a physical size up to whole pixels', () => {
    // 35 mm at 200 DPI is 275.59 px. A photo 275 px wide is under 3.5 cm, which is the
    // rejection an operator cannot see coming — so it rounds up.
    expect(mmToPx(35, 200)).toBe(276);
    expect(mmToPx(45, 200)).toBe(355);
  });

  it('never produces a zero-pixel dimension', () => {
    expect(mmToPx(0.0001, 72)).toBe(1);
  });

  it('inverts mmToPx within a pixel', () => {
    // Within the one pixel that mmToPx rounds up by: 25.4/300 mm at 300 DPI.
    expect(pxToMm(mmToPx(35, DEFAULT_DPI), DEFAULT_DPI)).toBeGreaterThanOrEqual(35);
    expect(pxToMm(mmToPx(35, DEFAULT_DPI), DEFAULT_DPI)).toBeLessThan(35 + 25.4 / DEFAULT_DPI);
  });
});

describe('presetTargetSize', () => {
  it('prefers the portal’s own pixel figures over re-deriving them from millimetres', () => {
    const preset: RequirementPreset = {
      ...base,
      widthPx: 200,
      heightPx: 230,
      widthMm: 35,
      heightMm: 45,
      dpi: 200,
    };
    expect(presetTargetSize(preset)).toEqual({ width: 200, height: 230 });
  });

  it('derives pixels from a physical size at the preset’s own DPI', () => {
    const preset: RequirementPreset = { ...base, widthMm: 35, heightMm: 45, dpi: 200 };
    expect(presetTargetSize(preset)).toEqual({ width: 276, height: 355 });
  });

  it('lets the caller override the DPI for a physical size', () => {
    const preset: RequirementPreset = { ...base, widthMm: 35, heightMm: 45, dpi: 200 };
    expect(presetTargetSize(preset, 300)).toEqual({ width: 414, height: 532 });
  });

  it('takes the midpoint of a range-only preset', () => {
    const preset: RequirementPreset = {
      ...base,
      minWidthPx: 350,
      minHeightPx: 350,
      maxWidthPx: 1000,
      maxHeightPx: 1000,
    };
    expect(presetTargetSize(preset)).toEqual({ width: 675, height: 675 });
  });

  it('falls back to the minimum when a range has no upper bound', () => {
    const preset: RequirementPreset = { ...base, minWidthPx: 350, minHeightPx: 400 };
    expect(presetTargetSize(preset)).toEqual({ width: 350, height: 400 });
  });

  it('returns null when the portal states only a KB window', () => {
    expect(presetTargetSize({ ...base, minBytes: 20480, maxBytes: 51200 })).toBeNull();
    expect(presetAspectRatio({ ...base, maxBytes: 51200 })).toBeNull();
  });
});

describe('crop geometry', () => {
  it('letterboxes a wide source into a square preview without distortion', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, { width: 600, height: 600 })).toEqual({
      width: 600,
      height: 450,
    });
  });

  it('takes the full height of a landscape photo when cropping to portrait', () => {
    const crop = centredCropForAspect({ width: 4000, height: 3000 }, 35 / 45);
    expect(crop.height).toBe(3000);
    expect(crop.width).toBeCloseTo(3000 * (35 / 45), 6);
    // Centred: equal margin either side.
    expect(crop.x).toBeCloseTo((4000 - crop.width) / 2, 6);
    expect(crop.y).toBe(0);
  });

  it('takes the full width of a portrait photo when cropping to landscape', () => {
    const crop = centredCropForAspect({ width: 1000, height: 3000 }, 2);
    expect(crop.width).toBe(1000);
    expect(crop.height).toBe(500);
    expect(crop.x).toBe(0);
  });

  it('is a no-op when the source already has the target aspect', () => {
    const crop = centredCropForAspect({ width: 700, height: 900 }, 700 / 900);
    expect(crop).toMatchObject({ x: 0, y: 0, width: 700, height: 900 });
  });

  it('pulls a dragged crop box back inside the image', () => {
    expect(
      clampRectToBounds({ x: -40, y: 2900, width: 500, height: 400 }, { width: 1000, height: 3000 }),
    ).toEqual({ x: 0, y: 2600, width: 500, height: 400 });
  });

  it('shrinks a crop box larger than the image rather than overflowing it', () => {
    expect(
      clampRectToBounds({ x: 10, y: 10, width: 5000, height: 90 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 10, width: 800, height: 90 });
  });
});

describe('formatDimension', () => {
  it('reads back the way the portal notice states it', () => {
    expect(formatDimension({ ...base, widthPx: 200, heightPx: 230 })).toBe('200 × 230 px');
    expect(formatDimension({ ...base, widthMm: 35, heightMm: 45 })).toBe('3.5 × 4.5 cm');
    expect(
      formatDimension({
        ...base,
        minWidthPx: 350,
        minHeightPx: 350,
        maxWidthPx: 1000,
        maxHeightPx: 1000,
      }),
    ).toBe('350 × 350–1000 × 1000 px');
    expect(formatDimension({ ...base, minWidthPx: 350, minHeightPx: 350 })).toBe('350 × 350+ px');
  });

  it('says nothing when the preset states no dimension', () => {
    expect(formatDimension(base)).toBeNull();
  });
});
