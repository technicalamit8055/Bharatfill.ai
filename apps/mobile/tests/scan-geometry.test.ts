/**
 * The scanner's pure geometry: corner ordering, the document plausibility check, the auto-capture
 * steadiness rule, output sizing and frame-to-screen mapping.
 */

import { describe, expect, it } from 'vitest';

import {
  applyFrameAffine,
  clampPoint,
  flattenedSize,
  fullFrameQuad,
  INITIAL_STABILITY,
  isConvex,
  isPlausibleDocument,
  maxCornerShift,
  nextStability,
  orderCorners,
  type Quad,
  quadArea,
  scaleQuad,
  steadyProgress,
} from '../lib/scan/geometry';

const FRAME = { width: 200, height: 150 };
const PAGE: Quad = [
  { x: 40, y: 20 },
  { x: 160, y: 25 },
  { x: 155, y: 130 },
  { x: 45, y: 125 },
];

describe('orderCorners', () => {
  it('orders shuffled corners top-left, top-right, bottom-right, bottom-left', () => {
    const [tl, tr, br, bl] = PAGE;
    expect(orderCorners([br, tl, bl, tr])).toEqual(PAGE);
    expect(orderCorners([bl, br, tr, tl])).toEqual(PAGE);
  });

  it('handles a page tilted by 30 degrees', () => {
    const tilted = [
      { x: 60, y: 10 },
      { x: 170, y: 60 },
      { x: 130, y: 145 },
      { x: 20, y: 95 },
    ];
    const ordered = orderCorners([tilted[2], tilted[0], tilted[3], tilted[1]] as typeof tilted);
    expect(ordered?.[0]).toEqual({ x: 60, y: 10 });
    expect(ordered?.[2]).toEqual({ x: 130, y: 145 });
  });

  it('needs exactly four points', () => {
    expect(orderCorners(PAGE.slice(0, 3))).toBeNull();
  });
});

describe('quad measures', () => {
  it('computes the area of a rectangle', () => {
    expect(quadArea(fullFrameQuad(FRAME))).toBe(200 * 150);
  });

  it('tells convex from crossed outlines', () => {
    expect(isConvex(PAGE)).toBe(true);
    const [tl, tr, br, bl] = PAGE;
    expect(isConvex([tl, br, tr, bl])).toBe(false);
  });

  it('measures how far corners moved', () => {
    const moved = scaleQuad(PAGE, 1);
    expect(maxCornerShift(PAGE, moved)).toBe(0);
    const shifted = PAGE.map((p) => ({ x: p.x + 3, y: p.y + 4 })) as unknown as Quad;
    expect(maxCornerShift(PAGE, shifted)).toBe(5);
  });
});

describe('isPlausibleDocument', () => {
  it('accepts a page seen at a slight angle', () => {
    expect(isPlausibleDocument(PAGE, FRAME)).toBe(true);
  });

  it('rejects something too small to be the page', () => {
    const tiny: Quad = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ];
    expect(isPlausibleDocument(tiny, FRAME)).toBe(false);
  });

  it('accepts an ID card held at arm’s length', () => {
    // About 7% of the frame: the preview crops the frame, so this fills far more of the screen.
    const card: Quad = [
      { x: 70, y: 55 },
      { x: 130, y: 57 },
      { x: 129, y: 94 },
      { x: 69, y: 92 },
    ];
    expect(isPlausibleDocument(card, FRAME)).toBe(true);
  });

  it('rejects an outline with a corner on the frame edge', () => {
    // A desk plank, or a page cut off by the frame.
    const plank: Quad = [
      { x: 0, y: 40 },
      { x: 150, y: 42 },
      { x: 150, y: 110 },
      { x: 20, y: 108 },
    ];
    expect(isPlausibleDocument(plank, FRAME)).toBe(false);
    const cutOff = PAGE.map((p, i) => (i === 1 ? { x: p.x, y: 0 } : p)) as unknown as Quad;
    expect(isPlausibleDocument(cutOff, FRAME)).toBe(false);
  });

  it('rejects a sliver with impossible corner angles', () => {
    const sliver: Quad = [
      { x: 10, y: 10 },
      { x: 190, y: 60 },
      { x: 195, y: 140 },
      { x: 15, y: 30 },
    ];
    expect(isPlausibleDocument(sliver, FRAME)).toBe(false);
  });
});

describe('auto-capture steadiness', () => {
  it('starts counting when a page appears and keeps counting while it stays put', () => {
    const first = nextStability(INITIAL_STABILITY, PAGE, FRAME, 1000);
    expect(first.steadySince).toBe(1000);

    const nudged = PAGE.map((p) => ({ x: p.x + 1, y: p.y })) as unknown as Quad;
    const second = nextStability(first, nudged, FRAME, 1500);
    expect(second.steadySince).toBe(1000);
    expect(steadyProgress(second, 1450)).toBe(0.5);
    expect(steadyProgress(second, 2000)).toBe(1);
  });

  it('starts over when the page jumps', () => {
    const first = nextStability(INITIAL_STABILITY, PAGE, FRAME, 1000);
    const jumped = PAGE.map((p) => ({ x: p.x + 40, y: p.y })) as unknown as Quad;
    expect(nextStability(first, jumped, FRAME, 1500).steadySince).toBe(1500);
  });

  it('keeps counting through a brief miss', () => {
    const first = nextStability(INITIAL_STABILITY, PAGE, FRAME, 1000);
    const missed = nextStability(nextStability(first, null, FRAME, 1100), null, FRAME, 1200);
    expect(missed).toEqual({ quad: PAGE, steadySince: 1000, misses: 2 });

    const back = nextStability(missed, PAGE, FRAME, 1300);
    expect(back).toEqual({ quad: PAGE, steadySince: 1000, misses: 0 });
  });

  it('resets when the page stays lost', () => {
    let state = nextStability(INITIAL_STABILITY, PAGE, FRAME, 1000);
    for (let i = 1; i <= 3; i += 1) state = nextStability(state, null, FRAME, 1000 + i * 100);
    expect(state).toEqual(INITIAL_STABILITY);
    expect(steadyProgress(INITIAL_STABILITY, 5000)).toBe(0);
  });

  it('does not hold a page it never saw', () => {
    expect(nextStability(INITIAL_STABILITY, null, FRAME, 1000)).toEqual(INITIAL_STABILITY);
  });
});

describe('flattenedSize', () => {
  it('uses the longer of each pair of opposite edges', () => {
    expect(flattenedSize(fullFrameQuad({ width: 800, height: 600 }), 2400)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('scales large pages down to the cap, keeping the shape', () => {
    expect(flattenedSize(fullFrameQuad({ width: 4000, height: 3000 }), 2400)).toEqual({
      width: 2400,
      height: 1800,
    });
  });
});

describe('clampPoint', () => {
  it('keeps dragged corners on the photo', () => {
    expect(clampPoint({ x: -5, y: 400 }, { width: 300, height: 200 })).toEqual({ x: 0, y: 200 });
  });
});

describe('applyFrameAffine', () => {
  const size = { width: 640, height: 480 };

  it('maps an upright frame onto a scaled preview', () => {
    const map = { size, origin: { x: 0, y: 0 }, xEnd: { x: 320, y: 0 }, yEnd: { x: 0, y: 240 } };
    expect(applyFrameAffine({ x: 320, y: 240 }, map)).toEqual({ x: 160, y: 120 });
  });

  it('maps a sensor frame rotated 90 degrees clockwise', () => {
    // A landscape sensor frame shown in portrait: the frame's x axis runs down the screen.
    const map = { size, origin: { x: 480, y: 0 }, xEnd: { x: 480, y: 640 }, yEnd: { x: 0, y: 0 } };
    expect(applyFrameAffine({ x: 0, y: 0 }, map)).toEqual({ x: 480, y: 0 });
    expect(applyFrameAffine({ x: 640, y: 480 }, map)).toEqual({ x: 0, y: 640 });
    expect(applyFrameAffine({ x: 320, y: 120 }, map)).toEqual({ x: 360, y: 320 });
  });
});
