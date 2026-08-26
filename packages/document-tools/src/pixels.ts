/**
 * Pixel operations for signature cleanup and scan enhancement.
 * Master spec §13.2 — signature "crop whitespace", "convert to black/white",
 * "transparent/white background"; photo "background check placeholder".
 *
 * These are pure functions over an RGBA buffer — the same layout `CanvasRenderingContext2D`
 * hands back from `getImageData`. Keeping them free of the canvas is what makes the interesting
 * part of the image pipeline unit-testable in Node, and it is the part that is easy to get
 * wrong: a threshold that is one step too aggressive erases the thin upstroke of a signature.
 *
 * The problem being solved is specific. An operator photographs a signature on white paper with
 * a phone, indoors, and the paper comes out grey-yellow with a shadow gradient across it. A
 * fixed threshold either keeps the shadow (portal sees a grey box) or eats the ink. So the
 * background level is measured from the image itself before anything is decided.
 */

export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Rec. 709 luma. Matches what the eye calls "darker", which is what ink is. */
export function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** A 256-bucket luma histogram. The basis of every automatic decision below. */
export function lumaHistogram(image: RgbaImage): Uint32Array {
  const histogram = new Uint32Array(256);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const value = luma(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
    const bucket = Math.min(255, Math.max(0, Math.round(value)));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return histogram;
}

/**
 * Luma at a given cumulative share of the pixels.
 *
 * `percentileLuma(image, 0.9)` is "the paper", because a photographed signature is overwhelmingly
 * paper. Using the 90th percentile rather than the maximum ignores a specular highlight from the
 * phone's own flash, which would otherwise read as the paper being brighter than it is.
 */
export function percentileLuma(image: RgbaImage, percentile: number): number {
  const histogram = lumaHistogram(image);
  const total = (image.data.length / 4) | 0;
  const target = Math.max(1, Math.floor(total * Math.min(1, Math.max(0, percentile))));
  let seen = 0;
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value] ?? 0;
    if (seen >= target) return value;
  }
  return 255;
}

/**
 * Otsu's method: the luma that best separates the image into two classes.
 *
 * Used as the ink/paper split. It is the standard answer for a bimodal image, and a page with
 * writing on it is as bimodal as images get. It handles a yellow-grey page correctly because it
 * asks where the gap between the two clusters is, not how bright either one happens to be.
 *
 * The one wrinkle worth spelling out: on a page of writing the two clusters are separated by a
 * wide *empty* gap — nothing on a signature scan is mid-grey — so every threshold across that
 * gap scores the identical between-class variance. Textbook Otsu keeps the first maximum it
 * sees, which lands the split exactly on the ink level, at which point `cleanSignature` reads
 * the strokes as half-ink and hands back a grey signature. So the plateau is tracked and its
 * midpoint returned, which puts the split in the middle of the gap where it belongs.
 */
export function otsuThreshold(image: RgbaImage): number {
  const histogram = lumaHistogram(image);
  const total = (image.data.length / 4) | 0;
  if (total === 0) return 128;

  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * (histogram[value] ?? 0);

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let plateauLow = 128;
  let plateauHigh = 128;

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value] ?? 0;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += value * (histogram[value] ?? 0);
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    // Relative tolerance rather than `===`: the running sums are floating point, so two
    // arithmetically identical scores differ in the last bits.
    if (variance > bestVariance * (1 + 1e-12)) {
      bestVariance = variance;
      plateauLow = value;
      plateauHigh = value;
    } else if (variance >= bestVariance * (1 - 1e-9)) {
      plateauHigh = value;
    }
  }
  return Math.round((plateauLow + plateauHigh) / 2);
}

export type CleanSignatureOptions = {
  /**
   * -100…+100. Negative keeps more grey (thin strokes survive, some shadow may remain);
   * positive is more aggressive (cleaner paper, risk of breaking a light stroke).
   * The default of 0 uses Otsu's split unmodified.
   */
  strength?: number;
  /** `white` for a portal upload, `transparent` for overlaying on a form or a card. */
  background?: 'white' | 'transparent';
  /** Keep the pen's own colour instead of forcing black. Some portals want blue ink visible. */
  keepInkColour?: boolean;
};

/**
 * Turns a photographed signature into ink on clean paper, in place.
 *
 * Pixels darker than the split become ink; everything else becomes background. Between the two
 * there is a narrow band that is anti-aliased rather than snapped, because a hard binarisation
 * of a signature at upload resolution produces visibly jagged strokes, and a jagged signature is
 * the kind of thing that gets an application flagged as tampered with.
 */
export function cleanSignature(image: RgbaImage, options: CleanSignatureOptions = {}): RgbaImage {
  const { strength = 0, background = 'white', keepInkColour = false } = options;
  const split = Math.min(250, Math.max(5, otsuThreshold(image) + strength * 0.6));
  // Feather width. Scaled with the split so a dark scan and a bright one get a proportionate band.
  const feather = Math.max(6, split * 0.12);
  const { data } = image;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const value = luma(red, green, blue);

    // 1 = solid ink, 0 = paper, in between = edge of a stroke.
    const inkiness = Math.min(1, Math.max(0, (split + feather - value) / (2 * feather)));

    if (inkiness <= 0) {
      if (background === 'transparent') {
        data[index + 3] = 0;
      } else {
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 255;
      }
      continue;
    }

    if (keepInkColour) {
      // Deepen the pen colour without changing its hue, so blue stays blue.
      const boost = 0.35 + 0.65 * (1 - inkiness);
      data[index] = Math.round(red * boost);
      data[index + 1] = Math.round(green * boost);
      data[index + 2] = Math.round(blue * boost);
    } else {
      const ink = Math.round(255 * (1 - inkiness));
      data[index] = ink;
      data[index + 1] = ink;
      data[index + 2] = ink;
    }

    data[index + 3] = background === 'transparent' ? Math.round(255 * inkiness) : 255;
  }

  return image;
}

/**
 * The tightest box containing content, for trimming the paper margin off a signature or the
 * desk from around a certificate.
 *
 * `tolerance` is how far from the measured background a pixel must be to count as content, so a
 * faint paper texture does not defeat the trim. Returns `null` when the image is uniform —
 * nothing to trim, and returning a zero-size box would produce an empty file.
 */
export function contentBoundingBox(
  image: RgbaImage,
  options: { tolerance?: number; padding?: number } = {},
): { x: number; y: number; width: number; height: number } | null {
  const { tolerance = 24, padding = 0 } = options;
  const { data, width, height } = image;
  // The paper, measured rather than assumed — a scan of a grey certificate has no white in it.
  const backgroundLuma = percentileLuma(image, 0.9);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if ((data[index + 3] ?? 255) < 16) continue; // fully transparent is not content
      const value = luma(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
      if (Math.abs(value - backgroundLuma) <= tolerance) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  return {
    x,
    y,
    width: Math.min(width - x, maxX - minX + 1 + padding * 2),
    height: Math.min(height - y, maxY - minY + 1 + padding * 2),
  };
}

export type EnhanceOptions = {
  /** -100…+100 */
  brightness?: number;
  /** -100…+100 */
  contrast?: number;
  /** 0…100. Stretches the histogram so a dull phone scan reads as a scan. */
  clarity?: number;
  grayscale?: boolean;
};

/**
 * The "magic colour" pass operators expect from a scanner app, in place.
 *
 * Brightness and contrast are the ordinary controls. `clarity` is the one that does the work: it
 * re-maps the 2nd–98th percentile of the actual histogram onto 0–255, which is what turns a flat
 * grey phone photo of a marksheet into something with white paper and black print. Percentiles
 * rather than min/max, so one dark speck or one blown-out highlight cannot flatten the mapping.
 */
export function enhance(image: RgbaImage, options: EnhanceOptions = {}): RgbaImage {
  const { brightness = 0, contrast = 0, clarity = 0, grayscale = false } = options;
  const { data } = image;

  const low = clarity > 0 ? percentileLuma(image, 0.02) : 0;
  const high = clarity > 0 ? percentileLuma(image, 0.98) : 255;
  const span = Math.max(1, high - low);
  const clarityMix = Math.min(1, Math.max(0, clarity / 100));

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const brightnessShift = brightness * 2.55;

  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const raw = data[index + channel] ?? 0;
      const stretched = ((raw - low) / span) * 255;
      let value = raw * (1 - clarityMix) + stretched * clarityMix;
      value = (value - 128) * contrastFactor + 128 + brightnessShift;
      data[index + channel] = Math.min(255, Math.max(0, Math.round(value)));
    }
    if (grayscale) {
      const grey = Math.round(luma(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0));
      data[index] = grey;
      data[index + 1] = grey;
      data[index + 2] = grey;
    }
  }

  return image;
}

/**
 * How plausible it is that the subject is on the plain light background portals ask for.
 *
 * This is spec §13.2's "background check placeholder" and it is deliberately a hint, not a gate:
 * it samples the border ring of the image and reports how bright and how uniform it is. A real
 * segmentation model is out of scope, and a tool that silently rejected a valid photo would cost
 * an operator more than it saved.
 */
export function assessBackground(image: RgbaImage): {
  meanLuma: number;
  variation: number;
  verdict: 'plain_light' | 'busy' | 'dark';
} {
  const { data, width, height } = image;
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.06));
  const samples: number[] = [];

  const push = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    samples.push(luma(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0));
  };

  // Step through the border so a 4000 px photo does not cost 4000 samples per edge.
  const step = Math.max(1, Math.round(Math.min(width, height) / 120));
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < ring; y += step) {
      push(x, y);
      push(x, height - 1 - y);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < ring; x += step) {
      push(x, y);
      push(width - 1 - x, y);
    }
  }

  if (samples.length === 0) return { meanLuma: 255, variation: 0, verdict: 'plain_light' };

  const meanLuma = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - meanLuma) ** 2, 0) / samples.length;
  const variation = Math.sqrt(variance);

  const verdict = meanLuma < 140 ? 'dark' : variation > 34 ? 'busy' : 'plain_light';
  return { meanLuma, variation, verdict };
}
