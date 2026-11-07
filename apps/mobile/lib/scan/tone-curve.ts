/**
 * Tone curves for the scanner's cleaned-up looks, as 256-entry lookup tables for `OpenCV.LUT`.
 * They run after lighting has been evened out, when paper sits at one brightness across the
 * page and ink, stamps and photos sit below it.
 *
 * The curve is fitted to each page from its histogram: paper and its grain go pure white, the
 * darkest ink goes black, and everything between keeps its order and most of its shading, so
 * faint signatures and passport photos survive.
 *
 * Pure, so it is unit tested.
 */

/** Where a page's ink ends and its paper begins, in 0–255 brightness. */
export type Levels = { readonly black: number; readonly white: number };

/** For a histogram with nothing to go on. */
export const DEFAULT_LEVELS: Levels = { black: 30, white: 235 };

/** Share of the page's pixels at or below the black point: the darkest ink. */
const INK_SHARE = 0.005;
/**
 * How far below the paper's peak the white point sits, in half-widths of that peak. The peak's
 * spread is the paper's grain and sensor noise; everything within ~2.5 standard deviations of
 * paper goes white, and marks fainter than that stay.
 */
const PAPER_SPREADS = 3;
const MIN_WHITE = 160;
const MAX_WHITE = 250;
/** Never lift the black point past this share of the white point, however little ink there is. */
const MAX_BLACK_SHARE = 0.45;

/**
 * Darkens midtones after the stretch, so text strokes print solid and thin type does not look
 * washed out. Photos keep their order of tones, only a little deeper.
 */
export const INK_GAMMA = 1.3;

/** Fits `Levels` to a 256-bin brightness histogram of a lighting-evened page. */
export function pageLevels(
  histogram: ArrayLike<number>,
  paperSpreads: number = PAPER_SPREADS,
): Levels {
  const bins = Array.from({ length: 256 }, (_, i) => histogram[i] ?? 0);
  const total = bins.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return DEFAULT_LEVELS;

  // A 5-bin moving average, so JPEG noise cannot make a spike look like the paper's peak.
  const smooth = bins.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(255, i + 2); j += 1) {
      sum += bins[j] as number;
      count += 1;
    }
    return sum / count;
  });

  let peak = 128;
  for (let i = 129; i < 256; i += 1) {
    if ((smooth[i] as number) > (smooth[peak] as number)) peak = i;
  }
  const half = (smooth[peak] as number) / 2;
  let edge = peak;
  while (edge > 0 && (smooth[edge - 1] as number) > half) edge -= 1;
  const spread = Math.max(2, peak - edge);
  const white = Math.round(Math.min(MAX_WHITE, Math.max(MIN_WHITE, peak - paperSpreads * spread)));

  let black = 0;
  let seen = 0;
  while (black < 255 && seen + (bins[black] as number) < INK_SHARE * total) {
    seen += bins[black] as number;
    black += 1;
  }
  black = Math.floor(Math.min(black, MAX_BLACK_SHARE * white));

  return { black, white };
}

/**
 * The page's tone curve: `black` and below to 0, `white` and above to 255, a gamma curve
 * between. Never decreasing, so no tone overtakes a darker one.
 */
export function levelsCurve({ black, white }: Levels, gamma: number = INK_GAMMA): Uint8Array {
  const table = new Uint8Array(256);
  const range = Math.max(1, white - black);
  for (let i = 0; i < 256; i += 1) {
    const x = Math.min(1, Math.max(0, (i - black) / range));
    table[i] = Math.round(255 * x ** gamma);
  }
  return table;
}

/**
 * For a colour difference channel (Cr or Cb, neutral at 128): snaps faint tints within
 * `deadZone` of neutral to grey and gives real colour a little more saturation. Sensor noise
 * and white-balance drift on black text and white paper are faint tints; blue ink, red stamps
 * and photos are not.
 */
export function chromaCurve(deadZone: number, gain: number): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    const offset = i - 128;
    const kept = Math.sign(offset) * Math.max(0, Math.abs(offset) - deadZone) * gain;
    table[i] = Math.round(Math.min(255, Math.max(0, 128 + kept)));
  }
  return table;
}

/** The brightness below which `share` of a histogram's pixels lie, and the one above which. */
function percentiles(histogram: ArrayLike<number>, share: number): { low: number; high: number } {
  let total = 0;
  for (let i = 0; i < 256; i += 1) total += histogram[i] ?? 0;
  const limit = share * total;
  let low = 0;
  let seen = 0;
  while (low < 255 && seen + (histogram[low] ?? 0) <= limit) {
    seen += histogram[low] ?? 0;
    low += 1;
  }
  let high = 255;
  seen = 0;
  while (high > 0 && seen + (histogram[high] ?? 0) <= limit) {
    seen += histogram[high] ?? 0;
    high -= 1;
  }
  return { low, high: Math.max(low, high) };
}

function histogramTotal(histogram: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < 256; i += 1) total += histogram[i] ?? 0;
  return total;
}

export type ContrastStretchOptions = {
  /** Share of pixels allowed past each end: specular glints and the darkest shadow. */
  readonly clipShare: number;
  /**
   * Images already spanning this many levels between those ends gain too little from the
   * stretch to be worth another detection pass.
   */
  readonly enoughRange: number;
};

export const DEFAULT_CONTRAST_STRETCH: ContrastStretchOptions = {
  clipShare: 0.01,
  enoughRange: 170,
};

/**
 * A table spreading a low-contrast image across the full range: its 1st percentile to black,
 * its 99th to white. For finding a light page on a light desk, whose edge is a step of a few
 * levels that edge detection tuned for ordinary photos misses; stretched, the same step is
 * several times larger. Null when the image already spans enough range (the stretch would
 * barely change it) or holds no contrast at all.
 */
export function contrastStretch(
  histogram: ArrayLike<number>,
  options: ContrastStretchOptions = DEFAULT_CONTRAST_STRETCH,
): Uint8Array | null {
  if (histogramTotal(histogram) <= 0) return null;
  const { low, high } = percentiles(histogram, options.clipShare);
  const range = high - low;
  if (range < 2 || range >= options.enoughRange) return null;
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    table[i] = Math.round(Math.min(255, Math.max(0, ((i - low) * 255) / range)));
  }
  return table;
}

export type PhotoLevelsOptions = {
  /** Share of pixels allowed past each end before the black and white points. */
  readonly clipShare: number;
  /** The most the stretch may multiply contrast by: enough to lift a dull print, not a face. */
  readonly maxGain: number;
};

export const DEFAULT_PHOTO_LEVELS: PhotoLevelsOptions = { clipShare: 0.005, maxGain: 1.35 };

/**
 * Gentle auto-levels for a passport photo, for `levelsCurve(levels, 1)`: the darkest and
 * lightest half-percent go to black and white, but the contrast grows by at most `maxGain`, so a
 * dull print or a dim room is lifted while skin keeps its tones. The extra range a capped gain
 * leaves is shared evenly between shadows and highlights.
 */
export function photoLevels(
  histogram: ArrayLike<number>,
  options: PhotoLevelsOptions = DEFAULT_PHOTO_LEVELS,
): Levels {
  if (histogramTotal(histogram) <= 0) return { black: 0, white: 255 };
  const { low, high } = percentiles(histogram, options.clipShare);
  // Rounded up, so the gain stays at or under the cap.
  const minRange = Math.ceil(255 / Math.max(1, options.maxGain));
  if (high - low >= minRange) return { black: low, white: high };
  const centre = (low + high) / 2;
  const black = Math.round(Math.max(0, Math.min(255 - minRange, centre - minRange / 2)));
  return { black, white: black + minRange };
}
