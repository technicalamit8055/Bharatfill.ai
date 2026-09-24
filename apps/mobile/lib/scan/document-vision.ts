/**
 * The scanner's image processing, on OpenCV (`react-native-fast-opencv`, native C++ over JSI):
 *
 * - `detectDocument` finds a page's four corners in a small greyscale image. It runs several
 *   times a second on shrunken camera frames to drive the live outline and auto-capture, and
 *   once on each captured photo.
 * - `analysePhoto` and `renderPage` turn a captured photo into a flat, cleaned-up page: turn it
 *   upright (EXIF), find the page, straighten it with a perspective warp, and apply a filter.
 *
 * Everything runs on the JS thread in the main runtime, where OpenCV is installed. Every OpenCV
 * object is native memory and is released explicitly; nothing here is logged or uploaded.
 */

import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import {
  AdaptiveThresholdTypes,
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  DecompTypes,
  InterpolationFlags,
  Mat,
  MatVector,
  MorphShapes,
  MorphTypes,
  OpenCV,
  Point,
  Point2f,
  Point2fVector,
  PointVector,
  RetrievalModes,
  RotateFlags,
  Scalar,
  Size,
  ThresholdTypes,
} from 'react-native-fast-opencv';

import { readJpegOrientation, uprightRotation } from './exif';
import {
  DEFAULT_PLAUSIBILITY,
  flattenedSize,
  fullFrameQuad,
  isPlausibleDocument,
  orderCorners,
  type Point as GeometryPoint,
  type Quad,
  quadArea,
  scaleQuad,
  type Size as GeometrySize,
} from './geometry';
import type { LumaImage } from './luma';

/** The looks a page can be saved with. Each has copy at `scanner.filters.<filter>`. */
export const PAGE_FILTERS = ['magic', 'original', 'grayscale', 'blackWhite'] as const;
export type PageFilter = (typeof PAGE_FILTERS)[number];

/** Longest side of a saved page. Enough for 300-dpi-looking text on A4 without huge files. */
export const OUTPUT_MAX_SIDE = 2400;
/**
 * Width photos are shrunk to before looking for the page in them. Close to the live frames'
 * scale, which the detector is tuned for; at larger sizes desk and cloth texture turns into
 * edges. The citizen can fine-tune the corners in the crop editor.
 */
const DETECTION_WIDTH = 320;
/** `Mat.saveToFile` takes quality as 0–1 and throws on anything outside that range. */
const JPEG_QUALITY = 0.9;

type Releasable = { release(): void };

/** Runs `work` and releases every OpenCV object it registered, even if it throws. */
function withScope<T>(work: (keep: <R extends Releasable>(object: R) => R) => T): T {
  const owned: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    owned.push(object);
    return object;
  };
  try {
    return work(keep);
  } finally {
    for (const object of owned.reverse()) {
      try {
        object.release();
      } catch {
        // Already released by OpenCV; nothing to do.
      }
    }
  }
}

function emptyMat(): Mat {
  return Mat.create(0, 0, DataTypes.CV_8U);
}

// ---- Detection ---------------------------------------------------------------------------------

/** Canny thresholds, loose then strict: a faint page edge and a busy background need different ones. */
const CANNY_THRESHOLDS = [
  [30, 90],
  [60, 180],
] as const;
/** Tolerances (a share of the outline's perimeter) tried in turn until an outline has 4 corners. */
const APPROX_EPSILONS = [0.02, 0.035, 0.05, 0.07] as const;
/**
 * How much of its four-corner simplification an outline must fill. A page fills nearly all of
 * it; a blob of wood grain or a shadow that merely has four extreme points does not.
 */
const MIN_OUTLINE_FILL = 0.85;

/**
 * The page's corners in a greyscale Mat, or null when nothing page-like is in view.
 *
 * Outlines come from three binary images: edges at two Canny sensitivities, and bright paper
 * split from a darker surface (Otsu). Every outline — inner ones too, so a page edge that a
 * desk plank or a hand runs into still has a clean inner boundary — is wrapped in its convex
 * hull (which bridges a thumb or a torn corner) and simplified to four corners. The largest
 * plausible quadrilateral wins.
 */
function detectInGray(gray: Mat, size: GeometrySize): Quad | null {
  return withScope((keep) => {
    const blurred = keep(emptyMat());
    OpenCV.GaussianBlur(gray, blurred, keep(Size.create(5, 5)), 0);

    const kernel = keep(
      OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, keep(Size.create(3, 3))),
    );
    const found: Quad[] = [];

    for (const [low, high] of CANNY_THRESHOLDS) {
      const edges = keep(emptyMat());
      OpenCV.Canny(blurred, edges, low, high);
      // Join edge fragments broken by text touching the page border or a thumb on the edge.
      const closed = keep(emptyMat());
      OpenCV.morphologyEx(edges, closed, MorphTypes.MORPH_CLOSE, kernel);
      const thick = keep(emptyMat());
      OpenCV.dilate(
        closed,
        thick,
        kernel,
        keep(Point.create(-1, -1)),
        1,
        BorderTypes.BORDER_CONSTANT,
        keep(Scalar.create(0)),
      );
      collectQuads(thick, size, found, keep);
    }

    const bright = keep(emptyMat());
    OpenCV.threshold(
      blurred,
      bright,
      0,
      255,
      ThresholdTypes.THRESH_BINARY | ThresholdTypes.THRESH_OTSU,
    );
    // Cut the thin bridges that glare or light wood grain make between the page and the desk.
    const opened = keep(emptyMat());
    OpenCV.morphologyEx(bright, opened, MorphTypes.MORPH_OPEN, kernel);
    collectQuads(opened, size, found, keep);

    let best: Quad | null = null;
    for (const quad of found) {
      if (!best || quadArea(quad) > quadArea(best)) best = quad;
    }
    return best;
  });
}

/** Adds every plausible page outline in a binary image to `found`. */
function collectQuads(
  binary: Mat,
  size: GeometrySize,
  found: Quad[],
  keep: <R extends Releasable>(object: R) => R,
): void {
  const contours = keep(MatVector.create());
  OpenCV.findContours(
    binary,
    contours,
    RetrievalModes.RETR_LIST,
    ContourApproximationModes.CHAIN_APPROX_SIMPLE,
  );

  // Anything smaller can neither fill its quad nor pass the size check.
  const minArea = MIN_OUTLINE_FILL * DEFAULT_PLAUSIBILITY.minAreaRatio * size.width * size.height;
  for (let i = 0; i < contours.length; i += 1) {
    const contour = keep(contours.get(i));
    const area = OpenCV.contourArea(contour).value;
    if (area < minArea) continue;

    const hull = keep(emptyMat());
    OpenCV.convexHull(contour, hull);
    const quad = simplifyToQuad(hull, keep);
    if (quad && area >= MIN_OUTLINE_FILL * quadArea(quad) && isPlausibleDocument(quad, size)) {
      found.push(quad);
    }
  }
}

/** Simplifies a convex outline to four corners, loosening the tolerance until it gets there. */
function simplifyToQuad(hull: Mat, keep: <R extends Releasable>(object: R) => R): Quad | null {
  const perimeter = OpenCV.arcLength(hull, true).value;
  for (const epsilon of APPROX_EPSILONS) {
    const approx = keep(PointVector.create());
    OpenCV.approxPolyDP(hull, approx, epsilon * perimeter, true);
    if (approx.length === 4) return orderCorners(approx.getAll().map((p) => ({ x: p.x, y: p.y })));
    if (approx.length < 4) return null;
  }
  return null;
}

/** Detects a page in a shrunken camera frame. Coordinates are in that small image's pixels. */
export function detectDocument(luma: LumaImage): Quad | null {
  if (luma.width < 16 || luma.height < 16) return null;
  return withScope((keep) => {
    const gray = keep(Mat.createFromBuffer('uint8', luma.height, luma.width, 1, luma.pixels));
    return detectInGray(gray, { width: luma.width, height: luma.height });
  });
}

// ---- Photos ------------------------------------------------------------------------------------

/** Decodes a photo into an upright BGR Mat, applying its EXIF orientation. */
async function loadUpright(
  uri: string,
  keep: <R extends Releasable>(object: R) => R,
): Promise<Mat> {
  const file = new File(uri);
  const rotation = uprightRotation(readJpegOrientation(await file.bytes()));

  let image = keep(Mat.createFromBase64(await file.base64()));
  if (image.rows === 0 || image.cols === 0) throw new Error('The photo could not be decoded.');

  const channels = image.toBuffer('uint8').channels;
  if (channels === 4) {
    const bgr = keep(emptyMat());
    OpenCV.cvtColor(image, bgr, ColorConversionCodes.COLOR_BGRA2BGR);
    image = bgr;
  } else if (channels === 1) {
    const bgr = keep(emptyMat());
    OpenCV.cvtColor(image, bgr, ColorConversionCodes.COLOR_GRAY2BGR);
    image = bgr;
  }

  if (rotation !== 0) {
    const turned = keep(emptyMat());
    const code =
      rotation === 90
        ? RotateFlags.ROTATE_90_CLOCKWISE
        : rotation === 180
          ? RotateFlags.ROTATE_180
          : RotateFlags.ROTATE_90_COUNTERCLOCKWISE;
    OpenCV.rotate(image, turned, code);
    image = turned;
  }
  return image;
}

export type PhotoAnalysis = {
  /** The photo's size once turned upright; corner positions are in these pixels. */
  readonly size: GeometrySize;
  /** Where the page is. The whole photo when no page was found. */
  readonly quad: Quad;
  readonly detected: boolean;
};

/** Finds the page in a captured or imported photo. */
export async function analysePhoto(uri: string): Promise<PhotoAnalysis> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };
  try {
    const image = await loadUpright(uri, keep);
    const size = { width: image.cols, height: image.rows };
    const scale = Math.min(1, DETECTION_WIDTH / size.width);

    const quad = withScope((inner) => {
      const small = inner(emptyMat());
      OpenCV.resize(
        image,
        small,
        inner(Size.create(Math.round(size.width * scale), Math.round(size.height * scale))),
        0,
        0,
        InterpolationFlags.INTER_AREA,
      );
      const gray = inner(emptyMat());
      OpenCV.cvtColor(small, gray, ColorConversionCodes.COLOR_BGR2GRAY);
      return detectInGray(gray, { width: small.cols, height: small.rows });
    });

    return quad
      ? { size, quad: scaleQuad(quad, 1 / scale), detected: true }
      : { size, quad: fullFrameQuad(size), detected: false };
  } finally {
    for (const object of scope.reverse()) object.release();
  }
}

/**
 * Evens out lighting: estimates the paper's brightness everywhere (a heavy blur of a small copy)
 * and divides it out, so shadows and yellow bulb tints go white while ink, stamps and photos
 * keep their colour. This is the "Magic Color" look.
 */
function evenOutLighting(channel: Mat, keep: <R extends Releasable>(object: R) => R): Mat {
  const small = keep(emptyMat());
  const scale = 0.25;
  OpenCV.resize(
    channel,
    small,
    keep(
      Size.create(
        Math.max(1, Math.round(channel.cols * scale)),
        Math.max(1, Math.round(channel.rows * scale)),
      ),
    ),
    0,
    0,
    InterpolationFlags.INTER_AREA,
  );

  // Closing removes the dark strokes of text, leaving only the paper's lighting.
  const closed = keep(emptyMat());
  const kernel = keep(
    OpenCV.getStructuringElement(MorphShapes.MORPH_ELLIPSE, keep(Size.create(9, 9))),
  );
  OpenCV.morphologyEx(small, closed, MorphTypes.MORPH_CLOSE, kernel);
  const smooth = keep(emptyMat());
  OpenCV.medianBlur(closed, smooth, 7);

  const background = keep(emptyMat());
  OpenCV.resize(
    smooth,
    background,
    keep(Size.create(channel.cols, channel.rows)),
    0,
    0,
    InterpolationFlags.INTER_LINEAR,
  );

  const divided = keep(emptyMat());
  OpenCV.divide(channel, background, divided, 255);

  // Stretch to the full 0–255 range. Not `OpenCV.normalize`: its binding passes the norm type
  // through as `beta`, so NORM_MINMAX is ignored and the L2 default turns the page black.
  const { minVal, maxVal } = OpenCV.minMaxLoc(divided);
  if (maxVal - minVal < 1) return divided;
  const alpha = 255 / (maxVal - minVal);
  const stretched = keep(emptyMat());
  OpenCV.convertScaleAbs(divided, stretched, alpha, -minVal * alpha);
  return stretched;
}

function applyFilter(
  page: Mat,
  filter: PageFilter,
  keep: <R extends Releasable>(object: R) => R,
): Mat {
  if (filter === 'original') return page;

  if (filter === 'magic') {
    const channels = keep(MatVector.create());
    OpenCV.split(page, channels);
    const cleaned = keep(MatVector.create());
    for (let i = 0; i < channels.length; i += 1) {
      cleaned.push(evenOutLighting(keep(channels.get(i)), keep));
    }
    const merged = keep(emptyMat());
    OpenCV.merge(cleaned, merged);
    return merged;
  }

  const gray = keep(emptyMat());
  OpenCV.cvtColor(page, gray, ColorConversionCodes.COLOR_BGR2GRAY);
  const even = evenOutLighting(gray, keep);
  if (filter === 'grayscale') return even;

  const bw = keep(emptyMat());
  OpenCV.adaptiveThreshold(
    even,
    bw,
    255,
    AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
    ThresholdTypes.THRESH_BINARY,
    31,
    12,
  );
  return bw;
}

export type RenderedPage = {
  /** A JPEG in the app cache. Plaintext: it is deleted once sealed into the vault. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
};

/** Flattens the page inside `quad` and applies `filter`, writing a JPEG to the app cache. */
export async function renderPage(
  photoUri: string,
  quad: Quad,
  filter: PageFilter,
): Promise<RenderedPage> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };
  try {
    const image = await loadUpright(photoUri, keep);
    const out = flattenedSize(quad, OUTPUT_MAX_SIDE);

    // Filled point by point: the native `Point2fVector.create` ignores the points its typings
    // accept and always returns an empty vector.
    const toVector = (points: readonly GeometryPoint[]) => {
      const vector = keep(Point2fVector.create());
      for (const p of points) vector.push(keep(Point2f.create(p.x, p.y)));
      return vector;
    };
    const source = toVector(quad);
    const target = toVector(
      fullFrameQuad(out).map((p) => ({ x: p.x - (p.x ? 1 : 0), y: p.y - (p.y ? 1 : 0) })),
    );
    const transform = keep(OpenCV.getPerspectiveTransform(source, target, DecompTypes.DECOMP_LU));

    const flat = keep(emptyMat());
    OpenCV.warpPerspective(
      image,
      flat,
      transform,
      keep(Size.create(out.width, out.height)),
      InterpolationFlags.INTER_LINEAR,
      BorderTypes.BORDER_REPLICATE,
      keep(Scalar.create(0)),
    );

    const result = applyFilter(flat, filter, keep);
    const output = new File(Paths.cache, `scan-page-${randomUUID()}.jpg`);
    result.saveToFile(output.uri, 'jpeg', JPEG_QUALITY);

    return { uri: output.uri, width: out.width, height: out.height };
  } finally {
    for (const object of scope.reverse()) object.release();
  }
}
