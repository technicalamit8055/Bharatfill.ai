/**
 * Pure geometry for the in-app document scanner: ordering a detected page's four corners,
 * judging whether a quadrilateral is plausibly a document, deciding when the camera has held
 * steady long enough to auto-capture, and sizing the flattened output.
 *
 * No OpenCV, React Native or camera code here, so all of it is unit tested.
 */

export type Point = { readonly x: number; readonly y: number };

/** A page outline, always ordered top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];

export type Size = { readonly width: number; readonly height: number };

/**
 * Puts four corners in top-left, top-right, bottom-right, bottom-left order, whatever order a
 * contour finder returned them in. Uses the centroid, so it also works for strongly tilted pages.
 */
export function orderCorners(points: readonly Point[]): Quad | null {
  if (points.length !== 4) return null;

  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;
  const byAngle = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );

  // Angles run clockwise on screen (y grows downward), starting from the left. The top-left
  // corner is the one with the smallest x + y.
  let start = 0;
  byAngle.forEach((p, i) => {
    const best = byAngle[start] as Point;
    if (p.x + p.y < best.x + best.y) start = i;
  });
  const rotated = [...byAngle.slice(start), ...byAngle.slice(0, start)];
  const [tl, tr, br, bl] = rotated as [Point, Point, Point, Point];
  return [tl, tr, br, bl];
}

/** Area of a quadrilateral (shoelace formula), always positive. */
export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function isConvex(quad: Quad): boolean {
  const signs = [0, 1, 2, 3].map((i) =>
    Math.sign(cross(quad[i] as Point, quad[(i + 1) % 4] as Point, quad[(i + 2) % 4] as Point)),
  );
  return signs.every((s) => s !== 0 && s === signs[0]);
}

/** Interior angle at `b`, in degrees. */
function angleAt(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

export type PlausibilityOptions = {
  /**
   * Smallest share of the frame the page must cover. Low enough for an ID card at arm's length:
   * the camera frame is wider than the cropped preview, so a card filling a fifth of the screen
   * covers well under a tenth of the frame.
   */
  readonly minAreaRatio: number;
  /** Corners sharper or flatter than this are a table edge or a fold, not a page corner. */
  readonly minCornerAngle: number;
  readonly maxCornerAngle: number;
  /**
   * Corners closer than this share of the frame's width or height to its edge. A page cut off by
   * the frame cannot be scanned whole, and a table edge or desk plank always runs off the frame.
   */
  readonly borderMargin: number;
};

export const DEFAULT_PLAUSIBILITY: PlausibilityOptions = {
  minAreaRatio: 0.05,
  minCornerAngle: 45,
  maxCornerAngle: 135,
  borderMargin: 0.015,
};

/**
 * Whether a detected outline is plausibly a document: convex, big enough, clear of the frame's
 * edge, and with corners a page seen at an angle could have. Filters out shadows, table edges
 * and half-visible pages.
 */
export function isPlausibleDocument(
  quad: Quad,
  frame: Size,
  options: PlausibilityOptions = DEFAULT_PLAUSIBILITY,
): boolean {
  if (!isConvex(quad)) return false;
  if (quadArea(quad) < options.minAreaRatio * frame.width * frame.height) return false;

  const marginX = options.borderMargin * frame.width;
  const marginY = options.borderMargin * frame.height;
  const touchesEdge = quad.some(
    (p) =>
      p.x <= marginX ||
      p.y <= marginY ||
      p.x >= frame.width - 1 - marginX ||
      p.y >= frame.height - 1 - marginY,
  );
  if (touchesEdge) return false;

  return [0, 1, 2, 3].every((i) => {
    const angle = angleAt(quad[(i + 3) % 4] as Point, quad[i] as Point, quad[(i + 1) % 4] as Point);
    return angle >= options.minCornerAngle && angle <= options.maxCornerAngle;
  });
}

export function scaleQuad(quad: Quad, sx: number, sy: number = sx): Quad {
  return quad.map((p) => ({ x: p.x * sx, y: p.y * sy })) as unknown as Quad;
}

/** Largest distance any corner moved between two outlines. */
export function maxCornerShift(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => distance(p, b[i] as Point)));
}

/** The whole frame as a quad: the fallback crop when no page was found. */
export function fullFrameQuad(size: Size): Quad {
  return [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height },
  ];
}

/**
 * Pixel size of the flattened page: the longer of each pair of opposite edges, scaled down so
 * the longest side is at most `maxSide` (portal uploads have size limits, and bigger buys
 * nothing for text).
 */
export function flattenedSize(quad: Quad, maxSide: number): Size {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Keeps a point inside `size`, for corner handles dragged past the photo's edge. */
export function clampPoint(point: Point, size: Size): Point {
  return {
    x: Math.min(size.width, Math.max(0, point.x)),
    y: Math.min(size.height, Math.max(0, point.y)),
  };
}

// ---- Auto-capture ----------------------------------------------------------------------------

export type StabilityState = {
  readonly quad: Quad | null;
  /** When the current steady stretch began, in ms; null while nothing steady is in view. */
  readonly steadySince: number | null;
  /** Detections in a row that missed the page while it was being held. */
  readonly misses: number;
};

export const INITIAL_STABILITY: StabilityState = { quad: null, steadySince: null, misses: 0 };

export type StabilityOptions = {
  /** How far (as a share of the frame's diagonal) a corner may drift and still count as steady. */
  readonly maxShiftRatio: number;
  /** How long the page must stay steady before the shutter fires. */
  readonly holdMs: number;
  /**
   * Detections in a row that may miss the page (a blurred frame, a flash of glare) before it
   * counts as lost. Without this, one bad frame in the hold restarts the countdown.
   */
  readonly maxMisses: number;
};

export const DEFAULT_STABILITY: StabilityOptions = {
  maxShiftRatio: 0.03,
  holdMs: 900,
  maxMisses: 2,
};

/**
 * Folds one detection into the auto-capture state. The page counts as steady while every corner
 * stays within `maxShiftRatio` of where it was; a big jump, or losing the page for more than
 * `maxMisses` detections, starts over.
 */
export function nextStability(
  state: StabilityState,
  quad: Quad | null,
  frame: Size,
  now: number,
  options: StabilityOptions = DEFAULT_STABILITY,
): StabilityState {
  if (!quad) {
    return state.quad && state.misses < options.maxMisses
      ? { ...state, misses: state.misses + 1 }
      : INITIAL_STABILITY;
  }
  if (!state.quad || state.steadySince === null) return { quad, steadySince: now, misses: 0 };

  const limit = options.maxShiftRatio * Math.hypot(frame.width, frame.height);
  return maxCornerShift(state.quad, quad) <= limit
    ? { quad, steadySince: state.steadySince, misses: 0 }
    : { quad, steadySince: now, misses: 0 };
}

/** Progress towards auto-capture, 0–1, for the ring around the shutter. */
export function steadyProgress(
  state: StabilityState,
  now: number,
  options: StabilityOptions = DEFAULT_STABILITY,
): number {
  if (state.steadySince === null) return 0;
  return Math.min(1, Math.max(0, (now - state.steadySince) / options.holdMs));
}

// ---- Mapping frame points onto the screen ----------------------------------------------------

/**
 * An affine map fixed by where three corners of a frame land: `origin` is where (0, 0) goes,
 * `xEnd` where (width, 0) goes and `yEnd` where (0, height) goes. Covers the rotation and
 * mirroring between the camera's sensor-oriented frames and the upright preview.
 */
export type FrameAffine = {
  readonly size: Size;
  readonly origin: Point;
  readonly xEnd: Point;
  readonly yEnd: Point;
};

export function applyFrameAffine(point: Point, map: FrameAffine): Point {
  const u = point.x / map.size.width;
  const v = point.y / map.size.height;
  return {
    x: map.origin.x + u * (map.xEnd.x - map.origin.x) + v * (map.yEnd.x - map.origin.x),
    y: map.origin.y + u * (map.xEnd.y - map.origin.y) + v * (map.yEnd.y - map.origin.y),
  };
}
