/**
 * Judges whether a captured photo can make a good scan, so review can offer a retake before a
 * blurred or dark page is saved and later rejected by a portal (spec §1.1: dark, blurry phone
 * photos are why applications bounce). Three checks, on a greyscale copy of the photo, inside the
 * page:
 *
 * - **Blurry** — how steep the page's edges are (`edgeSteepness`). Blur keeps an edge's total
 *   step from paper to ink but spreads it over more pixels, so the steps between neighbouring
 *   pixels get shallower. Both kinds of blur show: out of focus, which spreads every edge, and a
 *   phone moving while the shutter is open, which spreads the edges across its path only.
 *   Judged only where there is dark detail (text, lines, a photo): a blank page or the plain back
 *   of a card has no edges to judge.
 * - **Dark** — the paper itself (a high percentile of brightness) is so dark that sensor noise
 *   swamps the ink. Dim but readable light is fine: Magic Color evens it out.
 * - **Glare** — a patch clipped to white on a page whose paper is clearly below white: a lamp
 *   reflected in a laminated card, hiding whatever is under it. Paper that is simply bright all
 *   over is not glare.
 *
 * The thresholds lean towards saying nothing: a needless "retake" nag costs more trust than a
 * missed one costs paper. Pure and allocation-light, as it runs on the JS thread for every
 * photo; unit tested on synthetic pages (`tests/scan-photo-quality.test.ts`). What it measures
 * lives only in the scan session; nothing is logged or stored.
 */

import type { PixelRect } from './geometry';
import type { GrayImage } from './paper-light';

export const QUALITY_ISSUES = ['blurry', 'dark', 'glare'] as const;
export type QualityIssue = (typeof QUALITY_ISSUES)[number];

export type PhotoQuality = {
  /** 0 smeared … 1 crisp (`edgeSteepness`). */
  readonly sharpness: number;
  /** Whether the page had enough dark detail for `sharpness` to mean anything. */
  readonly sharpnessJudged: boolean;
  /** The paper's brightness: a high percentile of the region, 0–255. */
  readonly paperLevel: number;
  /** Share of the region clipped to white while the paper is not, 0–1. */
  readonly glare: number;
  readonly issues: readonly QualityIssue[];
};

export type QualityOptions = {
  /** Below this, a judged page is 'blurry'. */
  readonly minSharpness: number;
  /** Steps between neighbours up to this size are sensor noise, not edges. */
  readonly noiseStep: number;
  /** Darker than this share of the paper's brightness counts as detail (ink, lines, photos). */
  readonly detailShare: number;
  /** Share of the region that must be detail before sharpness is judged. */
  readonly minDetail: number;
  /** Paper darker than this is 'dark'. */
  readonly darkPaper: number;
  /** Brightness counting as clipped. */
  readonly clippedLevel: number;
  /** Only a page whose typical brightness (its median) is at most this can show glare. */
  readonly glareMedianMax: number;
  /** Share of clipped pixels that is 'glare'. */
  readonly glareShare: number;
};

/**
 * Calibrated at the scale the app measures at — an 800px-wide copy of the photo — on synthetic
 * printed pages (rows of 2–4px strokes on paper with sensor noise; see the test). Measured
 * sharpness: 0.98 in focus, 0.40 at Gaussian σ 0.8, 0.25 at σ 1.2 (all still readable); 0.14 at
 * σ 2.2, 0.13 at σ 3, and 0.14 and 0.11 for 9px and 15px sideways smears. The limit sits in that
 * gap, nearer the blurred end; a 5px smear (0.22) passes. Real phone photos are sharpened by the
 * camera, which only moves them further from the limit. Paper is its 95th percentile: dim-bulb
 * photos with paper around 110 still scan well, paper under 70 does not.
 */
export const DEFAULT_QUALITY: QualityOptions = {
  minSharpness: 0.19,
  noiseStep: 6,
  detailShare: 0.7,
  minDetail: 0.004,
  darkPaper: 70,
  clippedLevel: 250,
  glareMedianMax: 230,
  glareShare: 0.02,
};

/** Neighbour offsets for the four directions edges are measured in: across, down, diagonals. */
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** A direction with less than this share of the strongest direction's edge is not judged. */
const EDGELESS_SHARE = 0.1;

/** The pixels a measurement may look at: `region` clipped to the image, or the whole image. */
function clipRegion(image: GrayImage, region?: PixelRect): PixelRect {
  if (!region) return { x: 0, y: 0, width: image.width, height: image.height };
  const x = Math.max(0, Math.min(image.width, Math.floor(region.x)));
  const y = Math.max(0, Math.min(image.height, Math.floor(region.y)));
  const right = Math.max(x, Math.min(image.width, Math.floor(region.x + region.width)));
  const bottom = Math.max(y, Math.min(image.height, Math.floor(region.y + region.height)));
  return { x, y, width: right - x, height: bottom - y };
}

/** The value below which `share` of a histogram's counts lie. */
function histogramPercentile(histogram: Uint32Array, share: number): number {
  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) total += histogram[i] as number;
  const target = share * total;
  let seen = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    seen += histogram[i] as number;
    if (seen >= target) return i;
  }
  return histogram.length - 1;
}

function brightnessHistogram(image: GrayImage, rect: PixelRect): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const row = y * image.width;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const value = image.pixels[row + x] as number;
      histogram[value] = (histogram[value] as number) + 1;
    }
  }
  return histogram;
}

/**
 * How steep the page's edges are, 0–1: in each direction, the 90th percentile of the steps
 * between neighbours that are larger than sensor noise, as a share of the page's contrast (its
 * 2nd to 98th percentile of brightness); the weakest direction counts, so a smear along one
 * path is caught. A direction with hardly any edge in it (a ruled form has few upright edges)
 * is not judged, so missing edges are never mistaken for blurred ones. 1 when nothing can be
 * judged.
 */
export function edgeSteepness(
  image: GrayImage,
  region?: PixelRect,
  noiseStep: number = DEFAULT_QUALITY.noiseStep,
): number {
  const rect = clipRegion(image, region);
  if (rect.width < 4 || rect.height < 4) return 1;
  const { width, pixels } = image;

  const brightness = brightnessHistogram(image, rect);
  const contrast = histogramPercentile(brightness, 0.98) - histogramPercentile(brightness, 0.02);
  if (contrast <= 0) return 1;

  const directions = DIRECTIONS.map(([dx, dy]) => {
    const histogram = new Uint32Array(256);
    let total = 0;
    // One pixel in from the region's edge, so every neighbour is inside it.
    for (let y = rect.y + 1; y < rect.y + rect.height - 1; y += 1) {
      const row = y * width;
      const other = (y + dy) * width;
      for (let x = rect.x + 1; x < rect.x + rect.width - 1; x += 1) {
        const step = Math.abs((pixels[other + x + dx] as number) - (pixels[row + x] as number));
        if (step > noiseStep) {
          histogram[step] = (histogram[step] as number) + 1;
          total += step;
        }
      }
    }
    return { histogram, total };
  });

  const most = Math.max(...directions.map((direction) => direction.total));
  if (most <= 0) return 1;
  let weakest = 1;
  for (const { histogram, total } of directions) {
    if (total < EDGELESS_SHARE * most) continue;
    weakest = Math.min(weakest, histogramPercentile(histogram, 0.9) / contrast);
  }
  return weakest;
}

/** Judges a photo; `region` is the inside of the page, in `image`'s pixels. */
export function assessPhotoQuality(
  image: GrayImage,
  region?: PixelRect,
  options: QualityOptions = DEFAULT_QUALITY,
): PhotoQuality {
  const rect = clipRegion(image, region);
  const total = rect.width * rect.height;
  if (total === 0) {
    return { sharpness: 1, sharpnessJudged: false, paperLevel: 0, glare: 0, issues: [] };
  }

  const histogram = brightnessHistogram(image, rect);
  const paperLevel = histogramPercentile(histogram, 0.95);
  const median = histogramPercentile(histogram, 0.5);

  let detail = 0;
  const detailBelow = Math.min(256, Math.ceil(options.detailShare * paperLevel));
  for (let i = 0; i < detailBelow; i += 1) detail += histogram[i] as number;
  let clipped = 0;
  for (let i = options.clippedLevel; i < 256; i += 1) clipped += histogram[i] as number;
  const glare = median <= options.glareMedianMax ? clipped / total : 0;

  const sharpnessJudged = detail / total >= options.minDetail;
  const sharpness = sharpnessJudged ? edgeSteepness(image, rect, options.noiseStep) : 1;

  const issues: QualityIssue[] = [];
  if (sharpnessJudged && sharpness < options.minSharpness) issues.push('blurry');
  if (paperLevel < options.darkPaper) issues.push('dark');
  if (glare >= options.glareShare) issues.push('glare');
  return { sharpness, sharpnessJudged, paperLevel, glare, issues };
}
