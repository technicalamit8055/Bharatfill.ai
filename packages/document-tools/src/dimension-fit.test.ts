/**
 * Fitting a file to an upload box's exact picture size, not just its KB window.
 *
 * The case behind it: SSC rejected an extension-attached signature with "DIMENSION IS NOT
 * CORRECT. WIDTH SHOULD BE 6cm AND HEIGHT SHOULD BE 2cm". Auto-fit only ever changed bytes, and
 * a canvas JPEG carries no DPI, so a portal measuring centimetres could never be satisfied.
 */

import { describe, expect, it } from 'vitest';
import { describeAutoFit, planAutoFit } from './autofit';
import { findPreset } from './presets';
import {
  MAX_PROBES,
  MIN_QUALITY,
  nextQualityProbe,
  padJpegToMinimum,
  readJpegDpi,
  recordQualityProbe,
  setJpegDpi,
  startQualitySearch,
} from './sizing';
import { aspectDeviation, containInFrame, presetTargetSize } from './units';

const KB = 1024;

/** SOI, a JFIF APP0 with no density (units 0, 1:1 — what a canvas writes), then EOI. */
// prettier-ignore
const canvasJpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xd9,
]);

/** SOI then EOI — a JPEG with no JFIF header at all. */
const bareJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const SIGNATURE = { widthPx: 709, heightPx: 237, dpi: 300, subject: 'signature' as const };

describe('setJpegDpi', () => {
  it('patches the density of an existing JFIF header in place', () => {
    const stamped = setJpegDpi(canvasJpeg, 300);
    expect(stamped.length).toBe(canvasJpeg.length);
    expect(readJpegDpi(stamped)).toEqual({ x: 300, y: 300 });
    // Everything but the five density bytes is untouched.
    expect([...stamped.subarray(0, 13)]).toEqual([...canvasJpeg.subarray(0, 13)]);
    expect([...stamped.subarray(18)]).toEqual([...canvasJpeg.subarray(18)]);
  });

  it('inserts a JFIF header straight after SOI when the file has none', () => {
    const stamped = setJpegDpi(bareJpeg, 300);
    expect(stamped.length).toBe(bareJpeg.length + 18);
    expect([stamped[0], stamped[1], stamped[2], stamped[3]]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(readJpegDpi(stamped)).toEqual({ x: 300, y: 300 });
    expect([...stamped.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it('reads no DPI from a header that states none', () => {
    expect(readJpegDpi(canvasJpeg)).toBeNull();
    expect(readJpegDpi(bareJpeg)).toBeNull();
  });

  it('leaves anything that is not a JPEG, or a nonsense DPI, alone', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(setJpegDpi(png, 300)).toBe(png);
    expect(setJpegDpi(canvasJpeg, 0)).toBe(canvasJpeg);
    expect(setJpegDpi(canvasJpeg, 72.5)).toBe(canvasJpeg);
  });

  it('keeps the JFIF header first when the file is padded to a minimum afterwards', () => {
    const padded = padJpegToMinimum(setJpegDpi(canvasJpeg, 300), 10 * KB);
    expect(padded.length).toBeGreaterThanOrEqual(10 * KB);
    expect([padded[2], padded[3]]).toEqual([0xff, 0xe0]);
    expect(readJpegDpi(padded)).toEqual({ x: 300, y: 300 });
    // The comment padding follows the 18-byte header.
    expect([padded[20], padded[21]]).toEqual([0xff, 0xfe]);
  });
});

describe('quality search at a fixed size', () => {
  function run(baseBytes: number, maxBytes: number) {
    let state = startQualitySearch({ fixedScale: true, startScale: 0.25 });
    let probe = nextQualityProbe(state);
    const scales = new Set<number>();
    while (probe) {
      scales.add(probe.scale);
      state = recordQualityProbe(state, probe, Math.round(baseBytes * probe.quality), maxBytes);
      probe = nextQualityProbe(state);
    }
    return { state, scales };
  }

  it('never leaves full resolution, whatever the opening guess said', () => {
    const { state, scales } = run(40 * KB, 20 * KB);
    expect([...scales]).toEqual([1]);
    expect(state.best?.scale).toBe(1);
    expect(state.best?.bytes).toBeLessThanOrEqual(20 * KB);
  });

  it('gives up rather than shrink the picture when quality alone cannot fit', () => {
    const { state, scales } = run(400 * KB, 20 * KB);
    expect([...scales]).toEqual([1]);
    expect(state.best).toBeNull();
    expect(state.probes).toBe(MAX_PROBES);
    expect(state.high).toBeLessThanOrEqual(MIN_QUALITY + 0.02 + 0.05);
  });
});

describe('frame geometry', () => {
  it('centres a signature in its 6 × 2 cm box without stretching it', () => {
    // A trimmed signature that is wider than 3:1 fills the width, minus the margin.
    const rect = containInFrame({ width: 1200, height: 300 }, { width: 709, height: 237 }, 0.04);
    expect(rect.width / rect.height).toBeCloseTo(4, 1);
    expect(rect.x).toBeGreaterThanOrEqual(Math.floor(709 * 0.04) - 1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(709);
    expect(rect.y + rect.height).toBeLessThanOrEqual(237);
  });

  it('fills the frame exactly when the shapes already agree', () => {
    expect(containInFrame({ width: 1418, height: 474 }, { width: 709, height: 237 })).toEqual({
      x: 0,
      y: 0,
      width: 709,
      height: 237,
    });
  });

  it('measures how far a photo is from the box’s shape', () => {
    expect(aspectDeviation({ width: 350, height: 450 }, { width: 276, height: 355 })).toBeLessThan(
      0.01,
    );
    expect(
      aspectDeviation({ width: 4000, height: 3000 }, { width: 276, height: 355 }),
    ).toBeGreaterThan(0.5);
  });
});

describe('planAutoFit with a stated picture size', () => {
  it('redraws an image even when its bytes already fit, because the portal checks pixels', () => {
    expect(
      planAutoFit(
        { filename: 'sign.jpg', mimeType: 'image/jpeg', sizeBytes: 15 * KB },
        { minBytes: 10 * KB, maxBytes: 20 * KB, dimensions: SIGNATURE },
        () => true,
      ),
    ).toEqual({
      action: 'image',
      outputMimeType: 'image/jpeg',
      filename: 'sign.jpg',
      minBytes: 10 * KB,
      maxBytes: 20 * KB,
      converted: false,
      resize: SIGNATURE,
    });
  });

  it('never applies a picture size to a PDF', () => {
    expect(
      planAutoFit(
        { filename: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 100 * KB },
        { maxBytes: 200 * KB, dimensions: SIGNATURE },
        () => true,
      ),
    ).toEqual({ action: 'none' });
  });

  it('ignores a size no portal could mean', () => {
    expect(
      planAutoFit(
        { filename: 'sign.jpg', mimeType: 'image/jpeg', sizeBytes: 15 * KB },
        { maxBytes: 20 * KB, dimensions: { ...SIGNATURE, widthPx: 3 } },
        () => true,
      ),
    ).toEqual({ action: 'none' });
  });

  it('tells the operator the size it was redrawn to, in the portal’s own units', () => {
    const { changes } = describeAutoFit({
      fromBytes: 80 * KB,
      toBytes: 18 * KB,
      converted: false,
      scale: null,
      padded: false,
      rasterised: false,
      dpi: null,
      resized: { widthPx: 709, heightPx: 237, dpi: 300 },
    });
    expect(changes).toContain('Resized to 6.0 × 2.0 cm (709 × 237 px at 300 DPI).');
  });
});

describe('ssc.signature preset', () => {
  it('asks for 6.0 × 2.0 cm at 300 DPI, as the portal now states', () => {
    const preset = findPreset('ssc.signature');
    expect(preset).toMatchObject({ widthMm: 60, heightMm: 20, dpi: 300 });
    expect(preset ? presetTargetSize(preset) : null).toEqual({ width: 709, height: 237 });
  });
});
