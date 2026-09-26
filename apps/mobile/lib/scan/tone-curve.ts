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
