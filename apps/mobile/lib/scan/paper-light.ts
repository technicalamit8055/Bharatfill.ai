/**
 * Estimates how brightly the room lights the paper at every point of a page, from a small copy
 * of one channel. Dividing the page by it turns shadows, vignetting and bulb tints white while
 * ink, banners and photos keep their tone.
 *
 * Only paper counts towards the estimate: a cell is paper when it is nearly as bright as the
 * brightest paper around it. Everything else — text, black banners, passport photos, stamps —
 * is filled in from the paper around it, so a large dark area cannot drag the estimate down
 * and leave a bright halo or a washed-out grey where it should be black. Light print is as
 * bright as a shadow, so it is told apart by its shape instead: a crisp-edged island inside the
 * page (`printedPatches`).
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
 * How many pixels a side of a copy `side` long `maxPool` should fold into one cell to leave a
 * grid about `gridSide` long. At least 2, so a copy already at grid size still loses its text.
 *
 * The finer the copy pooled from, the finer the marks the estimate sees through: the brightest
 * pixel of a block is the paper between a seal's rings or a stamp's strokes as long as the copy
 * still shows that paper, so the mark never darkens the estimate and is not divided out with
 * the shadows. Averaged down to grid size first, the same mark is a flat grey patch that looks
 * like one.
 */
export function poolFactor(side: number, gridSide: number): number {
  if (!(side > 0) || !(gridSide > 0)) return 2;
  return Math.max(2, Math.round(side / gridSide));
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
  /**
   * Paper-bright cells under this share of the brightest paper around them are dim: a shadow,
   * or a light printed area (a faint seal, a shaded table row, a photo's pale backdrop). Which
   * of the two is decided patch by patch (`printedPatches`).
   */
  readonly dimShare: number;
  /**
   * Neighbouring dim cells whose brightness differs by more than this share of the brighter one
   * belong to different patches: the edge of a seal lying in a shadow. A share, so the same
   * edge counts the same in shadow as in light.
   */
  readonly seam: number;
  /** A drop of more than this share of the brighter cell, within one cell, is a crisp step. */
  readonly crispStep: number;
  /**
   * A dim patch is print when at least this share of its border with paper is a crisp step.
   * Print ends at a line; a shadow fades over many cells. Well under 1, as a seal's edge cuts
   * through cells and blurs some of its steps.
   */
  readonly crispShare: number;
  /** A dim patch this close to the page's edge (a share of the longest side) is a shadow. */
  readonly edgeMargin: number;
  /** A dim patch covering more than this share of the page is a shadow. */
  readonly maxPrintShare: number;
};

export const DEFAULT_PAPER_LIGHT: PaperLightOptions = {
  neighbourhood: 0.2,
  paperShare: 0.62,
  nearSigma: 0.012,
  farSigma: 0.1,
  dimShare: 0.92,
  seam: 0.03,
  crispStep: 0.06,
  crispShare: 0.5,
  edgeMargin: 0.01,
  maxPrintShare: 0.25,
};

/**
 * Marks (with 1) the dim cells that are print, not shadow. Both are a little darker than the
 * paper around them, so brightness alone cannot tell them apart; their shape can. Dim cells are
 * grouped into patches, a crisp step between two neighbours (`seam`) keeping them apart, so a
 * seal lying in a shadow is a patch of its own. A patch is print when it is an island inside the
 * page whose edge is crisp: a seal, a shaded table row or a photo's pale backdrop stops at a
 * line. A shadow fades out over many cells, or is cast from outside the page and so reaches its
 * edge. A patch walled in by ink on every side (a face inside a dark photo) is print too.
 *
 * When in doubt a patch stays a shadow and is whitened, as every dim patch was before this
 * check. Taking a shadow for print leaves it only as much darker as the step at its edge, which
 * for anything but a hard-edged shadow lying wholly inside the page is next to nothing.
 *
 * `values` is each cell's brightness and `ratio` that as a share of the brightest paper around
 * it.
 */
function printedPatches(
  values: Float32Array,
  ratio: Float32Array,
  width: number,
  height: number,
  options: PaperLightOptions,
): Uint8Array {
  const total = width * height;
  const print = new Uint8Array(total);
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  const isDim = (i: number) => {
    const r = ratio[i] as number;
    return r >= options.paperShare && r < options.dimShare;
  };
  const margin = Math.max(1, Math.round(options.edgeMargin * Math.max(width, height)));
  const maxCells = options.maxPrintShare * total;

  for (let start = 0; start < total; start += 1) {
    if (seen[start] === 1 || !isDim(start)) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    seen[start] = 1;
    let atEdge = false;
    // The patch's border with paper, in cell sides, and how many of them are a crisp step up.
    let border = 0;
    let crisp = 0;

    while (head < tail) {
      const i = queue[head] as number;
      head += 1;
      const x = i % width;
      const y = (i - x) / width;
      if (x < margin || y < margin || x >= width - margin || y >= height - margin) atEdge = true;
      const own = values[i] as number;
      for (let side = 0; side < 4; side += 1) {
        const nx = x + (side === 0 ? -1 : side === 1 ? 1 : 0);
        const ny = y + (side === 2 ? -1 : side === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        const other = values[n] as number;
        if (isDim(n) && Math.abs(other - own) <= options.seam * Math.max(other, own)) {
          if (seen[n] === 0) {
            seen[n] = 1;
            queue[tail] = n;
            tail += 1;
          }
        } else if ((ratio[n] as number) >= options.paperShare) {
          border += 1;
          if (other - own > options.crispStep * other) crisp += 1;
        }
      }
    }

    if (atEdge || tail > maxCells) continue;
    if (border > 0 && crisp < options.crispShare * border) continue;
    for (let k = 0; k < tail; k += 1) print[queue[k] as number] = 1;
  }
  return print;
}

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
  const ratio = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    ratio[i] = (values[i] as number) / Math.max(1, localMax[i] as number);
  }
  const print = printedPatches(values, ratio, width, height, options);

  const masked = new Float32Array(values.length);
  const mask = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    if ((ratio[i] as number) >= options.paperShare && print[i] === 0) {
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
