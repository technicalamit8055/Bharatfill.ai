/**
 * The scanner's pure geometry: corner ordering, the document plausibility check, the auto-capture
 * steadiness rule, output sizing and frame-to-screen mapping.
 */

import { describe, expect, it } from 'vitest';

import {
  applyFrameAffine,
  clampPoint,
  cropView,
  fitContain,
  fitQuadInside,
  flattenedSize,
  fullFrameQuad,
  INITIAL_STABILITY,
  insetQuad,
  isConvex,
  isPlausibleDocument,
  MAX_STRAIGHTEN,
  maxCornerShift,
  nextRotation,
  nextStability,
  orderCorners,
  pageAspect,
  PHONE_FOCAL_SHARE,
  photoToView,
  type Point,
  previousRotation,
  type Quad,
  quadArea,
  rotatedSize,
  rotatePoint,
  rotateQuad,
  sameQuad,
  scaleQuad,
  steadyProgress,
  straightenedQuad,
  straightenFrame,
  viewDeltaToPhoto,
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

describe('insetQuad', () => {
  const centroid = { x: 100, y: 75 };

  it('pulls every corner towards the centroid by the given share', () => {
    const inset = insetQuad(PAGE, 0.1);
    inset.forEach((p, i) => {
      const before = PAGE[i] as { x: number; y: number };
      expect(Math.hypot(p.x - centroid.x, p.y - centroid.y)).toBeCloseTo(
        0.9 * Math.hypot(before.x - centroid.x, before.y - centroid.y),
      );
    });
  });

  it('keeps the corner order and the shape', () => {
    const inset = insetQuad(PAGE, 0.008);
    expect(orderCorners([inset[2], inset[0], inset[3], inset[1]])).toEqual(inset);
    expect(quadArea(inset)).toBeCloseTo(quadArea(PAGE) * 0.992 ** 2);
  });

  it('leaves the outline alone for a zero inset', () => {
    expect(insetQuad(PAGE, 0)).toEqual(PAGE);
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

  it('enlarges a small page to the target size', () => {
    expect(flattenedSize(fullFrameQuad({ width: 2000, height: 1500 }), 3000, 2)).toEqual({
      width: 3000,
      height: 2250,
    });
  });

  it('never enlarges by more than the upscale limit', () => {
    expect(flattenedSize(fullFrameQuad({ width: 800, height: 600 }), 3000, 2)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it('takes the true shape when given, stretching the foreshortened side back out', () => {
    // Looks 1000 × 1000, but is really twice as tall as it is wide.
    const size = flattenedSize(fullFrameQuad({ width: 1000, height: 1000 }), 5000, 1, 0.5);
    expect(size).toEqual({ width: 1000, height: 2000 });
  });
});

/** A 4032 × 3024 photo (portrait), as a phone's main camera takes it. */
const PHOTO = { width: 3024, height: 4032 };

/**
 * Where a `width` × `height` mm page's corners land in `PHOTO` through a pinhole camera of focal
 * length `focalShare` × 4032 px, `distance` mm away, tilted `pitch` degrees about the page's
 * horizontal axis (phone leaning over it), then `yaw` about its vertical axis and `roll` in plane.
 */
function photographed(
  width: number,
  height: number,
  { pitch = 0, yaw = 0, roll = 0, distance = 420, focalShare = PHONE_FOCAL_SHARE } = {},
): Quad {
  const rad = Math.PI / 180;
  const f = focalShare * Math.max(PHOTO.width, PHOTO.height);
  const corners: [number, number][] = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ];
  return corners.map(([x0, y0]) => {
    // Roll in the page plane, then pitch about x, then yaw about y.
    const x1 = x0 * Math.cos(roll * rad) - y0 * Math.sin(roll * rad);
    const y1 = x0 * Math.sin(roll * rad) + y0 * Math.cos(roll * rad);
    const y2 = y1 * Math.cos(pitch * rad);
    const z2 = y1 * Math.sin(pitch * rad);
    const x3 = x1 * Math.cos(yaw * rad) + z2 * Math.sin(yaw * rad);
    const z3 = -x1 * Math.sin(yaw * rad) + z2 * Math.cos(yaw * rad) + distance;
    return { x: PHOTO.width / 2 + (f * x3) / z3, y: PHOTO.height / 2 + (f * y2) / z3 };
  }) as unknown as Quad;
}

/** Width ÷ height the page appears to have from its edge lengths. */
function apparentAspect(quad: Quad): number {
  const [tl, tr, br, bl] = quad;
  const d = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  return Math.max(d(tl, tr), d(bl, br)) / Math.max(d(tl, bl), d(tr, br));
}

describe('pageAspect', () => {
  const RECEIPT = 148 / 216;

  it('recovers the true shape of a page photographed with the phone leaning over it', () => {
    const quad = photographed(148, 216, { pitch: 35 });
    // What sizing by edge lengths gave: a squashed page, round seals turned oval.
    expect(apparentAspect(quad) / RECEIPT).toBeGreaterThan(1.1);
    expect(pageAspect(quad, PHOTO) / RECEIPT).toBeCloseTo(1, 2);
  });

  it('recovers it when the page is also turned and leans sideways', () => {
    const quad = photographed(148, 216, { pitch: 25, yaw: -15, roll: 8 });
    expect(pageAspect(quad, PHOTO) / RECEIPT).toBeCloseTo(1, 2);
  });

  it('stays within a few percent on cameras wider or longer than assumed', () => {
    for (const focalShare of [0.66, 0.85]) {
      const quad = photographed(148, 216, { pitch: 30, focalShare, distance: 380 });
      expect(Math.abs(pageAspect(quad, PHOTO) / RECEIPT - 1)).toBeLessThan(0.04);
    }
  });

  it('keeps the edge lengths of a page seen straight on', () => {
    expect(pageAspect(fullFrameQuad({ width: 800, height: 600 }), PHOTO)).toBeCloseTo(4 / 3, 6);
  });

  it('keeps the apparent shape when the corners make no sense as a page', () => {
    // Far steeper than any page a phone photographs: a stray corner, not perspective.
    const wedge: Quad = [
      { x: 100, y: 100 },
      { x: 2900, y: 100 },
      { x: 1600, y: 3900 },
      { x: 1400, y: 3900 },
    ];
    expect(pageAspect(wedge, PHOTO)).toBeCloseTo(apparentAspect(wedge), 6);
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

describe('page rotation', () => {
  it('turns a quarter clockwise each time, back to upright after four', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });

  it('turns a quarter anticlockwise for Rotate left, undoing Rotate right', () => {
    expect(previousRotation(0)).toBe(270);
    expect(previousRotation(270)).toBe(180);
    expect(previousRotation(90)).toBe(0);
    for (const rotation of [0, 90, 180, 270] as const) {
      expect(previousRotation(nextRotation(rotation))).toBe(rotation);
    }
  });

  it('swaps width and height on a quarter turn only', () => {
    const page = { width: 1700, height: 2400 };
    expect(rotatedSize(page, 0)).toEqual(page);
    expect(rotatedSize(page, 90)).toEqual({ width: 2400, height: 1700 });
    expect(rotatedSize(page, 180)).toEqual(page);
    expect(rotatedSize(page, 270)).toEqual({ width: 2400, height: 1700 });
  });
});

describe('fitContain', () => {
  it('letterboxes a tall page in a wide box, centred', () => {
    expect(fitContain({ width: 400, height: 300 }, { width: 150, height: 300 })).toEqual({
      scale: 1,
      dx: 125,
      dy: 0,
    });
  });

  it('shrinks a large photo to fit', () => {
    const fit = fitContain({ width: 300, height: 300 }, { width: 3000, height: 1500 });
    expect(fit.scale).toBeCloseTo(0.1);
    expect(fit.dx).toBeCloseTo(0);
    expect(fit.dy).toBeCloseTo(75);
  });

  it('gives an empty fit for content with no size', () => {
    expect(fitContain({ width: 300, height: 300 }, { width: 0, height: 100 })).toEqual({
      scale: 0,
      dx: 0,
      dy: 0,
    });
  });
});

function expectClose(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('crop editor: turning and straightening', () => {
  const photo = { width: 1000, height: 1400 };
  const inside: Quad = [
    { x: 200, y: 300 },
    { x: 800, y: 300 },
    { x: 800, y: 1100 },
    { x: 200, y: 1100 },
  ];

  it('turns points clockwise on screen, where y grows downward', () => {
    expectClose(rotatePoint({ x: 1, y: 0 }, 90), { x: 0, y: 1 });
    expectClose(rotatePoint({ x: 0, y: 1 }, 90), { x: -1, y: 0 });
    expectClose(rotatePoint({ x: 20, y: 10 }, 180, { x: 10, y: 10 }), { x: 0, y: 10 });
  });

  it('leaves a quad already inside the photo alone', () => {
    expect(fitQuadInside(inside, photo)).toBe(inside);
  });

  it('shrinks a quad past the edge towards its centre, keeping its shape', () => {
    const wide: Quad = [
      { x: -100, y: 200 },
      { x: 1100, y: 200 },
      { x: 1100, y: 1200 },
      { x: -100, y: 1200 },
    ];
    const fitted = fitQuadInside(wide, photo);
    // Same centre, same proportions: 1200 wide scaled to 1000.
    const half = 500 * (1000 / 1200);
    expectClose(fitted[0], { x: 0, y: 700 - half });
    expectClose(fitted[2], { x: 1000, y: 700 + half });
  });

  it('keeps the crop where the citizen drew it while the dial turns the photo', () => {
    for (const degrees of [-MAX_STRAIGHTEN, -7.5, 0, 3.2, 20]) {
      const quad = straightenedQuad(inside, degrees, photo);
      expect(sameQuad(straightenFrame(quad, degrees, photo), inside), String(degrees)).toBe(true);
    }
  });

  it('turns the crop against the photo, so the flattened page comes out straightened', () => {
    const quad = straightenedQuad(inside, 10, photo);
    expect(sameQuad(quad, rotateQuad(inside, -10, { x: 500, y: 700 }))).toBe(true);
  });

  it('shrinks the whole photo to fit once straightened, as a camera app zooms in', () => {
    const whole = fullFrameQuad(photo);
    const quad = straightenedQuad(whole, 15, photo);
    for (const p of quad) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(photo.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(photo.height);
    }
    expect(quadArea(quad)).toBeLessThan(quadArea(whole));
    expect(isConvex(quad)).toBe(true);
  });

  it('fits the photo to the stage after its quarter turns, and never rescales for the dial', () => {
    const box = { width: 400, height: 300 };
    expect(cropView(box, photo, 0, 0).scale).toBeCloseTo(300 / 1400);
    const turned = cropView(box, photo, 90, 0);
    // Turned, the photo is 1400 wide: the stage's width now limits it.
    expect(turned.scale).toBeCloseTo(400 / 1400);
    expect(cropView(box, photo, 90, 30).scale).toBe(turned.scale);
    expect(cropView(box, photo, 0, 0, 20).scale).toBeCloseTo(260 / 1400);
  });

  it('maps photo corners onto the stage through the quarter turn', () => {
    const view = cropView({ width: 1400, height: 1000 }, photo, 90, 0);
    expect(view.scale).toBeCloseTo(1);
    // A quarter turn clockwise puts the photo's top-left at the stage's top-right.
    expectClose(photoToView({ x: 0, y: 0 }, view), { x: 1400, y: 0 });
    expectClose(photoToView({ x: 1000, y: 1400 }, view), { x: 0, y: 1000 });
    expectClose(photoToView({ x: 500, y: 700 }, view), { x: 700, y: 500 });
  });

  it('turns a finger movement back into photo pixels', () => {
    const view = cropView({ width: 700, height: 500 }, photo, 90, 0);
    // Half scale; with the photo turned clockwise, dragging right moves up the photo.
    expectClose(viewDeltaToPhoto({ x: 10, y: 0 }, view), { x: 0, y: -20 });
    expectClose(viewDeltaToPhoto({ x: 0, y: 10 }, view), { x: 20, y: 0 });

    const tilted = cropView({ width: 700, height: 500 }, photo, 0, 17);
    const start = { x: 300, y: 400 };
    const delta = viewDeltaToPhoto({ x: 12, y: -8 }, tilted);
    const from = photoToView(start, tilted);
    const to = photoToView({ x: start.x + delta.x, y: start.y + delta.y }, tilted);
    expectClose({ x: to.x - from.x, y: to.y - from.y }, { x: 12, y: -8 });
  });
});
