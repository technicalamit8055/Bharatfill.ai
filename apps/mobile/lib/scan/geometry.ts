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

/** Quarter turns a reviewed page can be given, clockwise, in degrees. */
export const PAGE_ROTATIONS = [0, 90, 180, 270] as const;
export type PageRotation = (typeof PAGE_ROTATIONS)[number];

/** One more quarter turn clockwise: what Rotate on the review screen does. */
export function nextRotation(rotation: PageRotation): PageRotation {
  return PAGE_ROTATIONS[(PAGE_ROTATIONS.indexOf(rotation) + 1) % PAGE_ROTATIONS.length] ?? 0;
}

/** One quarter turn anticlockwise: Rotate left in the crop editor. */
export function previousRotation(rotation: PageRotation): PageRotation {
  const index = PAGE_ROTATIONS.indexOf(rotation);
  return PAGE_ROTATIONS[(index + PAGE_ROTATIONS.length - 1) % PAGE_ROTATIONS.length] ?? 0;
}

/** A size after a rotation: a quarter turn swaps width and height. */
export function rotatedSize(size: Size, rotation: PageRotation): Size {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

/** Where content lands when drawn letterboxed ("contain") and centred in a box. */
export type Fit = { readonly scale: number; readonly dx: number; readonly dy: number };

export function fitContain(box: Size, content: Size): Fit {
  if (content.width <= 0 || content.height <= 0) return { scale: 0, dx: 0, dy: 0 };
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return {
    scale,
    dx: (box.width - content.width * scale) / 2,
    dy: (box.height - content.height * scale) / 2,
  };
}

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

/**
 * Pulls every corner `ratio` of the way towards the centroid. An auto-detected outline tends to
 * sit on or just past the paper's edge; a small inset keeps the desk and the page's edge shadow
 * out of the flattened scan.
 */
export function insetQuad(quad: Quad, ratio: number): Quad {
  if (ratio <= 0) return quad;
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4;
  return quad.map((p) => ({
    x: p.x + (cx - p.x) * ratio,
    y: p.y + (cy - p.y) * ratio,
  })) as unknown as Quad;
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
 * Focal length of a phone's main camera as a share of the photo's longer side: 24–28 mm
 * equivalent on a 4:3 sensor. What `pageAspect` assumes; a few percent off moves the page's
 * shape by far less.
 */
export const PHONE_FOCAL_SHARE = 0.75;

/**
 * Past this factor between the corrected and the apparent shape, the outline is more likely
 * wrong (a stray corner) than the page steeply tilted, and the apparent shape is kept.
 */
const MAX_ASPECT_CORRECTION = 1.6;

type Vec3 = readonly [number, number, number];

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * The page's real width ÷ height. A page photographed at an angle looks shorter in the
 * direction it leans away, so its edge lengths in the photo misstate its shape: a round seal
 * comes out oval. The four corners of a rectangle seen through a pinhole camera fix its true
 * shape once the focal length is known (Zhang & He, "Whiteboard scanning and image
 * enhancement"). The optical centre is taken as the middle of `frame`, the photo the corners
 * are in, and the focal length as `focalShare` of its longer side.
 */
export function pageAspect(
  quad: Quad,
  frame: Size,
  focalShare: number = PHONE_FOCAL_SHARE,
): number {
  const [tl, tr, br, bl] = quad;
  const apparent =
    Math.max(distance(tl, tr), distance(bl, br)) /
    Math.max(distance(tl, bl), distance(tr, br), 1e-9);

  const at = (p: Point): Vec3 => [p.x - frame.width / 2, p.y - frame.height / 2, 1];
  const m1 = at(tl);
  const m2 = at(tr);
  const m3 = at(bl);
  const m4 = at(br);
  const k2 = dot3(cross3(m1, m4), m3) / dot3(cross3(m2, m4), m3);
  const k3 = dot3(cross3(m1, m4), m2) / dot3(cross3(m3, m4), m2);
  // The page's edge directions in camera space, up to the focal length.
  const across: Vec3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const down: Vec3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

  const f = focalShare * Math.max(frame.width, frame.height);
  const aspect = Math.sqrt(
    (across[0] ** 2 + across[1] ** 2 + (f * across[2]) ** 2) /
      (down[0] ** 2 + down[1] ** 2 + (f * down[2]) ** 2),
  );
  if (!Number.isFinite(aspect) || aspect <= 0) return apparent;
  const correction = aspect / apparent;
  return correction > MAX_ASPECT_CORRECTION || correction < 1 / MAX_ASPECT_CORRECTION
    ? apparent
    : aspect;
}

/**
 * Pixel size of the flattened page, scaled so the longest side is `longSide`. Its shape is
 * `aspect` (width ÷ height, from `pageAspect`) when given, else the longer of each pair of
 * opposite edges. A page smaller than that in the photo is enlarged by at most `maxUpscale`
 * (1, the default, never enlarges), since enlarging only spreads the pixels the camera caught.
 */
export function flattenedSize(quad: Quad, longSide: number, maxUpscale = 1, aspect?: number): Size {
  const [tl, tr, br, bl] = quad;
  let width = Math.max(distance(tl, tr), distance(bl, br));
  let height = Math.max(distance(tl, bl), distance(tr, br));
  if (aspect !== undefined && aspect > 0) {
    // Stretch the foreshortened direction back out rather than shrink the other.
    width = Math.max(width, height * aspect);
    height = width / aspect;
  }
  const scale = Math.min(Math.max(1, maxUpscale), longSide / Math.max(width, height, 1));
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

// ---- Crop editor: turning and straightening --------------------------------------------------

/** How far the straighten dial turns the photo either way, in degrees. */
export const MAX_STRAIGHTEN = 45;

/** Turns `point` `degrees` clockwise on screen (y grows downward) about `pivot`. */
export function rotatePoint(point: Point, degrees: number, pivot: Point = { x: 0, y: 0 }): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return { x: pivot.x + x * cos - y * sin, y: pivot.y + x * sin + y * cos };
}

export function rotateQuad(quad: Quad, degrees: number, pivot: Point): Quad {
  return quad.map((p) => rotatePoint(p, degrees, pivot)) as unknown as Quad;
}

function photoCentre(size: Size): Point {
  return { x: size.width / 2, y: size.height / 2 };
}

/**
 * Shrinks `quad` towards its centroid, keeping its shape, just enough that every corner is
 * inside `size`. A quad already inside comes back unchanged.
 */
export function fitQuadInside(quad: Quad, size: Size): Quad {
  const centroid = clampPoint(
    {
      x: quad.reduce((sum, p) => sum + p.x, 0) / 4,
      y: quad.reduce((sum, p) => sum + p.y, 0) / 4,
    },
    size,
  );
  // Floating-point slack: a quad turned there and back again must count as inside.
  const slack = 1e-6;
  let scale = 1;
  const limit = (at: number, centre: number, max: number) => {
    if (at > max + slack) scale = Math.min(scale, (max - centre) / (at - centre));
    else if (at < -slack) scale = Math.min(scale, centre / (centre - at));
  };
  for (const p of quad) {
    limit(p.x, centroid.x, size.width);
    limit(p.y, centroid.y, size.height);
  }
  if (scale >= 1) return quad;
  return quad.map((p) =>
    clampPoint(
      {
        x: centroid.x + (p.x - centroid.x) * scale,
        y: centroid.y + (p.y - centroid.y) * scale,
      },
      size,
    ),
  ) as unknown as Quad;
}

/**
 * The crop to flatten when the photo is straightened by `degrees`. `frame` is the crop as the
 * citizen sees it on the photo turned by `degrees` about its centre; the dial turns the photo
 * under it, so the crop stays put on screen, as in a camera app's straighten tool. Turned back
 * into photo pixels it can reach past the photo's edge, and is then shrunk to fit.
 *
 * Its corners keep their order, so flattening it gives a page turned by `degrees`.
 */
export function straightenedQuad(frame: Quad, degrees: number, photo: Size): Quad {
  if (degrees === 0) return fitQuadInside(frame, photo);
  return fitQuadInside(rotateQuad(frame, -degrees, photoCentre(photo)), photo);
}

/** The inverse of `straightenedQuad` for a crop inside the photo: the crop as seen on screen. */
export function straightenFrame(quad: Quad, degrees: number, photo: Size): Quad {
  return degrees === 0 ? quad : rotateQuad(quad, degrees, photoCentre(photo));
}

/**
 * How the crop editor draws the photo: turned `degrees` clockwise about its centre (the page's
 * quarter turns plus the straighten dial), scaled to fit the stage with the quarter turns only,
 * and centred on the stage. The dial does not rescale it, so the crop holds still while the
 * photo turns under it.
 */
export type CropView = {
  readonly scale: number;
  readonly degrees: number;
  /** The photo's centre, in photo pixels. */
  readonly pivot: Point;
  /** The stage's centre, in screen points. */
  readonly centre: Point;
};

export function cropView(
  box: Size,
  photo: Size,
  rotation: PageRotation,
  straighten: number,
  inset = 0,
): CropView {
  const fit = fitContain(
    { width: Math.max(0, box.width - inset * 2), height: Math.max(0, box.height - inset * 2) },
    rotatedSize(photo, rotation),
  );
  return {
    scale: fit.scale,
    degrees: rotation + straighten,
    pivot: photoCentre(photo),
    centre: { x: box.width / 2, y: box.height / 2 },
  };
}

/** A photo pixel's position on the crop editor's stage. */
export function photoToView(point: Point, view: CropView): Point {
  const turned = rotatePoint(
    { x: point.x - view.pivot.x, y: point.y - view.pivot.y },
    view.degrees,
  );
  return { x: view.centre.x + turned.x * view.scale, y: view.centre.y + turned.y * view.scale };
}

/** A finger's movement on the stage, in photo pixels. */
export function viewDeltaToPhoto(delta: Point, view: CropView): Point {
  if (view.scale <= 0) return { x: 0, y: 0 };
  return rotatePoint({ x: delta.x / view.scale, y: delta.y / view.scale }, -view.degrees);
}

/** Whether two crops are the same, give or take rounding. */
export function sameQuad(a: Quad, b: Quad): boolean {
  return maxCornerShift(a, b) < 1e-3;
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
