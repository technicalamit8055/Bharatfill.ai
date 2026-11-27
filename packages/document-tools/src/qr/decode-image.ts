/**
 * Finds the QR codes on a page image, in plain TypeScript (jsQR), for the phone and the browser.
 *
 * An Aadhaar Secure QR is dense (well over a hundred modules a side) and small on the page, so
 * one pass over a shrunken page misses it. The search goes coarse to fine: the whole page at a
 * modest size (fast, finds the big codes of certificates and close-up photos), then overlapping
 * tiles at full resolution, each big enough to hold a whole code. It stops once it has found
 * `maxCodes` codes, and yields between passes so a screen can keep drawing its spinner.
 *
 * The input is greyscale (one byte a pixel), which is what both callers have to hand. jsQR wants
 * RGBA, so each region is expanded just before its pass and dropped after: peak memory is one
 * tile, not the whole page four times over.
 */

import jsQR from 'jsqr';

export type GrayImage = {
  readonly width: number;
  readonly height: number;
  /** Row-major, one byte a pixel, no padding. */
  readonly pixels: Uint8Array;
};

export type Region = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Take every `step`-th pixel (box-averaged): 1 is full resolution. */
  readonly step: number;
};

/** Long side the whole-page pass is shrunk to. */
export const OVERVIEW_SIZE = 1200;
/** Side of a full-resolution tile, and how much neighbouring tiles share. */
export const TILE_SIZE = 1400;
export const TILE_OVERLAP = 560;

/** Where a pass starts along one side: from 0 to `length - tile`, about `tile - overlap` apart. */
function tileStarts(length: number, tile: number, overlap: number): number[] {
  if (length <= tile) return [0];
  const stride = tile - overlap;
  const count = Math.ceil((length - tile) / stride) + 1;
  const starts: number[] = [];
  for (let i = 0; i < count; i += 1) {
    starts.push(Math.round(((length - tile) * i) / (count - 1)));
  }
  return starts;
}

/**
 * The passes for an image of this size, in the order they are tried. Codes tend to sit at the
 * bottom of letters and certificates, so tiles go bottom row first.
 */
export function scanRegions(width: number, height: number): Region[] {
  const longSide = Math.max(width, height);
  const overviewStep = Math.max(1, Math.round(longSide / OVERVIEW_SIZE));
  const regions: Region[] = [{ x: 0, y: 0, width, height, step: overviewStep }];
  if (overviewStep === 1) return regions;

  const xs = tileStarts(width, TILE_SIZE, TILE_OVERLAP);
  const ys = tileStarts(height, TILE_SIZE, TILE_OVERLAP).reverse();
  for (const y of ys) {
    for (const x of xs) {
      regions.push({
        x,
        y,
        width: Math.min(TILE_SIZE, width - x),
        height: Math.min(TILE_SIZE, height - y),
        step: 1,
      });
    }
  }
  return regions;
}

/** A region of the image as RGBA, box-averaged down by its step. */
export function regionToRgba(
  image: GrayImage,
  region: Region,
): { data: Uint8ClampedArray; width: number; height: number } {
  const { step } = region;
  const width = Math.max(1, Math.floor(region.width / step));
  const height = Math.max(1, Math.floor(region.height / step));
  const data = new Uint8ClampedArray(width * height * 4);
  const area = step * step;
  for (let oy = 0; oy < height; oy += 1) {
    const top = region.y + oy * step;
    for (let ox = 0; ox < width; ox += 1) {
      const left = region.x + ox * step;
      let sum = 0;
      for (let dy = 0; dy < step; dy += 1) {
        const row = (top + dy) * image.width + left;
        for (let dx = 0; dx < step; dx += 1) sum += image.pixels[row + dx] ?? 255;
      }
      const value = step === 1 ? sum : Math.round(sum / area);
      const offset = (oy * width + ox) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

export type FindQrOptions = {
  /** Stop after this many different codes. */
  readonly maxCodes?: number;
  /** Stop early once a code passes this test (a Secure QR, say). */
  readonly isEnough?: (text: string) => boolean;
  /** Called between passes so the caller's UI can breathe; may be async. */
  readonly yieldBetween?: () => Promise<void>;
  /** Asked between passes; true abandons the search (the screen was left). */
  readonly cancelled?: () => boolean;
};

/** The text of every different QR code found on the image, in the order found. */
export async function findQrCodes(
  image: GrayImage,
  options: FindQrOptions = {},
): Promise<string[]> {
  if (image.width <= 0 || image.height <= 0 || image.pixels.length < image.width * image.height) {
    return [];
  }
  const maxCodes = options.maxCodes ?? 3;
  const found: string[] = [];
  for (const region of scanRegions(image.width, image.height)) {
    if (options.cancelled?.()) break;
    const rgba = regionToRgba(image, region);
    const code = jsQR(rgba.data, rgba.width, rgba.height, { inversionAttempts: 'dontInvert' });
    const text = code?.data ?? '';
    if (text.length > 0 && !found.includes(text)) {
      found.push(text);
      if (found.length >= maxCodes || options.isEnough?.(text)) break;
    }
    if (options.yieldBetween) await options.yieldBetween();
  }
  return found;
}
