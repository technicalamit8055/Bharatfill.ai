/**
 * Estimates how brightly the room lights the paper at every point of a page, from a small copy
 * of one channel. Dividing the page by it turns shadows, vignetting and bulb tints white while
 * ink, banners and photos keep their tone.
 *
 * Only paper counts towards the estimate: a cell is paper when it is nearly as bright as the
 * brightest paper around it. Everything else — text, black banners, passport photos, stamps —
 * is filled in from the paper around it, so a large dark area cannot drag the estimate down
 * and leave a bright halo or a washed-out grey where it should be black.
 *
 * Pure, so it is unit tested.
 */

export type GrayImage = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
};

/** Each output cell is the brightest of a `factor`×`factor` block: the paper between text. */
export function maxPool(image: GrayImage, factor: number): GrayImage {
  const width = Math.max(1, Math.floor(image.width / factor));
  const height = Math.max(1, Math.floor(image.height / factor));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      const y1 = Math.min(image.height, (y + 1) * factor);
      const x1 = Math.min(image.width, (x + 1) * factor);
      for (let sy = y * factor; sy < y1; sy += 1) {
        for (let sx = x * factor; sx < x1; sx += 1) {
          const v = image.pixels[sy * image.width + sx] as number;
          if (v > best) best = v;
        }
      }
      pixels[y * width + x] = best;
    }
  }
  return { width, height, pixels };
}

/**
 * Runs `filter` over every row, then every column, of a width×height image. `filter` reads a
 * line from `line` and writes its result into `out`, both of the line's length.
 */
function separable(
  values: Float32Array,
  width: number,
  height: number,
  filter: (line: Float32Array, out: Float32Array) => void,
): Float32Array {
  const rows = new Float32Array(values.length);
  const rowIn = new Float32Array(width);
  const rowOut = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    rowIn.set(values.subarray(y * width, (y + 1) * width));
    filter(rowIn, rowOut);
    rows.set(rowOut, y * width);
  }
  const result = new Float32Array(values.length);
  const colIn = new Float32Array(height);
  const colOut = new Float32Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) colIn[y] = rows[y * width + x] as number;
    filter(colIn, colOut);
    for (let y = 0; y < height; y += 1) result[y * width + x] = colOut[y] as number;
  }
  return result;
}

/**
 * Sliding maximum over a window of `radius` either side, borders clamped. Van Herk/Gil-Werman:
 * a constant number of comparisons per pixel whatever the radius, which matters on Hermes.
 */
function slidingMax(line: Float32Array, out: Float32Array, radius: number): void {
  const n = line.length;
  const size = 2 * radius + 1;
  const padded = n + 2 * radius;
  const at = (i: number) => line[Math.min(n - 1, Math.max(0, i - radius))] as number;
  const prefix = new Float32Array(padded);
  const suffix = new Float32Array(padded);
  for (let i = 0; i < padded; i += 1) {
    prefix[i] = i % size === 0 ? at(i) : Math.max(prefix[i - 1] as number, at(i));
  }
  for (let i = padded - 1; i >= 0; i -= 1) {
    suffix[i] =
      i === padded - 1 || (i + 1) % size === 0 ? at(i) : Math.max(suffix[i + 1] as number, at(i));
  }
  for (let i = 0; i < n; i += 1) {
    out[i] = Math.max(suffix[i] as number, prefix[i + size - 1] as number);
  }
}

/** Mean over a window of `radius` either side, borders clamped, by running sum. */
function boxMean(line: Float32Array, out: Float32Array, radius: number): void {
  const n = line.length;
  const at = (i: number) => line[Math.min(n - 1, Math.max(0, i))] as number;
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) sum += at(i);
  for (let i = 0; i < n; i += 1) {
    out[i] = sum / (2 * radius + 1);
    sum += at(i + radius + 1) - at(i - radius);
  }
}

function maxFilter(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  return separable(values, width, height, (line, out) => slidingMax(line, out, radius));
}

/**
 * Near-Gaussian blur: three box blurs in a row, sized so their spread matches `sigma`. Constant
 * work per pixel whatever the size, unlike a true Gaussian kernel.
 */
function gaussianBlur(
  values: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  const radius = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  let result = values;
  for (let pass = 0; pass < 3; pass += 1) {
    result = separable(result, width, height, (line, out) => boxMean(line, out, radius));
  }
  return result;
}

export type PaperLightOptions = {
  /** How far around a cell to look for the brightest paper, as a share of the longest side. */
  readonly neighbourhood: number;
  /** A cell at least this share of that brightest paper counts as paper; shadows do, ink does not. */
  readonly paperShare: number;
  /** Blur that fills small gaps (text, rules) from paper right next to them. */
  readonly nearSigma: number;
  /** Blur that fills large gaps (banners, photos) from paper further away. */
  readonly farSigma: number;
};

export const DEFAULT_PAPER_LIGHT: PaperLightOptions = {
  neighbourhood: 0.2,
  paperShare: 0.62,
  nearSigma: 0.012,
  farSigma: 0.1,
};

/**
 * How much the far estimate counts where there is paper nearby. Small, so the near estimate
 * wins wherever it has anything to go on, and the far one only fills large gaps.
 */
const FAR_WEIGHT = 0.03;

/**
 * The paper's lighting at every cell of `image` (a small copy of one channel, already
 * max-pooled so text is mostly gone). Same size as `image`.
 */
export function estimatePaperLight(
  image: GrayImage,
  options: PaperLightOptions = DEFAULT_PAPER_LIGHT,
): GrayImage {
  const { width, height } = image;
  const side = Math.max(width, height);
  const values = Float32Array.from(image.pixels);

  const localMax = maxFilter(
    values,
    width,
    height,
    Math.max(1, Math.round(options.neighbourhood * side)),
  );
  const masked = new Float32Array(values.length);
  const mask = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i] as number) >= options.paperShare * (localMax[i] as number)) {
      mask[i] = 1;
      masked[i] = values[i] as number;
    }
  }

  const nearValue = gaussianBlur(masked, width, height, Math.max(0.5, options.nearSigma * side));
  const nearWeight = gaussianBlur(mask, width, height, Math.max(0.5, options.nearSigma * side));
  const farValue = gaussianBlur(masked, width, height, Math.max(0.5, options.farSigma * side));
  const farWeight = gaussianBlur(mask, width, height, Math.max(0.5, options.farSigma * side));

  const pixels = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const weight = (nearWeight[i] as number) + FAR_WEIGHT * (farWeight[i] as number);
    const light =
      weight > 1e-6
        ? ((nearValue[i] as number) + FAR_WEIGHT * (farValue[i] as number)) / weight
        : (localMax[i] as number);
    pixels[i] = Math.round(Math.min(255, Math.max(1, light)));
  }
  return { width, height, pixels };
}
