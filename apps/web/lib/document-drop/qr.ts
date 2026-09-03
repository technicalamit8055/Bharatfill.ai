/**
 * A QR encoder, byte mode, versions 1–10, error correction level M.
 *
 * Written out rather than taken from npm on purpose. The whole job is "turn a 60-character URL
 * into an SVG", it has to run in the browser (the modal re-renders the code every time the
 * operator switches channel) as well as on the server for the printable standee, and adding a
 * dependency to reach a well-specified 200-line algorithm buys nothing but supply-chain surface.
 *
 * ISO/IEC 18004. Level M (≈15% recovery) is the right trade for a code that will be scanned off
 * a glossy screen under a tube light and off a laminated card that will pick up scratches.
 *
 * Deliberately free of `server-only`: both surfaces need it.
 */

/** Error-correction blocks and capacity for level M, versions 1–10. */
type VersionSpec = {
  /** Total data codewords available to the payload, after error correction is set aside. */
  dataCodewords: number;
  /** Error-correction codewords per block. */
  ecCodewordsPerBlock: number;
  /** `[blockCount, dataCodewordsInEachOfThoseBlocks]` groups. */
  groups: readonly (readonly [number, number])[];
};

const VERSIONS_M: readonly VersionSpec[] = [
  { dataCodewords: 16, ecCodewordsPerBlock: 10, groups: [[1, 16]] },
  { dataCodewords: 28, ecCodewordsPerBlock: 16, groups: [[1, 28]] },
  { dataCodewords: 44, ecCodewordsPerBlock: 26, groups: [[1, 44]] },
  { dataCodewords: 64, ecCodewordsPerBlock: 18, groups: [[2, 32]] },
  { dataCodewords: 86, ecCodewordsPerBlock: 24, groups: [[2, 43]] },
  { dataCodewords: 108, ecCodewordsPerBlock: 16, groups: [[4, 27]] },
  { dataCodewords: 124, ecCodewordsPerBlock: 18, groups: [[4, 31]] },
  { dataCodewords: 154, ecCodewordsPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { dataCodewords: 182, ecCodewordsPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { dataCodewords: 216, ecCodewordsPerBlock: 26, groups: [[4, 43], [1, 44]] },
];

/** Alignment-pattern centre coordinates by version (1-indexed; version 1 has none). */
const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** BCH-protected version information, versions 7–10 (18 bits each). */
const VERSION_INFO: Readonly<Record<number, number>> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

/** Level M is `00`; the format bits are `01` followed by the mask. */
const FORMAT_EC_BITS_M = 0b00;

// ---------------------------------------------------------------------------
// GF(256) — the field QR's Reed-Solomon works over, x^8 + x^4 + x^3 + x^2 + 1
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255] ?? 0;
}

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[((LOG[a] ?? 0) + (LOG[b] ?? 0)) % 255] ?? 0;
}

/** The RS generator polynomial of the given degree, as coefficients high-order first. */
export function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let position = 0; position < poly.length; position += 1) {
      next[position] = (next[position] ?? 0) ^ (poly[position] ?? 0);
      next[position + 1] =
        (next[position + 1] ?? 0) ^ gfMultiply(poly[position] ?? 0, EXP[index] ?? 0);
    }
    poly = next;
  }
  return poly;
}

/** The remainder of `data · x^degree` divided by the generator — i.e. the EC codewords. */
export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ (remainder.shift() ?? 0);
    remainder.push(0);
    if (factor !== 0) {
      for (let index = 0; index < remainder.length; index += 1) {
        remainder[index] =
          (remainder[index] ?? 0) ^ gfMultiply(generator[index + 1] ?? 0, factor);
      }
    }
  }

  return remainder;
}

// ---------------------------------------------------------------------------
// Bit buffer
// ---------------------------------------------------------------------------

class BitBuffer {
  private readonly bits: number[] = [];

  put(value: number, length: number): void {
    for (let index = length - 1; index >= 0; index -= 1) {
      this.bits.push((value >>> index) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  /** Pads to a byte boundary and returns the codewords. */
  toCodewords(): number[] {
    const padded = [...this.bits];
    while (padded.length % 8 !== 0) padded.push(0);

    const out: number[] = [];
    for (let index = 0; index < padded.length; index += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | (padded[index + bit] ?? 0);
      out.push(byte);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export class QrPayloadTooLargeError extends Error {
  constructor(byteLength: number) {
    super(`payload of ${byteLength} bytes exceeds the largest supported QR version`);
    this.name = 'QrPayloadTooLargeError';
  }
}

/** Smallest version (1-indexed) whose level-M capacity holds this payload in byte mode. */
export function selectVersion(byteLength: number): number {
  for (let version = 1; version <= VERSIONS_M.length; version += 1) {
    const spec = VERSIONS_M[version - 1];
    if (!spec) continue;
    // 4 mode bits + the character-count field + the data itself, rounded up to whole codewords.
    const countBits = version < 10 ? 8 : 16;
    const needed = Math.ceil((4 + countBits + byteLength * 8) / 8);
    if (needed <= spec.dataCodewords) return version;
  }
  throw new QrPayloadTooLargeError(byteLength);
}

/** Data codewords for one payload: mode, length, bytes, terminator and the pad pattern. */
function buildDataCodewords(bytes: Uint8Array, version: number, spec: VersionSpec): number[] {
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // byte mode
  buffer.put(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) buffer.put(byte, 8);

  const capacityBits = spec.dataCodewords * 8;
  // Terminator, truncated if the payload lands flush against the capacity.
  buffer.put(0, Math.min(4, capacityBits - buffer.length));

  const codewords = buffer.toCodewords();
  // The specified alternating pad bytes, not zeroes: they keep the module distribution even.
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < spec.dataCodewords) {
    codewords.push(pads[padIndex % 2] ?? 0xec);
    padIndex += 1;
  }
  return codewords;
}

/** Splits into blocks, computes each block's EC, then interleaves both as the spec requires. */
function interleave(dataCodewords: readonly number[], spec: VersionSpec): number[] {
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (const [blockCount, blockLength] of spec.groups) {
    for (let block = 0; block < blockCount; block += 1) {
      const slice = dataCodewords.slice(offset, offset + blockLength);
      offset += blockLength;
      dataBlocks.push(slice);
      ecBlocks.push(reedSolomonRemainder(slice, spec.ecCodewordsPerBlock));
    }
  }

  const out: number[] = [];
  const longestData = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) {
      const value = block[index];
      if (value !== undefined) out.push(value);
    }
  }
  for (let index = 0; index < spec.ecCodewordsPerBlock; index += 1) {
    for (const block of ecBlocks) {
      const value = block[index];
      if (value !== undefined) out.push(value);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

type Matrix = {
  size: number;
  /** 1 = dark, 0 = light. */
  modules: Uint8Array;
  /** Function patterns and reserved areas, which data must skip and masking must not touch. */
  reserved: Uint8Array;
};

function createMatrix(size: number): Matrix {
  return { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
}

function set(matrix: Matrix, row: number, column: number, dark: boolean, reserve = true): void {
  const index = row * matrix.size + column;
  matrix.modules[index] = dark ? 1 : 0;
  if (reserve) matrix.reserved[index] = 1;
}

export function isDark(matrix: Matrix, row: number, column: number): boolean {
  if (row < 0 || column < 0 || row >= matrix.size || column >= matrix.size) return false;
  return matrix.modules[row * matrix.size + column] === 1;
}

function isReserved(matrix: Matrix, row: number, column: number): boolean {
  return matrix.reserved[row * matrix.size + column] === 1;
}

function drawFinder(matrix: Matrix, row: number, column: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const y = row + dy;
      const x = column + dx;
      if (y < 0 || x < 0 || y >= matrix.size || x >= matrix.size) continue;
      // The 7×7 concentric square, plus the light separator ring that -1..7 covers.
      const inRing =
        (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
        (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
        (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);
      set(matrix, y, x, inRing);
    }
  }
}

function drawAlignment(matrix: Matrix, version: number): void {
  const centres = ALIGNMENT_CENTRES[version - 1] ?? [];
  for (const row of centres) {
    for (const column of centres) {
      // The three finder corners already own these positions.
      const atFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === matrix.size - 7) ||
        (row === matrix.size - 7 && column === 6);
      if (atFinder) continue;

      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const ring = Math.max(Math.abs(dy), Math.abs(dx));
          set(matrix, row + dy, column + dx, ring !== 1);
        }
      }
    }
  }
}

function drawTiming(matrix: Matrix): void {
  for (let position = 8; position < matrix.size - 8; position += 1) {
    const dark = position % 2 === 0;
    if (!isReserved(matrix, 6, position)) set(matrix, 6, position, dark);
    if (!isReserved(matrix, position, 6)) set(matrix, position, 6, dark);
  }
}

/** Reserves the two format-information strips (written later, once the mask is chosen). */
function reserveFormatAreas(matrix: Matrix): void {
  for (let index = 0; index < 9; index += 1) {
    if (!isReserved(matrix, 8, index)) set(matrix, 8, index, false);
    if (!isReserved(matrix, index, 8)) set(matrix, index, 8, false);
  }
  for (let index = 0; index < 8; index += 1) {
    set(matrix, 8, matrix.size - 1 - index, false);
    set(matrix, matrix.size - 1 - index, 8, false);
  }
  // The dark module, fixed by the spec.
  set(matrix, matrix.size - 8, 8, true);
}

function reserveVersionAreas(matrix: Matrix, version: number): void {
  if (version < 7) return;
  const info = VERSION_INFO[version] ?? 0;
  for (let index = 0; index < 18; index += 1) {
    const bit = ((info >> index) & 1) === 1;
    set(matrix, Math.floor(index / 3), matrix.size - 11 + (index % 3), bit);
    set(matrix, matrix.size - 11 + (index % 3), Math.floor(index / 3), bit);
  }
}

/**
 * The 15-bit BCH(15,5) format string for a level and mask.
 *
 * Computed rather than looked up so the table in the test can check it independently — a
 * transcribed 32-entry table is exactly the kind of thing that is wrong in one cell.
 */
export function formatInfoBits(ecBits: number, mask: number): number {
  const data = (ecBits << 3) | mask;
  let value = data << 10;
  for (let index = 4; index >= 0; index -= 1) {
    if ((value >>> (index + 10)) & 1) value ^= 0b10100110111 << index;
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

/**
 * Writes the 15 format bits twice, in the two arrangements the spec fixes.
 *
 * Bit 0 is the least significant. Copy one wraps the top-left finder, running down column 8 and
 * then left along row 8; copy two runs left along row 8 from the right edge and then down
 * column 8 from the bottom. The two are not mirror images of each other, which is why they are
 * written out separately rather than derived from one loop.
 */
function drawFormatInfo(matrix: Matrix, mask: number): void {
  const bits = formatInfoBits(FORMAT_EC_BITS_M, mask);
  const bitAt = (index: number): boolean => ((bits >> index) & 1) === 1;
  const last = matrix.size - 1;

  for (let index = 0; index <= 5; index += 1) set(matrix, index, 8, bitAt(index));
  set(matrix, 7, 8, bitAt(6));
  set(matrix, 8, 8, bitAt(7));
  set(matrix, 8, 7, bitAt(8));
  for (let index = 9; index < 15; index += 1) set(matrix, 8, 14 - index, bitAt(index));

  for (let index = 0; index < 8; index += 1) set(matrix, 8, last - index, bitAt(index));
  for (let index = 8; index < 15; index += 1) {
    set(matrix, matrix.size - 15 + index, 8, bitAt(index));
  }

  // Written last so nothing above can clear it.
  set(matrix, matrix.size - 8, 8, true);
}

const MASKS: readonly ((row: number, column: number) => boolean)[] = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

/** Places the interleaved codewords along the spec's up/down column pairs, skipping reserves. */
function placeData(matrix: Matrix, codewords: readonly number[]): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  const nextBit = (): boolean => {
    if (bitIndex >= totalBits) {
      bitIndex += 1;
      // Remainder bits, which are light by definition.
      return false;
    }
    const byte = codewords[Math.floor(bitIndex / 8)] ?? 0;
    const bit = (byte >> (7 - (bitIndex % 8))) & 1;
    bitIndex += 1;
    return bit === 1;
  };

  let upward = true;
  let right = matrix.size - 1;
  while (right >= 1) {
    // The vertical timing pattern owns column 6, so the pairs to its left shift by one rather
    // than straddling it. Stepping to 5 here (instead of pairing 6 with 5) is what keeps a
    // column from being visited twice on the way down.
    if (right === 6) right = 5;

    for (let step = 0; step < matrix.size; step += 1) {
      const row = upward ? matrix.size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (column < 0 || isReserved(matrix, row, column)) continue;
        set(matrix, row, column, nextBit(), false);
      }
    }

    upward = !upward;
    right -= 2;
  }
}

function applyMask(matrix: Matrix, mask: number): void {
  const predicate = MASKS[mask];
  if (!predicate) return;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (isReserved(matrix, row, column)) continue;
      if (predicate(row, column)) {
        const index = row * matrix.size + column;
        matrix.modules[index] = matrix.modules[index] === 1 ? 0 : 1;
      }
    }
  }
}

/** The four penalty rules from the spec. Lower is a code scanners find easier. */
export function maskPenalty(matrix: Matrix): number {
  const { size } = matrix;
  let penalty = 0;

  // Rule 1 — runs of five or more same-coloured modules in a row or column.
  for (let line = 0; line < size; line += 1) {
    for (const horizontal of [true, false]) {
      let runColour = false;
      let runLength = 0;
      for (let position = 0; position < size; position += 1) {
        const dark = horizontal ? isDark(matrix, line, position) : isDark(matrix, position, line);
        if (position > 0 && dark === runColour) {
          runLength += 1;
          if (runLength === 5) penalty += 3;
          else if (runLength > 5) penalty += 1;
        } else {
          runColour = dark;
          runLength = 1;
        }
      }
    }
  }

  // Rule 2 — every 2×2 block of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const first = isDark(matrix, row, column);
      if (
        first === isDark(matrix, row, column + 1) &&
        first === isDark(matrix, row + 1, column) &&
        first === isDark(matrix, row + 1, column + 1)
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3 — the finder-lookalike 1:1:3:1:1 pattern with four light modules on either side.
  const pattern = [true, false, true, true, true, false, true];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      for (const horizontal of [true, false]) {
        const at = (offset: number): boolean =>
          horizontal ? isDark(matrix, row, column + offset) : isDark(matrix, row + offset, column);
        const limit = horizontal ? column + 7 <= size : row + 7 <= size;
        if (!limit) continue;
        if (!pattern.every((value, offset) => at(offset) === value)) continue;

        const lightBefore = [-4, -3, -2, -1].every((offset) => !at(offset));
        const lightAfter = [7, 8, 9, 10].every((offset) => !at(offset));
        if (lightBefore || lightAfter) penalty += 40;
      }
    }
  }

  // Rule 4 — deviation from an even split of dark and light.
  let dark = 0;
  for (let index = 0; index < matrix.modules.length; index += 1) {
    if (matrix.modules[index] === 1) dark += 1;
  }
  const ratio = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return penalty;
}

/**
 * The level-M block layout for a version, so the suite can check this file's table against the
 * spec's independent total-codeword figures rather than against itself.
 */
export function levelMSpec(version: number): VersionSpec | undefined {
  return VERSIONS_M[version - 1];
}

/**
 * How many modules the data region of a version actually has, counted off a real matrix.
 *
 * Exists for the test: it must equal `8 × total codewords + remainder bits`, which is the one
 * assertion that catches a wrong finder, separator, timing, alignment, format or version-info
 * reservation — the class of bug that produces a QR every scanner quietly refuses.
 */
export function countDataModules(version: number): number {
  const map = functionPatternMap(version);
  let free = 0;
  for (let index = 0; index < map.length; index += 1) {
    if (map[index] === 0) free += 1;
  }
  return free;
}

/**
 * Which modules of a version are function patterns rather than data, row-major, 1 = function.
 *
 * Exported for the suite's decoder, which reads the payload back out of a finished matrix. Safe
 * to lean on there because `countDataModules` has already checked this map against the spec's
 * codeword table, so a wrong map fails that test before it can mislead this one.
 */
export function functionPatternMap(version: number): Uint8Array {
  const size = version * 4 + 17;
  const matrix = createMatrix(size);
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, 0, size - 7);
  drawFinder(matrix, size - 7, 0);
  drawAlignment(matrix, version);
  drawTiming(matrix);
  reserveFormatAreas(matrix);
  reserveVersionAreas(matrix, version);
  return matrix.reserved;
}

/** The mask predicates, in spec order. Exported so the suite can undo one. */
export const MASK_PREDICATES = MASKS;

export type QrCode = {
  version: number;
  /** Module count per side, excluding the quiet zone. */
  size: number;
  /** `modules[row][column]`; true is dark. */
  modules: boolean[][];
};

/** Encodes text into a QR matrix, choosing the version and the lowest-penalty mask. */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = selectVersion(bytes.length);
  const spec = VERSIONS_M[version - 1];
  if (!spec) throw new QrPayloadTooLargeError(bytes.length);

  const codewords = interleave(buildDataCodewords(bytes, version, spec), spec);
  const size = version * 4 + 17;

  let best: { matrix: Matrix; penalty: number } | null = null;

  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const matrix = createMatrix(size);
    drawFinder(matrix, 0, 0);
    drawFinder(matrix, 0, size - 7);
    drawFinder(matrix, size - 7, 0);
    drawAlignment(matrix, version);
    drawTiming(matrix);
    reserveFormatAreas(matrix);
    reserveVersionAreas(matrix, version);
    placeData(matrix, codewords);
    applyMask(matrix, mask);
    drawFormatInfo(matrix, mask);

    const penalty = maskPenalty(matrix);
    if (!best || penalty < best.penalty) best = { matrix, penalty };
  }

  // `best` is set: MASKS is non-empty, so the loop above ran at least once.
  const chosen = best as { matrix: Matrix; penalty: number };

  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let column = 0; column < size; column += 1) line.push(isDark(chosen.matrix, row, column));
    modules.push(line);
  }

  return { version, size, modules };
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

export type QrSvgOptions = {
  /** Light modules of quiet zone. Four is the spec minimum and what scanners expect. */
  margin?: number;
  dark?: string;
  light?: string;
  /** Rendered pixel size. Omit to let the SVG scale to its container. */
  pixelSize?: number;
  /** Rendered into `<title>` for screen readers. */
  title?: string;
};

/**
 * A vector QR, as one `<path>` of module rectangles.
 *
 * `shape-rendering="crispEdges"` matters more than it looks: at the sizes a phone camera reads
 * this from, antialiased module edges are what turns a scan into three attempts.
 */
export function qrToSvg(text: string, options: QrSvgOptions = {}): string {
  const { size, modules } = encodeQr(text);
  const margin = options.margin ?? 4;
  const dark = options.dark ?? '#0f172a';
  const light = options.light ?? '#ffffff';
  const extent = size + margin * 2;

  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) {
    const line = modules[row] ?? [];
    let runStart: number | null = null;
    for (let column = 0; column <= size; column += 1) {
      const isModuleDark = column < size && line[column] === true;
      if (isModuleDark && runStart === null) runStart = column;
      // Runs are merged into one rect per horizontal stretch: an SVG with 5,000 one-module
      // rects is measurably slower to paint on the low-end laptops these centres run.
      if (!isModuleDark && runStart !== null) {
        parts.push(`M${runStart + margin} ${row + margin}h${column - runStart}v1h-${column - runStart}z`);
        runStart = null;
      }
    }
  }

  const dimensions = options.pixelSize
    ? ` width="${options.pixelSize}" height="${options.pixelSize}"`
    : '';
  const titleTag = options.title
    ? `<title>${options.title.replace(/[<>&]/g, '')}</title>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}"${dimensions}` +
    ` shape-rendering="crispEdges" role="img">${titleTag}` +
    `<rect width="${extent}" height="${extent}" fill="${light}"/>` +
    `<path fill="${dark}" d="${parts.join('')}"/>` +
    `</svg>`
  );
}
