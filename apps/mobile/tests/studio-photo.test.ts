/**
 * The studio passport photo's pure part (`lib/scan/studio-photo.ts`): where the cut goes around
 * a face (head about three quarters of the height, a margin above the crown, the 35 × 45 mm
 * shape), finding the crown in the person mask, the soft mask curve, and laying the person over
 * white or light blue. Images are small synthetic buffers, never photos of anyone.
 */

import { describe, expect, it } from 'vitest';

import { PASSPORT_PHOTO_ASPECT } from '../lib/scan/presets';
import {
  alphaCurve,
  compositeOnBackground,
  crownRow,
  type FaceBox,
  type GrayMask,
  HEAD_SHARE,
  isStudioBackground,
  largestFace,
  MAX_HEAD_SHARE,
  overhang,
  PASSPORT_JPEG_QUALITIES,
  PASSPORT_MAX_BYTES,
  passportFrame,
  scaleRect,
  STUDIO_BACKGROUNDS,
  STUDIO_COLOURS,
  TOP_MARGIN_SHARE,
} from '../lib/scan/studio-photo';

/** A mask with the person filling `rect` (inclusive left/top, exclusive right/bottom). */
function maskWith(
  width: number,
  height: number,
  rect: { left: number; top: number; right: number; bottom: number },
): GrayMask {
  const pixels = new Uint8Array(width * height);
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) pixels[y * width + x] = 255;
  }
  return { width, height, pixels };
}

describe('largestFace', () => {
  it('picks the face nearest the camera, the biggest', () => {
    const small: FaceBox = [10, 10, 30, 30];
    const big: FaceBox = [100, 100, 220, 240];
    expect(largestFace([small, big])).toEqual(big);
  });

  it('is null with no faces, or only empty boxes', () => {
    expect(largestFace([])).toBeNull();
    expect(largestFace([[5, 5, 5, 20]])).toBeNull();
  });
});

describe('crownRow', () => {
  const face: FaceBox = [40, 60, 80, 110];

  it('finds the top of the head above the face box', () => {
    const mask = maskWith(120, 200, { left: 35, top: 30, right: 85, bottom: 200 });
    expect(crownRow(mask, face)).toBe(30);
  });

  it('ignores a thin wisp of hair narrower than the middle of the face', () => {
    const mask = maskWith(120, 200, { left: 35, top: 40, right: 85, bottom: 200 });
    // A two-pixel-wide strand standing above the head.
    for (let y = 20; y < 40; y += 1) mask.pixels[y * 120 + 60] = 255;
    expect(crownRow(mask, face)).toBe(40);
  });

  it('gives row 0 when the head runs off the top of the photo', () => {
    const mask = maskWith(120, 200, { left: 35, top: 0, right: 85, bottom: 200 });
    expect(crownRow(mask, [40, 30, 80, 80])).toBe(0);
  });

  it('is null when the mask shows no head above the face', () => {
    expect(crownRow(maskWith(120, 200, { left: 0, top: 0, right: 0, bottom: 0 }), face)).toBeNull();
    expect(crownRow(maskWith(120, 200, { left: 0, top: 0, right: 120, bottom: 200 }), [5, 5, 5, 9])).toBeNull();
  });
});

describe('passportFrame', () => {
  const size = { width: 1200, height: 1600 };
  const face: FaceBox = [500, 500, 700, 760];

  it('has the 35 × 45 mm shape, centred on the face', () => {
    const frame = passportFrame(size, face, 400);
    expect(frame.width / frame.height).toBeCloseTo(PASSPORT_PHOTO_ASPECT, 2);
    expect(frame.x + frame.width / 2).toBeCloseTo(600, 0);
  });

  it('fills about three quarters of the height with the head, under a clear margin', () => {
    const crown = 400;
    const frame = passportFrame(size, face, crown);
    const head = face[3] - crown;
    expect(head / frame.height).toBeCloseTo(HEAD_SHARE, 2);
    expect((crown - frame.y) / frame.height).toBeCloseTo(TOP_MARGIN_SHARE, 2);
  });

  it('estimates the crown from the face box when the mask cannot say', () => {
    const withCrown = passportFrame(size, face, null);
    expect(withCrown.y).toBeLessThan(face[1]);
    expect(withCrown.height).toBeGreaterThan(face[3] - face[1]);
  });

  it('keeps the margin above a head that touches the top, reaching past the edge', () => {
    const touching: FaceBox = [500, 60, 700, 320];
    const frame = passportFrame(size, touching, 0);
    expect(frame.y).toBeLessThan(0);
    expect(overhang(frame, size).top).toBeGreaterThan(0);
  });

  it('pulls in when the photo ends close below the chin, so shoulders do not float', () => {
    const lowFace: FaceBox = [500, 1300, 700, 1560];
    const crown = 1200;
    const frame = passportFrame(size, lowFace, crown);
    const head = lowFace[3] - crown;
    expect(head / frame.height).toBeGreaterThan(HEAD_SHARE);
    expect(head / frame.height).toBeLessThanOrEqual(MAX_HEAD_SHARE + 0.01);
  });
});

describe('overhang and scaleRect', () => {
  it('measures how far a cut reaches past each edge', () => {
    expect(overhang({ x: -5, y: -10, width: 120, height: 130 }, { width: 100, height: 100 })).toEqual(
      { top: 10, bottom: 20, left: 5, right: 15 },
    );
    expect(overhang({ x: 0, y: 0, width: 100, height: 100 }, { width: 100, height: 100 })).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  it('moves a cut from the working copy to the full photo', () => {
    expect(scaleRect({ x: 10, y: -4, width: 35, height: 45 }, 2)).toEqual({
      x: 20,
      y: -8,
      width: 70,
      height: 90,
    });
  });
});

describe('alphaCurve', () => {
  const curve = alphaCurve();

  it('drops what the model is unsure is the person, and keeps what it is sure of', () => {
    expect(curve[0]).toBe(0);
    expect(curve[40]).toBe(0);
    expect(curve[220]).toBe(255);
    expect(curve[255]).toBe(255);
  });

  it('rises smoothly in between, never stepping back', () => {
    for (let level = 1; level < 256; level += 1) {
      expect(curve[level] as number).toBeGreaterThanOrEqual(curve[level - 1] as number);
    }
    expect(curve[128]).toBeGreaterThan(100);
    expect(curve[128]).toBeLessThan(155);
  });
});

describe('compositeOnBackground', () => {
  const photo = new Uint8Array([10, 20, 30, 10, 20, 30, 10, 20, 30]);
  const alpha = new Uint8Array([255, 0, 128]);

  it('keeps the person, paints the background, and blends the edge', () => {
    const out = compositeOnBackground(photo, alpha, [255, 255, 255]);
    expect([...out.slice(0, 3)]).toEqual([10, 20, 30]);
    expect([...out.slice(3, 6)]).toEqual([255, 255, 255]);
    const edge = [...out.slice(6, 9)];
    expect(edge[0]).toBeGreaterThan(10);
    expect(edge[0]).toBeLessThan(255);
  });

  it('writes light blue in the buffer’s own channel order', () => {
    const [r, g, b] = STUDIO_COLOURS.studioBlue;
    const bgr = compositeOnBackground(photo, alpha, STUDIO_COLOURS.studioBlue, 'bgr');
    expect([...bgr.slice(3, 6)]).toEqual([b, g, r]);
    const rgb = compositeOnBackground(photo, alpha, STUDIO_COLOURS.studioBlue, 'rgb');
    expect([...rgb.slice(3, 6)]).toEqual([r, g, b]);
  });

  it('refuses a mask the wrong size for the photo', () => {
    expect(() => compositeOnBackground(photo, new Uint8Array(2), [255, 255, 255])).toThrow(
      RangeError,
    );
  });
});

describe('studio backgrounds', () => {
  it('are plain white and a pale blue', () => {
    expect(STUDIO_COLOURS.studioWhite).toEqual([255, 255, 255]);
    const [r, g, b] = STUDIO_COLOURS.studioBlue;
    expect(b).toBeGreaterThan(r);
    expect(Math.min(r, g, b)).toBeGreaterThan(180);
  });

  it('are told apart from the other looks', () => {
    for (const background of STUDIO_BACKGROUNDS) expect(isStudioBackground(background)).toBe(true);
    expect(isStudioBackground('original')).toBe(false);
    expect(isStudioBackground('magic')).toBe(false);
  });

  it('fit a portal’s 50 KB, trying the best quality first', () => {
    expect(PASSPORT_MAX_BYTES).toBe(51_200);
    const qualities = [...PASSPORT_JPEG_QUALITIES];
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a));
    expect(qualities.every((quality) => quality > 0 && quality <= 1)).toBe(true);
  });
});
