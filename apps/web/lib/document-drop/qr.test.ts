/**
 * Tests for the QR encoder.
 *
 * A QR code cannot be eyeballed, and "it rendered something square" is not evidence. So every
 * assertion here checks the encoder against a figure from ISO/IEC 18004 that is written out in
 * this file independently — the total-codeword table, the published format-information strings,
 * the module counts — rather than against the encoder's own tables. A bug in the reservation
 * map or the mask is otherwise invisible until a citizen is standing at the counter with a
 * phone that will not scan.
 */

import { describe, expect, it } from 'vitest';
import {
  QrPayloadTooLargeError,
  countDataModules,
  encodeQr,
  formatInfoBits,
  generatorPolynomial,
  levelMSpec,
  qrToSvg,
  MASK_PREDICATES,
  functionPatternMap,
  reedSolomonRemainder,
  selectVersion,
} from './qr';

/** ISO/IEC 18004 Table 1 — total codewords (data + EC) per version. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;

/** ISO/IEC 18004 Table 1 — remainder bits that pad the data region, per version. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0] as const;

/** ISO/IEC 18004 Table C.1 — the published 15-bit format strings for level M, masks 0–7. */
const FORMAT_STRINGS_M = [
  '101010000010010',
  '101000100100101',
  '101111001111100',
  '101101101001011',
  '100010111111001',
  '100000011001110',
  '100111110010111',
  '100101010100000',
] as const;

const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

describe('level-M block table', () => {
  it.each(VERSIONS)('version %i accounts for every codeword the spec allots', (version) => {
    const spec = levelMSpec(version);
    expect(spec).toBeDefined();
    if (!spec) return;

    const blocks = spec.groups.reduce((sum, [count]) => sum + count, 0);
    const dataFromGroups = spec.groups.reduce((sum, [count, length]) => sum + count * length, 0);

    // The groups must add up to the declared data capacity, and data plus error correction must
    // land exactly on the spec's total — the two ways a transcribed table goes wrong.
    expect(dataFromGroups).toBe(spec.dataCodewords);
    expect(spec.dataCodewords + blocks * spec.ecCodewordsPerBlock).toBe(
      TOTAL_CODEWORDS[version - 1],
    );
  });
});

describe('reed-solomon', () => {
  it('produces a codeword sequence divisible by the generator polynomial', () => {
    // The defining property of the code: appending the remainder makes the whole message an
    // exact multiple of the generator. Checking that needs no memorised vector.
    const degree = 18;
    const data = Array.from({ length: 64 }, (_value, index) => (index * 37 + 11) % 256);
    const ecc = reedSolomonRemainder(data, degree);

    expect(ecc).toHaveLength(degree);
    expect(reedSolomonRemainder([...data, ...ecc], degree).every((byte) => byte === 0)).toBe(true);
  });

  it('builds a generator of the requested degree', () => {
    for (const degree of [10, 16, 18, 22, 24, 26]) {
      const generator = generatorPolynomial(degree);
      expect(generator).toHaveLength(degree + 1);
      // A monic polynomial: the leading coefficient of every QR generator is 1.
      expect(generator[0]).toBe(1);
    }
  });

  it('leaves an all-zero message with an all-zero remainder', () => {
    expect(reedSolomonRemainder([0, 0, 0, 0], 10).every((byte) => byte === 0)).toBe(true);
  });
});

describe('format information', () => {
  it.each(FORMAT_STRINGS_M.map((bits, mask) => [mask, bits] as const))(
    'mask %i matches the published format string',
    (mask, expected) => {
      expect(formatInfoBits(0b00, mask).toString(2).padStart(15, '0')).toBe(expected);
    },
  );
});

describe('reservation map', () => {
  it.each(VERSIONS)('version %i leaves exactly the data region free', (version) => {
    // 8 bits per codeword plus the version's remainder bits. If a finder, separator, timing
    // line, alignment square, format strip or version block is misplaced, this count moves.
    const total = TOTAL_CODEWORDS[version - 1] ?? 0;
    const remainder = REMAINDER_BITS[version - 1] ?? 0;
    expect(countDataModules(version)).toBe(total * 8 + remainder);
  });
});

describe('version selection', () => {
  it('picks the smallest version that fits the payload', () => {
    // Version 1-M holds 16 data codewords: 4 mode bits + 8 count bits + 8n ≤ 128.
    expect(selectVersion(1)).toBe(1);
    expect(selectVersion(14)).toBe(1);
    expect(selectVersion(15)).toBe(2);
    // A typical drop link is ~60 characters and must stay comfortably small and scannable.
    expect(selectVersion(60)).toBeLessThanOrEqual(4);
  });

  it('refuses a payload past the largest supported version', () => {
    expect(() => selectVersion(400)).toThrow(QrPayloadTooLargeError);
  });
});

describe('encodeQr', () => {
  const code = encodeQr('https://assistigo.test/drop/DROP-7429');

  it('sizes the matrix as 4·version + 17', () => {
    expect(code.size).toBe(code.version * 4 + 17);
    expect(code.modules).toHaveLength(code.size);
    expect(code.modules.every((row) => row.length === code.size)).toBe(true);
  });

  it('draws a finder pattern in each of the three corners', () => {
    const finder = (top: number, left: number): string =>
      Array.from({ length: 7 }, (_row, dy) =>
        Array.from({ length: 7 }, (_column, dx) =>
          code.modules[top + dy]?.[left + dx] ? '1' : '0',
        ).join(''),
      ).join('/');

    const expected = [
      '1111111',
      '1000001',
      '1011101',
      '1011101',
      '1011101',
      '1000001',
      '1111111',
    ].join('/');

    expect(finder(0, 0)).toBe(expected);
    expect(finder(0, code.size - 7)).toBe(expected);
    expect(finder(code.size - 7, 0)).toBe(expected);
  });

  it('separates each finder with a light ring', () => {
    for (let index = 0; index < 8; index += 1) {
      expect(code.modules[7]?.[index]).toBe(false);
      expect(code.modules[index]?.[7]).toBe(false);
    }
  });

  it('alternates the timing patterns', () => {
    for (let position = 8; position < code.size - 8; position += 1) {
      expect(code.modules[6]?.[position]).toBe(position % 2 === 0);
      expect(code.modules[position]?.[6]).toBe(position % 2 === 0);
    }
  });

  it('sets the fixed dark module', () => {
    expect(code.modules[code.size - 8]?.[8]).toBe(true);
  });

  it('encodes the chosen mask into both format strips, consistently', () => {
    // Read the format bits back out of copy one and copy two independently. They must decode to
    // the same published level-M string, which holds only if a real mask was chosen, the BCH
    // bits are right, and both strips were written in their own (different) arrangement.
    const bitOfCopyOne = (index: number): boolean =>
      index <= 5
        ? code.modules[index]?.[8] === true
        : index === 6
          ? code.modules[7]?.[8] === true
          : index === 7
            ? code.modules[8]?.[8] === true
            : index === 8
              ? code.modules[8]?.[7] === true
              : code.modules[8]?.[14 - index] === true;

    const bitOfCopyTwo = (index: number): boolean =>
      index < 8
        ? code.modules[8]?.[code.size - 1 - index] === true
        : code.modules[code.size - 15 + index]?.[8] === true;

    let copyOne = 0;
    let copyTwo = 0;
    for (let index = 14; index >= 0; index -= 1) {
      copyOne = (copyOne << 1) | (bitOfCopyOne(index) ? 1 : 0);
      copyTwo = (copyTwo << 1) | (bitOfCopyTwo(index) ? 1 : 0);
    }

    const asString = (value: number): string => value.toString(2).padStart(15, '0');

    expect(asString(copyOne)).toBe(asString(copyTwo));
    expect(FORMAT_STRINGS_M).toContain(asString(copyOne));
  });

  it('produces a roughly balanced light/dark split', () => {
    const dark = code.modules.flat().filter(Boolean).length;
    const ratio = dark / (code.size * code.size);
    // Mask selection exists to keep this near half; anything outside 35–65% means the penalty
    // scoring is not being applied.
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });
});

/**
 * Reads the payload back out of a finished matrix.
 *
 * This is the assertion that covers data placement, the mask, block splitting and codeword
 * interleaving together — nothing else in this file would notice a traversal that runs the
 * wrong way or an interleave that drops a block's last codeword.
 */
function decodePayload(code: ReturnType<typeof encodeQr>): string {
  const map = functionPatternMap(code.version);
  const isFunction = (row: number, column: number): boolean =>
    map[row * code.size + column] === 1;

  // Recover the mask from the format strip, then undo it.
  let format = 0;
  for (let index = 14; index >= 0; index -= 1) {
    const bit =
      index < 8
        ? code.modules[8]?.[code.size - 1 - index]
        : code.modules[code.size - 15 + index]?.[8];
    format = (format << 1) | (bit ? 1 : 0);
  }
  const mask = FORMAT_STRINGS_M.indexOf(
    format.toString(2).padStart(15, '0') as (typeof FORMAT_STRINGS_M)[number],
  );
  expect(mask).toBeGreaterThanOrEqual(0);

  const predicate = MASK_PREDICATES[mask];
  expect(predicate).toBeDefined();

  const bits: number[] = [];
  let upward = true;
  let right = code.size - 1;
  while (right >= 1) {
    if (right === 6) right = 5;
    for (let step = 0; step < code.size; step += 1) {
      const row = upward ? code.size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (column < 0 || isFunction(row, column)) continue;
        const dark = code.modules[row]?.[column] === true;
        const unmasked = predicate?.(row, column) ? !dark : dark;
        bits.push(unmasked ? 1 : 0);
      }
    }
    upward = !upward;
    right -= 2;
  }

  // Bits back to the interleaved codeword stream.
  const stream: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    let byte = 0;
    for (let index = 0; index < 8; index += 1) byte = (byte << 1) | (bits[offset + index] ?? 0);
    stream.push(byte);
  }

  // Undo the interleave: the data codewords were emitted column-wise across the blocks.
  const spec = levelMSpec(code.version);
  expect(spec).toBeDefined();
  if (!spec) return '';

  const blockLengths: number[] = [];
  for (const [count, length] of spec.groups) {
    for (let block = 0; block < count; block += 1) blockLengths.push(length);
  }

  const blocks: number[][] = blockLengths.map(() => []);
  let cursor = 0;
  const longest = Math.max(...blockLengths);
  for (let position = 0; position < longest; position += 1) {
    for (let block = 0; block < blockLengths.length; block += 1) {
      if (position >= (blockLengths[block] ?? 0)) continue;
      blocks[block]?.push(stream[cursor] ?? 0);
      cursor += 1;
    }
  }

  const data = blocks.flat();

  const read = (offset: number, length: number): number => {
    let value = 0;
    for (let index = 0; index < length; index += 1) {
      const byte = data[Math.floor((offset + index) / 8)] ?? 0;
      value = (value << 1) | ((byte >> (7 - ((offset + index) % 8))) & 1);
    }
    return value;
  };

  expect(read(0, 4)).toBe(0b0100); // byte mode
  const countBits = code.version < 10 ? 8 : 16;
  const length = read(4, countBits);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = read(4 + countBits + index * 8, 8);
  }
  return new TextDecoder().decode(bytes);
}

describe('round trip', () => {
  it.each([
    // A bare code off a standee, a single-block version.
    'DROP-7429',
    // The real WhatsApp deep link — long enough to cross into a multi-block version, which is
    // exactly where interleaving starts to matter.
    'https://wa.me/919000000000?text=START%20DROP-7429',
    'https://assistigo.test/drop/KSK829',
    // Two blocks of unequal length (version 8-M is 2×38 + 2×39), the awkward case.
    `https://assistigo.example.co.in/drop/${'A'.repeat(110)}`,
  ])('recovers %s from the finished matrix', (payload) => {
    expect(decodePayload(encodeQr(payload))).toBe(payload);
  });
});

describe('qrToSvg', () => {
  it('renders a self-contained svg with the quiet zone included', () => {
    const svg = qrToSvg('https://assistigo.test/drop/DROP-7429', { title: 'Scan me' });
    const { size } = encodeQr('https://assistigo.test/drop/DROP-7429');

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
    expect(svg).toContain('<title>Scan me</title>');
    expect(svg.endsWith('</svg>')).toBe(true);
    // One path of merged runs, not thousands of rects.
    expect(svg.match(/<path/g)).toHaveLength(1);
  });

  it('strips markup out of the accessible title', () => {
    const svg = qrToSvg('x', { title: '<script>alert(1)</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('<title>scriptalert(1)/script</title>');
  });

  it('honours an explicit pixel size', () => {
    expect(qrToSvg('x', { pixelSize: 240 })).toContain(' width="240" height="240"');
  });
});
