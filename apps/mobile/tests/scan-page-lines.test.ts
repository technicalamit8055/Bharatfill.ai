/**
 * Finding a page from straight edges: it must pick the paper's own edge over a table printed on
 * it, cope with a page filling or running off the frame, and find nothing in plain desk.
 */

import { describe, expect, it } from 'vitest';

import { maxCornerShift, type Point, type Quad } from '../lib/scan/geometry';
import {
  findPageFromLines,
  type GrayImage,
  hasPageEdges,
  refineQuad,
  type Segment,
} from '../lib/scan/page-lines';

const W = 320;
const H = 427;

function inside(quad: Quad, x: number, y: number): boolean {
  return [0, 1, 2, 3].every((i) => {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });
}

/** Deterministic desk grain, ±25 around a dark wood tone. */
function grain(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return 70 + 50 * (n - Math.floor(n) - 0.5);
}

/** A bright page on a grained desk, with a printed box and a black banner on the page. */
function scene(page: Quad, box: Quad): GrayImage {
  const pixels = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let v = grain(x, y);
      if (inside(page, x, y)) {
        v = 215;
        const onRule = inside(box, x, y) && !inside(shrink(box, 2), x, y);
        const inBanner =
          inside(box, x, y) && y > (box[0] as Point).y + 20 && y < (box[0] as Point).y + 40;
        if (onRule || inBanner) v = 35;
      }
      pixels[y * W + x] = Math.round(v);
    }
  }
  return { width: W, height: H, pixels };
}

function shrink(quad: Quad, by: number): Quad {
  const [tl, tr, br, bl] = quad;
  return [
    { x: tl.x + by, y: tl.y + by },
    { x: tr.x - by, y: tr.y + by },
    { x: br.x - by, y: br.y - by },
    { x: bl.x + by, y: bl.y - by },
  ];
}

/** An edge as a line detector returns it: short pieces, each a pixel or so off. */
function fragments(p: Point, q: Point, piece = 15): Segment[] {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  const out: Segment[] = [];
  for (let start = 0, i = 0; start + piece <= length; start += piece + 2, i += 1) {
    const t1 = start / length;
    const t2 = (start + piece) / length;
    const jitter = i % 2 === 0 ? 0.6 : -0.6;
    out.push({
      x1: Math.round(p.x + (q.x - p.x) * t1),
      y1: Math.round(p.y + (q.y - p.y) * t1 + jitter),
      x2: Math.round(p.x + (q.x - p.x) * t2),
      y2: Math.round(p.y + (q.y - p.y) * t2 - jitter),
    });
  }
  return out;
}

function outline(quad: Quad): Segment[] {
  return [0, 1, 2, 3].flatMap((i) => fragments(quad[i] as Point, quad[(i + 1) % 4] as Point));
}

/** Short random-looking segments, like desk grain gives a line detector. */
function deskNoise(): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < 150; i += 1) {
    const x = Math.round((grain(i, 3) + 50) * 2.5) % W;
    const y = Math.round((grain(7, i) + 50) * 3.3) % H;
    const angle = (grain(i, i) - 20) * 0.1;
    out.push({
      x1: x,
      y1: y,
      x2: Math.round(x + 12 * Math.cos(angle)),
      y2: Math.round(y + 12 * Math.sin(angle)),
    });
  }
  return out;
}

const PAGE: Quad = [
  { x: 44, y: 55 },
  { x: 279, y: 45 },
  { x: 292, y: 385 },
  { x: 32, y: 394 },
];
const BOX: Quad = [
  { x: 70, y: 90 },
  { x: 255, y: 90 },
  { x: 255, y: 350 },
  { x: 70, y: 350 },
];

describe('findPageFromLines', () => {
  it('finds the paper, not the table printed on it', () => {
    const image = scene(PAGE, BOX);
    const found = findPageFromLines([...outline(PAGE), ...outline(BOX), ...deskNoise()], image);
    expect(found).not.toBeNull();
    expect(maxCornerShift(found as Quad, PAGE)).toBeLessThanOrEqual(3);
  });

  it('finds a page that fills the frame almost to its edges', () => {
    const page: Quad = [
      { x: 6, y: 12 },
      { x: 312, y: 6 },
      { x: 316, y: 418 },
      { x: 3, y: 420 },
    ];
    const image = scene(page, BOX);
    const found = findPageFromLines([...outline(page), ...outline(BOX)], image);
    expect(found).not.toBeNull();
    expect(maxCornerShift(found as Quad, page)).toBeLessThanOrEqual(3);
  });

  it('uses the frame border for the side of a page running off the frame', () => {
    const page: Quad = [
      { x: 21, y: 32 },
      { x: 298, y: 26 },
      { x: 310, y: 480 },
      { x: 12, y: 486 },
    ];
    const image = scene(page, BOX);
    const visible = [
      ...fragments(page[0], page[1]),
      ...fragments(page[1], { x: 306, y: H - 1 }),
      ...fragments({ x: 16, y: H - 1 }, page[0]),
    ];
    const found = findPageFromLines([...visible, ...outline(BOX), ...deskNoise()], image);
    expect(found).not.toBeNull();
    const [tl, tr, br, bl] = found as Quad;
    expect(
      maxCornerShift(
        [tl, tr, br, bl],
        [page[0], page[1], { x: 306, y: H - 1 }, { x: 16, y: H - 1 }],
      ),
    ).toBeLessThanOrEqual(3);
  });

  it('finds nothing in plain desk', () => {
    const empty: Quad = [
      { x: -10, y: -10 },
      { x: -5, y: -10 },
      { x: -5, y: -5 },
      { x: -10, y: -5 },
    ];
    expect(findPageFromLines(deskNoise(), scene(empty, empty))).toBeNull();
  });
});

describe('hasPageEdges', () => {
  it('accepts the paper’s edge and rejects a printed box, which has paper on both sides', () => {
    const image = scene(PAGE, BOX);
    expect(hasPageEdges(PAGE, image)).toBe(true);
    expect(hasPageEdges(BOX, image)).toBe(false);
  });
});

describe('refineQuad', () => {
  const size = { width: W, height: H };

  it('moves each side onto the straight edge beside it', () => {
    const rough = PAGE.map((p) => ({ x: p.x + 4, y: p.y - 3 })) as unknown as Quad;
    const refined = refineQuad(rough, outline(PAGE), size);
    expect(maxCornerShift(refined, PAGE)).toBeLessThanOrEqual(1.5);
  });

  it('leaves a side alone when no edge runs along it', () => {
    const rough = PAGE.map((p) => ({ x: p.x + 4, y: p.y })) as unknown as Quad;
    expect(maxCornerShift(refineQuad(rough, [], size), rough)).toBeLessThan(1e-6);
  });
});
