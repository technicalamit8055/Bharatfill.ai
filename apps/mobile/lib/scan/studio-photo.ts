/**
 * The studio passport photo: a selfie or a photo against any wall turned into a 35 × 45 mm
 * photograph on plain white or light blue, framed the way Indian forms ask for it, and small
 * enough for a portal (under 50 KB).
 *
 * The phone finds the face and a mask of the person (`lib/vision/on-device-vision.ts`, Google's
 * on-device models); this module is the pure part, unit tested:
 *
 * - `passportFrame` — where to cut: the head (crown to chin) fills `HEAD_SHARE` of the photo's
 *   height with `TOP_MARGIN_SHARE` of clear background above it, centred on the face. The cut
 *   may reach past the photo's edge; once the background is replaced, that is filled with the
 *   same plain colour, so a head close to the top still gets its margin.
 * - `crownRow` — the top of the head, found in the mask above the face: the face box ends at
 *   the forehead, and hair is part of the head on a passport photo.
 * - `alphaCurve` and `compositeOnBackground` — the person's soft-edged mask laid over a plain
 *   colour, so hair edges fade instead of showing a cut-out halo.
 *
 * The pixels are drawn in `document-vision.ts`. Nothing here is stored or logged.
 */

import type { PixelRect, Size } from './geometry';
import { PASSPORT_PHOTO_ASPECT } from './presets';

/** `[left, top, right, bottom]` in image pixels, as the face finder reports a face. */
export type FaceBox = readonly [number, number, number, number];

/** The two plain backgrounds offered. Each has copy at `scanner.filters.<background>`. */
export const STUDIO_BACKGROUNDS = ['studioWhite', 'studioBlue'] as const;
export type StudioBackground = (typeof STUDIO_BACKGROUNDS)[number];

/** RGB. Light blue is the pale sky blue photo studios use for Indian forms and visas. */
export const STUDIO_COLOURS: Readonly<Record<StudioBackground, readonly [number, number, number]>> =
  {
    studioWhite: [255, 255, 255],
    studioBlue: [204, 229, 250],
  };

export function isStudioBackground(value: string): value is StudioBackground {
  return (STUDIO_BACKGROUNDS as readonly string[]).includes(value);
}

/** Largest size a saved passport photo may be, what most portals cap a photo at. */
export const PASSPORT_MAX_BYTES = 50 * 1024;

/** JPEG qualities tried, best first, until the photo fits `PASSPORT_MAX_BYTES`. */
export const PASSPORT_JPEG_QUALITIES = [0.92, 0.86, 0.8, 0.74, 0.68, 0.6, 0.52, 0.44] as const;

/**
 * Share of the photo's height the head (crown to chin) fills. Indian passport and exam portals
 * ask for the face to cover about three quarters of the photo (ICAO: 32–36 mm of 45 mm).
 */
export const HEAD_SHARE = 0.74;
/** At most this share, when the photo is cut too close below the chin to show the shoulders. */
export const MAX_HEAD_SHARE = 0.8;
/** Clear background above the crown, as a share of the photo's height (about 3.5 mm). */
export const TOP_MARGIN_SHARE = 0.08;
/** Head above the face box, as a share of the box's height, when the mask cannot say. */
export const CROWN_ALLOWANCE = 0.4;

/** The biggest face: the citizen is nearest the camera; a face in a poster behind is smaller. */
export function largestFace(faces: readonly FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  let bestArea = 0;
  for (const face of faces) {
    const area = Math.max(0, face[2] - face[0]) * Math.max(0, face[3] - face[1]);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
}

export type GrayMask = {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel: 255 is surely the person, 0 surely background. */
  readonly pixels: Uint8Array;
};

/** A row counts as head when the middle of the face's span is mostly person. */
const CROWN_COVERAGE = 0.5;
const CROWN_MASK_LEVEL = 128;

/**
 * The top of the head: the first row above the face, within the middle half of the face's
 * width, that the mask calls mostly person. Searched from one face-height above the face box
 * down to it. A head that runs off the top of the photo gives row 0 — the crown is somewhere
 * above, so `passportFrame` falls back to its estimate if that is higher. Null when the mask
 * shows no head above the face at all.
 */
export function crownRow(mask: GrayMask, face: FaceBox): number | null {
  const faceWidth = face[2] - face[0];
  const faceHeight = face[3] - face[1];
  if (faceWidth <= 0 || faceHeight <= 0) return null;
  const left = Math.max(0, Math.round(face[0] + faceWidth / 4));
  const right = Math.min(mask.width, Math.round(face[2] - faceWidth / 4));
  if (right <= left) return null;
  const from = Math.max(0, Math.floor(face[1] - faceHeight));
  const to = Math.min(mask.height, Math.ceil(face[1]));
  for (let y = from; y < to; y += 1) {
    let person = 0;
    const row = y * mask.width;
    for (let x = left; x < right; x += 1) {
      if ((mask.pixels[row + x] as number) >= CROWN_MASK_LEVEL) person += 1;
    }
    if (person >= CROWN_COVERAGE * (right - left)) return y;
  }
  return null;
}

/**
 * Where to cut the passport photo out of an upright photo of `size`, around `face`, with the
 * crown at `crown` (from `crownRow`; null estimates it from the face box). The rectangle has the
 * 35 × 45 mm shape and may reach past the photo's edges, which the caller fills with the plain
 * background.
 *
 * When the photo ends close below the chin, the cut is pulled in (the head grows towards
 * `MAX_HEAD_SHARE`) so the shoulders are not left floating above a plain strip.
 */
export function passportFrame(size: Size, face: FaceBox, crown: number | null): PixelRect {
  const faceHeight = Math.max(1, face[3] - face[1]);
  const estimate = face[1] - CROWN_ALLOWANCE * faceHeight;
  // Row 0 only says the head reaches the top of the photo; the estimate may know it goes higher.
  const top = crown === null ? estimate : crown <= 0 ? Math.min(0, estimate) : crown;
  const chin = face[3];
  const head = Math.max(1, chin - top);

  let height = head / HEAD_SHARE;
  if (top - TOP_MARGIN_SHARE * height + height > size.height) {
    // Fit the cut's foot to the photo's foot, keeping the margin above the crown.
    const fitted = (size.height - top) / (1 - TOP_MARGIN_SHARE);
    height = Math.max(head / MAX_HEAD_SHARE, fitted);
  }
  const width = height * PASSPORT_PHOTO_ASPECT;
  const centre = (face[0] + face[2]) / 2;
  return {
    x: Math.round(centre - width / 2),
    y: Math.round(top - TOP_MARGIN_SHARE * height),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** How far a rectangle reaches past each edge of an image of `size`, in whole pixels (≥ 0). */
export type Overhang = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export function overhang(rect: PixelRect, size: Size): Overhang {
  return {
    top: Math.max(0, -rect.y),
    bottom: Math.max(0, rect.y + rect.height - size.height),
    left: Math.max(0, -rect.x),
    right: Math.max(0, rect.x + rect.width - size.width),
  };
}

/** `rect` scaled by `factor`, as for moving a cut from a small working copy to the full photo. */
export function scaleRect(rect: PixelRect, factor: number): PixelRect {
  return {
    x: Math.round(rect.x * factor),
    y: Math.round(rect.y * factor),
    width: Math.max(1, Math.round(rect.width * factor)),
    height: Math.max(1, Math.round(rect.height * factor)),
  };
}

/** Mask levels below this are background; above `ALPHA_HIGH` the person, fully. */
const ALPHA_LOW = 0.2;
const ALPHA_HIGH = 0.8;

/**
 * A lookup table from the model's confidence to opacity: a smooth step between `ALPHA_LOW` and
 * `ALPHA_HIGH`. The model is unsure along hair and shoulders; a step there would cut a hard
 * outline, and a straight copy would leave a grey haze of the old wall around the head.
 */
export function alphaCurve(): Uint8Array {
  const table = new Uint8Array(256);
  for (let level = 0; level < 256; level += 1) {
    const t = Math.min(1, Math.max(0, (level / 255 - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW)));
    table[level] = Math.round(255 * t * t * (3 - 2 * t));
  }
  return table;
}

/**
 * Lays `photo` (3 bytes per pixel, in `order`) over a plain `rgb` colour through `alpha` (one
 * byte per pixel, 255 = the photo), returning a new buffer in the same order.
 */
export function compositeOnBackground(
  photo: Uint8Array,
  alpha: Uint8Array,
  rgb: readonly [number, number, number],
  order: 'bgr' | 'rgb' = 'bgr',
): Uint8Array {
  const pixels = alpha.length;
  if (photo.length !== pixels * 3) throw new RangeError('The photo and its mask differ in size.');
  const [r, g, b] = rgb;
  const background = order === 'bgr' ? [b, g, r] : [r, g, b];
  const out = new Uint8Array(photo.length);
  for (let index = 0; index < pixels; index += 1) {
    const a = alpha[index] as number;
    const base = index * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = photo[base + channel] as number;
      const plain = background[channel] as number;
      out[base + channel] = Math.round((value * a + plain * (255 - a)) / 255);
    }
  }
  return out;
}
