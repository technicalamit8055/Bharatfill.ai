/**
 * Finds a page from its straight edges. Contour tracing needs one closed outline around the
 * page and loses it when a faint edge has gaps, desk texture runs into it, or the page runs off
 * the frame. This builds candidate pages from the straight segments a line detector found
 * instead — letting the frame's own border stand in for one side of a page cut off by it — and
 * keeps the largest whose every side is a real step in brightness.
 *
 * A step is what sets a page's edge apart: paper on one side, desk on the other. Rows of text
 * and printed table rules also make straight segments, but they have paper on both sides, so
 * they are never taken for the page.
 *
 * Pure, so it is unit tested; the segments and greyscale image come from OpenCV.
 */

import {
  DEFAULT_PLAUSIBILITY,
  isPlausibleDocument,
  orderCorners,
  type PlausibilityOptions,
  type Point,
  type Quad,
  quadArea,
  type Size,
} from './geometry';

export type Segment = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

export type GrayImage = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
};

/** An infinite line a·x + b·y = c, with (a, b) a unit normal. */
type Line = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** The frame's own border: stands in for a side the page runs past. */
  readonly border: boolean;
  /** Samples along the line, inside the frame, that sit on a brightness step. */
  readonly steps: number;
};

export type PageLineOptions = {
  /** Segments closer than this in angle (degrees) and offset (pixels) are one edge. */
  readonly mergeAngle: number;
  readonly mergeDistance: number;
  /**
   * Least total segment length (a share of the frame's shorter side) behind a line. Stray pieces
   * of grain or type make lines too, backed by next to nothing.
   */
  readonly minLineLength: number;
  /** Lines with the most step along them kept per direction before trying combinations. */
  readonly keepPerDirection: number;
  /** How far either side of a line (pixels) brightness is compared. */
  readonly stepOffset: number;
  /**
   * A step: the brighter side outshines the darker by this share of its brightness, and by at
   * least `minStep` levels. Relative, so a page edge in shadow counts as much as one in light.
   */
  readonly minContrast: number;
  readonly minStep: number;
  /** Share of each side of a page that must sit on a step. */
  readonly minSupport: number;
  /** Largest share of the frame a page may cover; beyond it the "page" is the frame itself. */
  readonly maxAreaRatio: number;
  /**
   * What a page using the frame's border as a side counts for against one with four real edges.
   * Below 1, so a real edge just inside the frame beats the border next to it.
   */
  readonly borderAreaWeight: number;
  readonly plausibility: PlausibilityOptions;
};

export const DEFAULT_PAGE_LINES: PageLineOptions = {
  mergeAngle: 6,
  mergeDistance: 3,
  minLineLength: 0.1,
  keepPerDirection: 8,
  stepOffset: 3,
  minContrast: 0.06,
  minStep: 4,
  minSupport: 0.85,
  maxAreaRatio: 0.97,
  borderAreaWeight: 0.9,
  // A page may touch or run past the frame here: the step test keeps desk planks out.
  plausibility: { ...DEFAULT_PLAUSIBILITY, borderMargin: -1 },
};

function toLine(s: Segment): Omit<Line, 'steps'> {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length = Math.hypot(dx, dy);
  const a = -dy / length;
  const b = dx / length;
  // Point the normal along +x for steep lines and +y for flat ones, so two segments of one edge
  // always get the same normal and offset, whichever way round they were found.
  const flip = (Math.abs(a) >= Math.abs(b) ? a : b) < 0 ? -1 : 1;
  return { a: a * flip, b: b * flip, c: (a * s.x1 + b * s.y1) * flip, border: false };
}

/** Direction of a line's normal in degrees, 0–180. */
function normalAngle(line: { a: number; b: number }): number {
  return ((Math.atan2(line.b, line.a) * 180) / Math.PI + 180) % 180;
}

function brightness(image: GrayImage, x: number, y: number): number | null {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return null;
  return image.pixels[py * image.width + px] as number;
}

/**
 * Walks from `p` to `q` a pixel at a time and counts the points where the right-hand side
 * (y grows downward, so for a clockwise outline, the inside) is brighter by a step than the
 * left, and the other way round. Points too near the frame's edge to compare are left out.
 *
 * A page's edge steps the same way all along; desk grain steps both ways at random.
 */
function countSteps(
  p: Point,
  q: Point,
  image: GrayImage,
  options: PageLineOptions,
): { brighterRight: number; brighterLeft: number; samples: number } {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  const count = Math.max(1, Math.round(length));
  const nx = -(q.y - p.y) / Math.max(length, 1e-6);
  const ny = (q.x - p.x) / Math.max(length, 1e-6);
  const d = options.stepOffset;
  let brighterRight = 0;
  let brighterLeft = 0;
  let samples = 0;
  for (let i = 0; i <= count; i += 1) {
    const x = p.x + ((q.x - p.x) * i) / count;
    const y = p.y + ((q.y - p.y) * i) / count;
    const right = brightness(image, x + nx * d, y + ny * d);
    const left = brightness(image, x - nx * d, y - ny * d);
    if (right === null || left === null) continue;
    samples += 1;
    const step = Math.max(options.minStep, options.minContrast * Math.max(right, left));
    if (right - left >= step) brighterRight += 1;
    else if (left - right >= step) brighterLeft += 1;
  }
  return { brighterRight, brighterLeft, samples };
}

/** Where a line crosses the frame, as the two ends of its visible stretch. */
function clipToFrame(line: { a: number; b: number; c: number }, size: Size): [Point, Point] | null {
  const w = size.width - 1;
  const h = size.height - 1;
  const hits: Point[] = [];
  if (Math.abs(line.b) > 1e-9) {
    for (const x of [0, w]) {
      const y = (line.c - line.a * x) / line.b;
      if (y >= 0 && y <= h) hits.push({ x, y });
    }
  }
  if (Math.abs(line.a) > 1e-9) {
    for (const y of [0, h]) {
      const x = (line.c - line.b * y) / line.a;
      if (x >= 0 && x <= w) hits.push({ x, y });
    }
  }
  if (hits.length < 2) return null;
  let best: [Point, Point] = [hits[0] as Point, hits[1] as Point];
  let bestLength = 0;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const length = Math.hypot(
        (hits[i] as Point).x - (hits[j] as Point).x,
        (hits[i] as Point).y - (hits[j] as Point).y,
      );
      if (length > bestLength) {
        best = [hits[i] as Point, hits[j] as Point];
        bestLength = length;
      }
    }
  }
  return best;
}

/** Running weighted sums of points, enough to fit a line through them at any time. */
type LineFit = { w: number; x: number; y: number; xx: number; xy: number; yy: number };

function addSegment(fit: LineFit, s: Segment): void {
  const weight = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2;
  for (const [x, y] of [
    [s.x1, s.y1],
    [s.x2, s.y2],
  ] as const) {
    fit.w += weight;
    fit.x += weight * x;
    fit.y += weight * y;
    fit.xx += weight * x * x;
    fit.xy += weight * x * y;
    fit.yy += weight * y * y;
  }
}

/** Total least squares: the line through the points' centroid along their main direction. */
function fittedLine(fit: LineFit): Omit<Line, 'steps'> {
  const mx = fit.x / fit.w;
  const my = fit.y / fit.w;
  const sxx = fit.xx / fit.w - mx * mx;
  const sxy = fit.xy / fit.w - mx * my;
  const syy = fit.yy / fit.w - my * my;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return toLine({ x1: mx, y1: my, x2: mx + Math.cos(theta), y2: my + Math.sin(theta) });
}

/**
 * Groups segments lying on one straight edge and fits a line through each group. A line
 * detector returns a long faint edge as many short pieces, each a few degrees off; fitted
 * together they place the edge to within a pixel along its whole length.
 */
function mergeLines(
  segments: readonly Segment[],
  options: PageLineOptions,
): { line: Omit<Line, 'steps'>; length: number }[] {
  const groups: { fit: LineFit; line: Omit<Line, 'steps'>; length: number }[] = [];
  const sorted = [...segments]
    .filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2)
    .sort((p, q) => Math.hypot(q.x2 - q.x1, q.y2 - q.y1) - Math.hypot(p.x2 - p.x1, p.y2 - p.y1));
  for (const segment of sorted) {
    const own = toLine(segment);
    const group = groups.find(({ line }) => {
      const diff = Math.abs(normalAngle(line) - normalAngle(own));
      return (
        Math.min(diff, 180 - diff) <= options.mergeAngle &&
        Math.abs(line.a * segment.x1 + line.b * segment.y1 - line.c) <= options.mergeDistance &&
        Math.abs(line.a * segment.x2 + line.b * segment.y2 - line.c) <= options.mergeDistance
      );
    });
    const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
    if (group) {
      addSegment(group.fit, segment);
      group.line = fittedLine(group.fit);
      group.length += length;
    } else {
      const fit = { w: 0, x: 0, y: 0, xx: 0, xy: 0, yy: 0 };
      addSegment(fit, segment);
      groups.push({ fit, line: own, length });
    }
  }
  return groups.map(({ line, length }) => ({ line, length }));
}

/**
 * The best `count` of `lines` (already sorted best first), skipping any that nearly repeats a
 * better one. Otherwise a stray copy of an edge a pixel or two outside it could win, as the
 * bigger page it makes still sits on the step.
 */
function distinctLines(lines: readonly Line[], count: number, options: PageLineOptions): Line[] {
  const kept: Line[] = [];
  for (const line of lines) {
    if (kept.length >= count) break;
    const repeats = kept.some((k) => {
      const diff = Math.abs(normalAngle(k) - normalAngle(line));
      return (
        Math.min(diff, 180 - diff) <= options.mergeAngle &&
        Math.abs(k.c - line.c) <= 2 * options.mergeDistance
      );
    });
    if (!repeats) kept.push(line);
  }
  return kept;
}

function intersect(p: Line, q: Line): Point | null {
  const det = p.a * q.b - q.a * p.b;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (p.c * q.b - q.c * p.b) / det, y: (p.a * q.c - q.a * p.c) / det };
}

function onFrameBorder(p: Point, q: Point, size: Size): boolean {
  const w = size.width - 1;
  const h = size.height - 1;
  return (
    (Math.abs(p.x - q.x) < 1 && (p.x <= 0.5 || p.x >= w - 0.5)) ||
    (Math.abs(p.y - q.y) < 1 && (p.y <= 0.5 || p.y >= h - 0.5))
  );
}

/**
 * The weakest step support (share of samples) over the thirds of the side from `p` to `q`,
 * with the page on the side's right. Taken a third at a time so that a side running on past
 * the page's corner onto the desk fails at that end even when most of it is on the edge.
 */
export function sideSupport(
  p: Point,
  q: Point,
  image: GrayImage,
  options: PageLineOptions = DEFAULT_PAGE_LINES,
): number {
  let weakest = 1;
  for (let third = 0; third < 3; third += 1) {
    const from = { x: p.x + ((q.x - p.x) * third) / 3, y: p.y + ((q.y - p.y) * third) / 3 };
    const to = {
      x: p.x + ((q.x - p.x) * (third + 1)) / 3,
      y: p.y + ((q.y - p.y) * (third + 1)) / 3,
    };
    const { brighterRight, samples } = countSteps(from, to, image, options);
    weakest = Math.min(weakest, samples > 0 ? brighterRight / samples : 0);
  }
  return weakest;
}

/**
 * Whether every side of `quad` (clockwise, as `orderCorners` gives it) is a brightness step with
 * the paper brighter inside, apart from a side lying along the frame's border. Tells a page from
 * a table printed on it, whose rules have paper on both sides.
 */
export function hasPageEdges(
  quad: Quad,
  image: GrayImage,
  options: PageLineOptions = DEFAULT_PAGE_LINES,
): boolean {
  const size = { width: image.width, height: image.height };
  return [0, 1, 2, 3].every((side) => {
    const p = quad[side] as Point;
    const q = quad[(side + 1) % 4] as Point;
    return onFrameBorder(p, q, size) || sideSupport(p, q, image, options) >= options.minSupport;
  });
}

/**
 * The largest plausible page whose sides are straight brightness steps found among
 * `segments`, or null. `image` is the (lightly blurred) greyscale image the segments came from.
 */
export function findPageFromLines(
  segments: readonly Segment[],
  image: GrayImage,
  options: PageLineOptions = DEFAULT_PAGE_LINES,
): Quad | null {
  const size = { width: image.width, height: image.height };
  const minLength = options.minLineLength * Math.min(size.width, size.height);
  const lines: Line[] = [];
  for (const { line, length } of mergeLines(segments, options)) {
    if (length < minLength) continue;
    const visible = clipToFrame(line, size);
    if (!visible) continue;
    const { brighterRight, brighterLeft } = countSteps(visible[0], visible[1], image, options);
    lines.push({ ...line, steps: Math.max(brighterRight, brighterLeft) });
  }

  // "Horizontal" lines have a mostly vertical normal (angle near 90°).
  const byStep = (p: Line, q: Line) => q.steps - p.steps;
  const horizontal = lines.filter((l) => Math.abs(normalAngle(l) - 90) < 45).sort(byStep);
  const vertical = lines.filter((l) => Math.abs(normalAngle(l) - 90) >= 45).sort(byStep);

  const w = size.width - 1;
  const h = size.height - 1;
  const border = (a: number, b: number, c: number): Line => ({ a, b, c, border: true, steps: 0 });
  const rows = [
    ...distinctLines(horizontal, options.keepPerDirection, options),
    border(0, 1, 0),
    border(0, 1, h),
  ];
  const cols = [
    ...distinctLines(vertical, options.keepPerDirection, options),
    border(1, 0, 0),
    border(1, 0, w),
  ];

  const minArea = options.plausibility.minAreaRatio * size.width * size.height;
  const maxArea = options.maxAreaRatio * size.width * size.height;
  const slack = 0.02 * Math.max(size.width, size.height);
  let best: Quad | null = null;
  let bestScore = 0;

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      for (let k = 0; k < cols.length; k += 1) {
        for (let m = k + 1; m < cols.length; m += 1) {
          const top = rows[i] as Line;
          const bottom = rows[j] as Line;
          const left = cols[k] as Line;
          const right = cols[m] as Line;
          const borders = [top, bottom, left, right].filter((s) => s.border).length;
          if (borders > 1) continue;

          const corners = [
            intersect(top, left),
            intersect(top, right),
            intersect(bottom, right),
            intersect(bottom, left),
          ];
          if (corners.some((p) => p === null)) continue;
          // A corner far outside the frame means these lines do not bound a page in view.
          if (
            (corners as Point[]).some(
              (p) => p.x < -slack || p.y < -slack || p.x > w + slack || p.y > h + slack,
            )
          ) {
            continue;
          }

          const quad = orderCorners(
            (corners as Point[]).map((p) => ({
              x: Math.min(w, Math.max(0, p.x)),
              y: Math.min(h, Math.max(0, p.y)),
            })),
          );
          if (!quad) continue;
          const area = quadArea(quad);
          const score = borders ? area * options.borderAreaWeight : area;
          if (score <= bestScore || area < minArea || area > maxArea) continue;
          if (!isPlausibleDocument(quad, size, options.plausibility)) continue;

          // Corners run clockwise, so the paper is on each side's right: it must be the brighter.
          if (!hasPageEdges(quad, image, options)) continue;

          best = quad;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export type RefineOptions = {
  /** How far (pixels) from a side, and how far off its angle (degrees), a segment may lie. */
  readonly distance: number;
  readonly angle: number;
  /** Share of a side's length the matching segments must add up to before it is moved. */
  readonly minCoverage: number;
};

export const DEFAULT_REFINE: RefineOptions = { distance: 10, angle: 6, minCoverage: 0.3 };

/**
 * Moves each side of `quad` onto the straight edge it lies along in a sharper image: the line
 * fitted through the `segments` (found in that image, in its pixels) running along the side.
 * Sides with too little edge along them, and sides on the frame's border, stay where they are.
 */
export function refineQuad(
  quad: Quad,
  segments: readonly Segment[],
  size: Size,
  options: RefineOptions = DEFAULT_REFINE,
): Quad {
  const sides: Omit<Line, 'steps'>[] = [0, 1, 2, 3].map((side) => {
    const p = quad[side] as Point;
    const q = quad[(side + 1) % 4] as Point;
    const current = toLine({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    if (onFrameBorder(p, q, size)) return current;

    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const along = (x: number, y: number) =>
      ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / (length * length);
    const fit = { w: 0, x: 0, y: 0, xx: 0, xy: 0, yy: 0 };
    let covered = 0;
    for (const s of segments) {
      if (s.x1 === s.x2 && s.y1 === s.y2) continue;
      const own = toLine(s);
      const diff = Math.abs(normalAngle(own) - normalAngle(current));
      if (Math.min(diff, 180 - diff) > options.angle) continue;
      if (Math.abs(current.a * s.x1 + current.b * s.y1 - current.c) > options.distance) continue;
      if (Math.abs(current.a * s.x2 + current.b * s.y2 - current.c) > options.distance) continue;
      const t1 = along(s.x1, s.y1);
      const t2 = along(s.x2, s.y2);
      if (Math.max(t1, t2) < 0 || Math.min(t1, t2) > 1) continue;
      addSegment(fit, s);
      covered += Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    }
    return covered >= options.minCoverage * length ? fittedLine(fit) : current;
  });

  const w = size.width - 1;
  const h = size.height - 1;
  const corners: Point[] = [];
  for (let corner = 0; corner < 4; corner += 1) {
    const p = intersect(
      { ...(sides[(corner + 3) % 4] as Omit<Line, 'steps'>), steps: 0 },
      {
        ...(sides[corner] as Omit<Line, 'steps'>),
        steps: 0,
      },
    );
    const before = quad[corner] as Point;
    // A corner that jumps further than a side may move was matched to the wrong edge.
    corners.push(
      p && Math.hypot(p.x - before.x, p.y - before.y) <= 2 * options.distance
        ? { x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) }
        : before,
    );
  }
  return corners as unknown as Quad;
}
