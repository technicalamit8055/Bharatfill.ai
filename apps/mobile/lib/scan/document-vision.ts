/**
 * The scanner's image processing, on OpenCV (`react-native-fast-opencv`, native C++ over JSI):
 *
 * - `detectDocument` finds a page's four corners in a small greyscale image. It runs several
 *   times a second on shrunken camera frames to drive the live outline and auto-capture.
 *   Captured photos get a slower, more thorough search that also copes with a page filling or
 *   running off the frame (`page-lines.ts`).
 * - `analysePhoto` and `renderPage` turn a captured photo into a flat, cleaned-up page: turn it
 *   upright (EXIF), find the page, straighten it with a perspective warp, apply a filter and
 *   the citizen's quarter turns. It can also write a small preview of the page in every filter,
 *   for the review screen's filter cards.
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
  Rect,
  RetrievalModes,
  RotateFlags,
  Scalar,
  Size,
  ThresholdTypes,
} from 'react-native-fast-opencv';

import { readJpegOrientation, uprightRotation } from './exif';
import type { PageFilter } from './filters';
import {
  DEFAULT_PLAUSIBILITY,
  flattenedSize,
  fullFrameQuad,
  innerRect,
  insetQuad,
  isPlausibleDocument,
  orderCorners,
  pageAspect,
  type PageRotation,
  type PixelRect,
  type Point as GeometryPoint,
  type Quad,
  quadArea,
  scaleQuad,
  type Size as GeometrySize,
} from './geometry';
import type { LumaImage } from './luma';
import {
  findPageFromLines,
  type GrayImage as PageLinesImage,
  hasPageEdges,
  refineQuad,
  type Segment,
} from './page-lines';
import { estimatePaperLight, maxPool, poolFactor } from './paper-light';
import { assessPhotoQuality, type PhotoQuality } from './photo-quality';
import {
  centredCrop,
  ID_CARD_ASPECT,
  ID_CARD_ASPECT_TOLERANCE,
  idCardSheetLayout,
  inkBounds,
  padRect,
  PASSPORT_PHOTO,
  PASSPORT_PHOTO_ASPECT,
  presetFilters,
  type ScanPreset,
  snapAspect,
} from './presets';
import {
  alphaCurve,
  compositeOnBackground,
  crownRow,
  type FaceBox,
  isStudioBackground,
  largestFace,
  overhang,
  PASSPORT_JPEG_QUALITIES,
  PASSPORT_MAX_BYTES,
  passportFrame,
  scaleRect,
  STUDIO_COLOURS,
} from './studio-photo';
import { chromaCurve, contrastStretch, levelsCurve, pageLevels, photoLevels } from './tone-curve';
import {
  cutOutPortrait,
  isOnDeviceVisionAvailable,
  NoPersonFoundError,
  OnDeviceVisionUnavailableError,
} from '../vision/on-device-vision';

export { PAGE_FILTERS, type PageFilter, PHOTO_FILTERS } from './filters';

/** Whether this phone can cut a person out of a photo for the studio passport photo. */
export function studioPhotoAvailable(): boolean {
  return isOnDeviceVisionAvailable();
}

/**
 * Longest side of a saved page: A4 at 300 dpi, what a flatbed scanner gives. Pages the camera
 * caught smaller are enlarged (up to `MAX_UPSCALE`) before filtering, so the filters draw text
 * edges at this resolution and the page stays crisp when zoomed, instead of being enlarged
 * blurry by whatever displays it.
 */
export const OUTPUT_LONG_SIDE = 3508;
const MAX_UPSCALE = 2;
/** Longest side of a filter card's preview: sharp on a 3× screen at card size, and quick. */
export const PREVIEW_MAX_SIDE = 240;
/**
 * Width photos are shrunk to before looking for the page in them. Close to the live frames'
 * scale, which the detector is tuned for; at larger sizes desk and cloth texture turns into
 * edges. The citizen can fine-tune the corners in the crop editor.
 */
const DETECTION_WIDTH = 320;
/**
 * Width a photo is looked at again to place the corners found at `DETECTION_WIDTH` precisely.
 * At 320px one pixel of error becomes ten or more in the photo, which shows as a strip of desk.
 */
const REFINE_WIDTH = 1080;
/**
 * How far detected corners are pulled towards the page's centre, so the paper's soft edge and
 * its shadow stay out of the scan.
 */
const AUTO_CROP_INSET = 0.005;
/** Votes a straight segment needs from the line detector. */
const HOUGH_VOTES = 40;
/** Shorter segments are glyph strokes, not edges. */
const MIN_SEGMENT_LENGTH = 8;
/** `Mat.saveToFile` takes quality as 0–1 and throws on anything outside that range. */
const JPEG_QUALITY = 0.9;

type Releasable = { release(): void };
type Keep = <R extends Releasable>(object: R) => R;

function releaseQuietly(object: Releasable): void {
  try {
    object.release();
  } catch {
    // Already released by OpenCV; nothing to do.
  }
}

/**
 * Runs one step of a filter in a scope of its own: everything it registers is released as soon
 * as it returns, except its result, which moves to `keep`. Full-size pages are tens of
 * megabytes per plane, so holding every intermediate to the end would multiply peak memory.
 */
function stage<R extends Releasable>(keep: Keep, work: (keep: Keep) => R): R {
  const owned: Releasable[] = [];
  const inner: Keep = (object) => {
    owned.push(object);
    return object;
  };
  let result: R | undefined;
  try {
    result = work(inner);
    return result;
  } finally {
    for (const object of owned.reverse()) {
      if (object !== result) releaseQuietly(object);
    }
    if (result !== undefined && owned.includes(result)) keep(result);
  }
}

/** Runs `work` and releases every OpenCV object it registered, even if it throws. */
function withScope<T>(work: (keep: Keep) => T): T {
  const owned: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    owned.push(object);
    return object;
  };
  try {
    return work(keep);
  } finally {
    for (const object of owned.reverse()) releaseQuietly(object);
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
 * Every plausible page outline in a greyscale Mat.
 *
 * Outlines come from three binary images: edges at two Canny sensitivities, and bright paper
 * split from a darker surface (Otsu). Every outline — inner ones too, so a page edge that a
 * desk plank or a hand runs into still has a clean inner boundary — is wrapped in its convex
 * hull (which bridges a thumb or a torn corner) and simplified to four corners.
 */
function findQuadsInGray(gray: Mat, size: GeometrySize): Quad[] {
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
    return found;
  });
}

/** The page's corners in a greyscale Mat — the largest plausible outline — or null. */
function detectInGray(gray: Mat, size: GeometrySize): Quad | null {
  let best: Quad | null = null;
  for (const quad of findQuadsInGray(gray, size)) {
    if (!best || quadArea(quad) > quadArea(best)) best = quad;
  }
  return best;
}

/** Adds every plausible page outline in a binary image to `found`. */
function collectQuads(binary: Mat, size: GeometrySize, found: Quad[], keep: Keep): void {
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
function simplifyToQuad(hull: Mat, keep: Keep): Quad | null {
  const perimeter = OpenCV.arcLength(hull, true).value;
  for (const epsilon of APPROX_EPSILONS) {
    const approx = keep(PointVector.create());
    OpenCV.approxPolyDP(hull, approx, epsilon * perimeter, true);
    if (approx.length === 4) return orderCorners(approx.getAll().map((p) => ({ x: p.x, y: p.y })));
    if (approx.length < 4) return null;
  }
  return null;
}

/** A 256-bin brightness histogram of 8-bit pixels. */
function histogramOf(pixels: Uint8Array): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 1) {
    histogram[pixels[i] as number] = (histogram[pixels[i] as number] as number) + 1;
  }
  return histogram;
}

/**
 * A contrast-stretched copy of a greyscale Mat (`contrastStretch`), or null when the image
 * already spans enough range for the stretch to change little. For a second look at a frame in
 * which nothing was found: a light page on a light desk differs from it by a few levels, below
 * what the edge detector is tuned for, and stretched that step is several times larger.
 */
function stretchedCopy(gray: Mat, pixels: Uint8Array, keep: Keep): Mat | null {
  const table = contrastStretch(histogramOf(pixels));
  return table ? lookUp(gray, table, keep) : null;
}

/**
 * Detects a page in a shrunken camera frame. Coordinates are in that small image's pixels. When
 * nothing is found, a low-contrast frame gets one more look, stretched (`stretchedCopy`); that
 * second look can only add a page, never change one the first found, and costs nothing on a
 * frame with ordinary contrast. Stretching also lifts the texture of a plain wall or a cloth, so
 * an outline found that way must also have paper brighter than its surroundings along every
 * side (`hasPageEdges`), as captured photos' outlines must.
 */
export function detectDocument(luma: LumaImage): Quad | null {
  if (luma.width < 16 || luma.height < 16) return null;
  return withScope((keep) => {
    const gray = keep(Mat.createFromBuffer('uint8', luma.height, luma.width, 1, luma.pixels));
    const size = { width: luma.width, height: luma.height };
    const found = detectInGray(gray, size);
    if (found) return found;
    try {
      const stretched = stretchedCopy(gray, luma.pixels, keep);
      if (!stretched) return null;
      const quad = detectInGray(stretched, size);
      if (!quad) return null;
      const blurred = keep(emptyMat());
      OpenCV.GaussianBlur(stretched, blurred, keep(Size.create(5, 5)), 0);
      const image = { ...size, pixels: blurred.toBuffer('uint8').buffer };
      return hasPageEdges(quad, image) ? quad : null;
    } catch {
      return null;
    }
  });
}

// ---- Photos ------------------------------------------------------------------------------------

/** Decodes a photo into an upright BGR Mat, applying its EXIF orientation. */
async function loadUpright(uri: string, keep: Keep): Promise<Mat> {
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
  /** Whether the photo is sharp and well lit enough (`photo-quality.ts`); null if not measured. */
  readonly quality: PhotoQuality | null;
};

/** Width of the copy a photo's quality is measured on; `DEFAULT_QUALITY` is calibrated at it. */
const QUALITY_WIDTH = 800;
/** How far inside the page quality is measured, so the desk and the page's edge are left out. */
const QUALITY_INSET = 0.04;

/**
 * Measures the photo's quality inside the page (`quad`, or the whole photo when none was
 * found). Null when it cannot be measured: the check is advice, so it never stops a scan.
 */
function measureQuality(image: Mat, quad: Quad | null): PhotoQuality | null {
  try {
    const scale = Math.min(1, QUALITY_WIDTH / Math.max(1, image.cols));
    return withGrayAt(image, scale, (gray, size) => {
      const region: PixelRect | null = quad
        ? innerRect(scaleQuad(quad, scale), QUALITY_INSET)
        : null;
      return assessPhotoQuality(
        { width: size.width, height: size.height, pixels: gray.toBuffer('uint8').buffer },
        region ?? undefined,
      );
    });
  } catch {
    return null;
  }
}

/** Shrinks a BGR photo by `scale` and hands its greyscale copy, and that copy's size, to `work`. */
function withGrayAt<T>(image: Mat, scale: number, work: (gray: Mat, size: GeometrySize) => T): T {
  return withScope((keep) => {
    const small = keep(emptyMat());
    OpenCV.resize(
      image,
      small,
      keep(
        Size.create(
          Math.max(1, Math.round(image.cols * scale)),
          Math.max(1, Math.round(image.rows * scale)),
        ),
      ),
      0,
      0,
      InterpolationFlags.INTER_AREA,
    );
    const gray = keep(emptyMat());
    OpenCV.cvtColor(small, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    return work(gray, { width: small.cols, height: small.rows });
  });
}

/**
 * The straight segments in a greyscale Mat, and the lightly blurred image they were found in
 * (which `page-lines.ts` reads brightness steps from).
 */
function scanEdges(gray: Mat, keep: Keep): { image: PageLinesImage; segments: Segment[] } {
  const blurred = keep(emptyMat());
  OpenCV.GaussianBlur(gray, blurred, keep(Size.create(5, 5)), 0);
  const [low, high] = CANNY_THRESHOLDS[0];
  const edges = keep(emptyMat());
  OpenCV.Canny(blurred, edges, low, high);
  const closed = keep(emptyMat());
  OpenCV.morphologyEx(
    edges,
    closed,
    MorphTypes.MORPH_CLOSE,
    keep(OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, keep(Size.create(3, 3)))),
  );
  // The binding passes no minimum length or gap, so edges come back as many short pieces;
  // `page-lines.ts` fits them back together.
  const lines = keep(emptyMat());
  OpenCV.HoughLinesP(closed, lines, 1, Math.PI / 180, HOUGH_VOTES);

  const segments: Segment[] = [];
  const found = lines.rows > 0 ? lines.toBuffer('int32').buffer : new Int32Array(0);
  for (let i = 0; i + 3 < found.length; i += 4) {
    const segment = {
      x1: found[i] as number,
      y1: found[i + 1] as number,
      x2: found[i + 2] as number,
      y2: found[i + 3] as number,
    };
    if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) >= MIN_SEGMENT_LENGTH) {
      segments.push(segment);
    }
  }
  return {
    image: { width: blurred.cols, height: blurred.rows, pixels: blurred.toBuffer('uint8').buffer },
    segments,
  };
}

/**
 * The page in a greyscale copy of a photo: first from its straight edges, which copes with a
 * page filling or running off the frame; failing that, from closed outlines, as long as their
 * sides are real page edges and not a box printed on the page.
 */
function searchPhoto(gray: Mat, size: GeometrySize): Quad | null {
  return withScope((keep) => {
    const { image, segments } = scanEdges(gray, keep);
    const fromLines = findPageFromLines(segments, image);
    if (fromLines) return fromLines;

    let best: Quad | null = null;
    for (const quad of findQuadsInGray(gray, size)) {
      if (hasPageEdges(quad, image) && (!best || quadArea(quad) > quadArea(best))) best = quad;
    }
    return best;
  });
}

/**
 * `searchPhoto`, and when it finds nothing, the same search once more on a contrast-stretched
 * copy (`stretchedCopy`): the light page on a light desk. Pages the first search finds are
 * unchanged.
 */
function findPageInPhoto(gray: Mat, size: GeometrySize): Quad | null {
  const found = searchPhoto(gray, size);
  if (found) return found;
  try {
    return withScope((keep) => {
      const stretched = stretchedCopy(gray, gray.toBuffer('uint8').buffer, keep);
      return stretched ? searchPhoto(stretched, size) : null;
    });
  } catch {
    return null;
  }
}

/**
 * Finds the page in a captured or imported photo: at the detector's tuned scale first, then
 * each side is snapped onto the straight edge it lies on at a higher resolution, so the corners
 * land on the paper's real edge. The result is inset slightly so no desk shows in the scan.
 * The photo's quality is measured inside the page found, for review to warn about.
 *
 * With `findPage: false` the image is taken to be the page already — one Google's document
 * scanner cropped and flattened (`platform-scanner.ts`) — so it is not searched again: a search
 * would find a box printed on the page and crop to it. The whole image is the page.
 */
export async function analysePhoto(
  uri: string,
  { findPage = true }: { readonly findPage?: boolean } = {},
): Promise<PhotoAnalysis> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };
  try {
    const image = await loadUpright(uri, keep);
    const size = { width: image.cols, height: image.rows };

    if (!findPage) {
      return {
        size,
        quad: fullFrameQuad(size),
        detected: true,
        quality: measureQuality(image, null),
      };
    }

    const coarseScale = Math.min(1, DETECTION_WIDTH / size.width);
    const coarse = withGrayAt(image, coarseScale, findPageInPhoto);
    if (!coarse) {
      return {
        size,
        quad: fullFrameQuad(size),
        detected: false,
        quality: measureQuality(image, null),
      };
    }

    let quad = scaleQuad(coarse, 1 / coarseScale);
    const fineScale = Math.min(1, REFINE_WIDTH / size.width);
    if (fineScale > coarseScale) {
      quad = withGrayAt(image, fineScale, (gray, fineSize) =>
        withScope((inner) =>
          scaleQuad(
            refineQuad(scaleQuad(quad, fineScale), scanEdges(gray, inner).segments, fineSize),
            1 / fineScale,
          ),
        ),
      );
    }

    const page = insetQuad(quad, AUTO_CROP_INSET);
    return { size, quad: page, detected: true, quality: measureQuality(image, page) };
  } finally {
    for (const object of scope.reverse()) object.release();
  }
}

/**
 * Longest side of the copy the paper's lighting is pooled from, and of the grid it is pooled
 * down to (`poolFactor`). The grid is fine enough to follow a shadow's edge. The copy is several
 * times finer, so the brightest pixel of each cell is still the paper between a faint seal's
 * lines or a stamp's strokes: those marks stay out of the estimate and are kept, where a copy
 * averaged down to the grid first turned them into grey patches that were whitened as shadow.
 * A page smaller than the copy is pooled from as it is.
 */
const LIGHTING_SAMPLE_SIDE = 1536;
const LIGHTING_GRID_SIDE = 256;
/**
 * What paper becomes once its lighting is divided out. Below 255, so paper grain is not
 * clipped and the tone curve can measure it.
 */
const PAPER_LEVEL = 220;
/** Longest side of the copy the tone curve's histogram is taken from. */
const HISTOGRAM_SAMPLE_SIDE = 800;
/**
 * The detail sharpening boosts, as blur widths in photo pixels: the band between them is
 * stroke-sized. Finer is sensor noise and is left alone; coarser is shading.
 */
const SHARPEN_FINE_SIGMA = 0.6;
const SHARPEN_COARSE_SIGMA = 1.6;
/**
 * How much of that band is added back. Strong, because the tone curve runs after it and clips
 * the overshoot to pure white paper and solid black ink rather than leaving halos: text edges
 * come out steep, as a flatbed scanner draws them.
 */
const SHARPEN_AMOUNT = 2;
/** Black & White thresholds against the page around each pixel, this share of its longest side. */
const THRESHOLD_BLOCK_SHARE = 0.013;
/** Tints closer to neutral than this are sensor noise and turn grey; see `chromaCurve`. */
const CHROMA_DEAD_ZONE = 6;
const CHROMA_GAIN = 1.2;

/** A copy of `image` whose longest side is at most `maxSide`. */
function shrink(image: Mat, maxSide: number, keep: Keep): Mat {
  const scale = Math.min(1, maxSide / Math.max(image.cols, image.rows, 1));
  if (scale === 1) return image;
  const small = keep(emptyMat());
  OpenCV.resize(
    image,
    small,
    keep(
      Size.create(
        Math.max(1, Math.round(image.cols * scale)),
        Math.max(1, Math.round(image.rows * scale)),
      ),
    ),
    0,
    0,
    InterpolationFlags.INTER_AREA,
  );
  return small;
}

/**
 * Evens out lighting: estimates the paper's brightness everywhere (`paper-light.ts`) and
 * divides it out, so shadows and yellow bulb tints go to one even paper tone while ink,
 * banners, stamps and photos keep theirs.
 */
function evenOutLighting(channel: Mat, keep: Keep): Mat {
  const sample = shrink(channel, LIGHTING_SAMPLE_SIDE, keep);
  const light = estimatePaperLight(
    maxPool(
      { width: sample.cols, height: sample.rows, pixels: sample.toBuffer('uint8').buffer },
      poolFactor(Math.max(sample.cols, sample.rows), LIGHTING_GRID_SIDE),
    ),
  );

  const grid = keep(Mat.createFromBuffer('uint8', light.height, light.width, 1, light.pixels));
  const background = keep(emptyMat());
  OpenCV.resize(
    grid,
    background,
    keep(Size.create(channel.cols, channel.rows)),
    0,
    0,
    InterpolationFlags.INTER_LINEAR,
  );

  const divided = keep(emptyMat());
  OpenCV.divide(channel, background, divided, PAPER_LEVEL);
  return divided;
}

function lookUp(image: Mat, table: Uint8Array, keep: Keep): Mat {
  const lut = keep(Mat.createFromBuffer('uint8', 1, 256, 1, table));
  const out = keep(emptyMat());
  OpenCV.LUT(image, lut, out);
  return out;
}

/**
 * Whitens paper and deepens ink in a lighting-evened greyscale Mat, with a tone curve fitted to
 * this page's histogram (`tone-curve.ts`).
 */
function applyToneCurve(even: Mat, keep: Keep): Mat {
  const { buffer } = shrink(even, HISTOGRAM_SAMPLE_SIDE, keep).toBuffer('uint8');
  const histogram = new Uint32Array(256);
  for (let i = 0; i < buffer.length; i += 1) {
    histogram[buffer[i] as number] = (histogram[buffer[i] as number] as number) + 1;
  }
  return lookUp(even, levelsCurve(pageLevels(histogram)), keep);
}

function gaussianBlur(image: Mat, sigma: number, keep: Keep): Mat {
  const side = 2 * Math.ceil(3 * sigma) + 1;
  const blurred = keep(emptyMat());
  OpenCV.GaussianBlur(image, blurred, keep(Size.create(side, side)), sigma);
  return blurred;
}

/**
 * Band-pass sharpening: adds back `SHARPEN_AMOUNT` times the stroke-sized detail, so thin text
 * that the lens and the enlargement softened turns dark and hard-edged again, without lifting
 * pixel-sized sensor noise. `detailScale` is how many page pixels one photo pixel became.
 */
function sharpen(image: Mat, detailScale: number, keep: Keep): Mat {
  return stage(keep, (own) => {
    const fine = gaussianBlur(image, SHARPEN_FINE_SIGMA * detailScale, own);
    const coarse = gaussianBlur(image, SHARPEN_COARSE_SIGMA * detailScale, own);
    // The band, offset to mid-grey so it fits in 8 bits either side of zero.
    const band = own(emptyMat());
    OpenCV.addWeighted(fine, SHARPEN_AMOUNT, coarse, -SHARPEN_AMOUNT, 128, band);
    const sharpened = own(emptyMat());
    OpenCV.addWeighted(image, 1, band, 1, -128, sharpened);
    return sharpened;
  });
}

/** Sharpens, then tones: the order that turns sharpening's overshoot into clean black and white. */
function toneText(even: Mat, detailScale: number, keep: Keep): Mat {
  return stage(keep, (own) => applyToneCurve(sharpen(even, detailScale, own), own));
}

/**
 * The "Magic Color" look. Lighting is evened out per colour channel, which also white-balances
 * the paper; sharpening and the tone curve then run on brightness alone, and faint tints are
 * snapped to grey, so black text and white paper carry no colour speckle while ink, stamps and
 * photos keep theirs.
 */
function magicColor(page: Mat, detailScale: number, keep: Keep): Mat {
  const ycrcb = stage(keep, (own) => {
    const channels = own(MatVector.create());
    OpenCV.split(page, channels);
    const evened = own(MatVector.create());
    for (let i = 0; i < channels.length; i += 1) {
      evened.push(stage(own, (step) => evenOutLighting(step(channels.get(i)), step)));
    }
    const balanced = own(emptyMat());
    OpenCV.merge(evened, balanced);
    const converted = own(emptyMat());
    OpenCV.cvtColor(balanced, converted, ColorConversionCodes.COLOR_BGR2YCrCb);
    return converted;
  });

  const toned = stage(keep, (own) => {
    const planes = own(MatVector.create());
    OpenCV.split(ycrcb, planes);
    const chroma = chromaCurve(CHROMA_DEAD_ZONE, CHROMA_GAIN);
    const out = own(MatVector.create());
    out.push(toneText(own(planes.get(0)), detailScale, own));
    out.push(lookUp(own(planes.get(1)), chroma, own));
    out.push(lookUp(own(planes.get(2)), chroma, own));
    const merged = own(emptyMat());
    OpenCV.merge(out, merged);
    return merged;
  });

  const result = keep(emptyMat());
  OpenCV.cvtColor(toned, result, ColorConversionCodes.COLOR_YCrCb2BGR);
  return result;
}

function applyFilter(page: Mat, filter: PageFilter, detailScale: number, keep: Keep): Mat {
  // The studio looks are a passport photo's (`passportPhoto`); on a page they change nothing.
  if (filter === 'original' || isStudioBackground(filter)) return page;

  if (filter === 'magic') return magicColor(page, detailScale, keep);

  const toned = stage(keep, (own) => {
    const gray = own(emptyMat());
    OpenCV.cvtColor(page, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    return toneText(evenOutLighting(gray, own), detailScale, own);
  });
  if (filter === 'grayscale') return toned;

  // Thresholded after the tone curve: paper is already flat white, so it cannot speckle.
  const block = 2 * Math.round((THRESHOLD_BLOCK_SHARE * Math.max(page.cols, page.rows)) / 2) + 1;
  const bw = keep(emptyMat());
  OpenCV.adaptiveThreshold(
    toned,
    bw,
    255,
    AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
    ThresholdTypes.THRESH_BINARY,
    Math.max(3, block),
    12,
  );
  return bw;
}

function rotate(image: Mat, rotation: PageRotation, keep: Keep): Mat {
  if (rotation === 0) return image;
  const turned = keep(emptyMat());
  OpenCV.rotate(
    image,
    turned,
    rotation === 90
      ? RotateFlags.ROTATE_90_CLOCKWISE
      : rotation === 180
        ? RotateFlags.ROTATE_180
        : RotateFlags.ROTATE_90_COUNTERCLOCKWISE,
  );
  return turned;
}

/** Writes a Mat as a JPEG in the app cache and returns its URI. */
function saveJpeg(image: Mat, prefix: string): string {
  const output = new File(Paths.cache, `${prefix}-${randomUUID()}.jpg`);
  image.saveToFile(output.uri, 'jpeg', JPEG_QUALITY);
  return output.uri;
}

/**
 * One small JPEG per filter the page's preset offers (`presetFilters`), for the review screen's
 * filter cards; a photo has only its original look.
 */
export type FilterPreviews = Readonly<Partial<Record<PageFilter, string>>>;

export type RenderedPage = {
  /** A JPEG in the app cache. Plaintext: it is deleted once sealed into the vault. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  /** Only when asked for; plaintext in the app cache like `uri`, and deleted with it. */
  readonly previews?: FilterPreviews;
  /**
   * A passport photo asked for a studio background that could not be made (no face or person
   * found, or the phone cannot do it), so it kept the photo's own.
   */
  readonly backgroundKept?: boolean;
};

export type RenderOptions = {
  /** Quarter turns clockwise, applied after the filter. */
  readonly rotation?: PageRotation;
  /** Also write a small preview of the page in every filter. */
  readonly previews?: boolean;
  /** What the page is for (`presets.ts`); an ordinary document page by default. */
  readonly preset?: ScanPreset;
};

type FlatPage = {
  /** The upright page, registered with the caller's `keep`. */
  readonly flat: Mat;
  /** How many page pixels one photo pixel became: the scale of the page's finest detail. */
  readonly detailScale: number;
};

/**
 * Warps the page inside `quad` of the photo at `photoUri` to an upright rectangle of its true
 * shape (`pageAspect`), `OUTPUT_LONG_SIDE` long. An ID card's shape is squared up to ID-1 when it
 * is close (`snapAspect`), so the card prints at its real proportions. The full-size photo is
 * released as soon as the warp is done. Bicubic, so text stays sharp-edged where the page is
 * enlarged.
 */
async function flattenPhoto(
  photoUri: string,
  quad: Quad,
  preset: ScanPreset,
  keep: Keep,
): Promise<FlatPage> {
  const owned: Releasable[] = [];
  const own: Keep = (object) => {
    owned.push(object);
    return object;
  };
  try {
    const image = await loadUpright(photoUri, own);
    const measured = pageAspect(quad, { width: image.cols, height: image.rows });
    const aspect =
      preset === 'id_card'
        ? snapAspect(measured, ID_CARD_ASPECT, ID_CARD_ASPECT_TOLERANCE)
        : measured;
    const out = flattenedSize(quad, OUTPUT_LONG_SIDE, MAX_UPSCALE, aspect);
    const caught = flattenedSize(quad, Number.POSITIVE_INFINITY, 1, aspect);
    const detailScale = Math.max(
      1,
      Math.max(out.width, out.height) / Math.max(caught.width, caught.height, 1),
    );

    // Filled point by point: the native `Point2fVector.create` ignores the points its typings
    // accept and always returns an empty vector.
    const toVector = (points: readonly GeometryPoint[]) => {
      const vector = own(Point2fVector.create());
      for (const p of points) vector.push(own(Point2f.create(p.x, p.y)));
      return vector;
    };
    const source = toVector(quad);
    const target = toVector(
      fullFrameQuad(out).map((p) => ({ x: p.x - (p.x ? 1 : 0), y: p.y - (p.y ? 1 : 0) })),
    );
    const transform = own(OpenCV.getPerspectiveTransform(source, target, DecompTypes.DECOMP_LU));

    const flat = keep(emptyMat());
    OpenCV.warpPerspective(
      image,
      flat,
      transform,
      own(Size.create(out.width, out.height)),
      InterpolationFlags.INTER_CUBIC,
      BorderTypes.BORDER_REPLICATE,
      own(Scalar.create(0)),
    );
    return { flat, detailScale };
  } finally {
    for (const object of owned.reverse()) releaseQuietly(object);
  }
}

/** `image` resized to exactly `width` × `height`, area-averaged (for shrinking). */
function resizeTo(image: Mat, width: number, height: number, keep: Keep): Mat {
  const sized = keep(emptyMat());
  OpenCV.resize(
    image,
    sized,
    keep(Size.create(Math.max(1, width), Math.max(1, height))),
    0,
    0,
    InterpolationFlags.INTER_AREA,
  );
  return sized;
}

function cropTo(image: Mat, rect: PixelRect, keep: Keep): Mat {
  const cut = keep(emptyMat());
  OpenCV.crop(image, cut, keep(Rect.create(rect.x, rect.y, rect.width, rect.height)));
  return cut;
}

/** Longest side of the copy the person is found on: plenty for a 413 × 531 photo, and quick. */
const PORTRAIT_SAMPLE_SIDE = 1600;

/** Where the person is in a passport photo, from the phone's face finder and person mask. */
type Portrait = {
  /** The person mask, greyscale, at the working copy's size. */
  readonly mask: Mat;
  /** The cut, in the working copy's pixels. It may reach past the edges. */
  readonly frame: PixelRect;
  /** The working copy's width over the full photo's. */
  readonly scale: number;
};

function deleteQuietly(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort: the OS clears the cache on its own when space runs low.
  }
}

/**
 * Finds the person in an upright photo: a working copy is written to the cache for the phone's
 * models (`cutOutPortrait`), the person mask read back, and the cut placed around the biggest
 * face (`passportFrame`). Both temporary files are deleted however it ends. Null when the phone
 * cannot do it, or finds no face or no person: the photo then keeps its own background.
 */
async function findPortrait(photo: Mat, keep: Keep): Promise<Portrait | null> {
  const small = shrink(photo, PORTRAIT_SAMPLE_SIDE, keep);
  const sampleUri = saveJpeg(small, 'portrait-sample');
  let maskUri: string | null = null;
  try {
    const cutout = await cutOutPortrait(sampleUri);
    maskUri = cutout.maskUri;
    const found = largestFace(cutout.faces);
    if (!found) return null;

    let mask = keep(Mat.createFromBase64(await new File(maskUri).base64()));
    const channels = mask.toBuffer('uint8').channels;
    if (channels !== 1) {
      const gray = keep(emptyMat());
      OpenCV.cvtColor(
        mask,
        gray,
        channels === 4 ? ColorConversionCodes.COLOR_BGRA2GRAY : ColorConversionCodes.COLOR_BGR2GRAY,
      );
      mask = gray;
    }
    // The mask is the size of the image the models read; resize it if that ever differs.
    if (mask.cols !== small.cols || mask.rows !== small.rows) {
      mask = resizeTo(mask, small.cols, small.rows, keep);
    }
    const factor = small.cols / cutout.width;
    const face: FaceBox = [
      found[0] * factor,
      found[1] * factor,
      found[2] * factor,
      found[3] * factor,
    ];
    const crown = crownRow(
      { width: mask.cols, height: mask.rows, pixels: mask.toBuffer('uint8').buffer },
      face,
    );
    return {
      mask,
      frame: passportFrame({ width: small.cols, height: small.rows }, face, crown),
      scale: small.cols / photo.cols,
    };
  } catch (error) {
    if (error instanceof OnDeviceVisionUnavailableError || error instanceof NoPersonFoundError) {
      return null;
    }
    throw error;
  } finally {
    deleteQuietly(sampleUri);
    deleteQuietly(maskUri);
  }
}

/**
 * `rect` of `image`, where `rect` may reach past the edges: the overhang is filled by `border`
 * (`BORDER_REPLICATE` for a photo; `BORDER_CONSTANT` with `value` for a mask).
 */
function cropPadded(
  image: Mat,
  rect: PixelRect,
  border: BorderTypes,
  value: number,
  keep: Keep,
): Mat {
  const pad = overhang(rect, { width: image.cols, height: image.rows });
  if (pad.top + pad.bottom + pad.left + pad.right === 0) return cropTo(image, rect, keep);
  const padded = keep(emptyMat());
  OpenCV.copyMakeBorder(
    image,
    padded,
    pad.top,
    pad.bottom,
    pad.left,
    pad.right,
    border,
    keep(Scalar.create(value, value, value)),
  );
  return cropTo(padded, { ...rect, x: rect.x + pad.left, y: rect.y + pad.top }, keep);
}

/**
 * A gentle levels stretch on brightness only (`photoLevels`), so a dull print or a dim room is
 * lifted while skin keeps its tones and colour is untouched.
 */
function liftBrightness(photo: Mat, keep: Keep): Mat {
  return stage(keep, (own) => {
    const ycrcb = own(emptyMat());
    OpenCV.cvtColor(photo, ycrcb, ColorConversionCodes.COLOR_BGR2YCrCb);
    const planes = own(MatVector.create());
    OpenCV.split(ycrcb, planes);
    const luma = own(planes.get(0));
    const levels = photoLevels(histogramOf(luma.toBuffer('uint8').buffer));
    const out = own(MatVector.create());
    out.push(lookUp(luma, levelsCurve(levels, 1), own));
    out.push(own(planes.get(1)));
    out.push(own(planes.get(2)));
    const merged = own(emptyMat());
    OpenCV.merge(out, merged);
    const bgr = own(emptyMat());
    OpenCV.cvtColor(merged, bgr, ColorConversionCodes.COLOR_YCrCb2BGR);
    return bgr;
  });
}

/**
 * The passport-photo look: 35 × 45 mm at 300 dpi (`PASSPORT_PHOTO`), brightness gently lifted,
 * none of the document filters' paper whitening, sharpening or ink deepening.
 *
 * With `portrait`, the cut is framed around the face (`passportFrame`), and for a studio filter
 * the person is laid over plain white or light blue through their mask
 * (`compositeOnBackground`). Without it, the largest centred cut of the photo as it was taken.
 */
function passportPhoto(
  photo: Mat,
  portrait: Portrait | null,
  filter: PageFilter,
  keep: Keep,
): Mat {
  return stage(keep, (own) => {
    if (!portrait) {
      const cut = cropTo(
        photo,
        centredCrop({ width: photo.cols, height: photo.rows }, PASSPORT_PHOTO_ASPECT),
        own,
      );
      return liftBrightness(resizeTo(cut, PASSPORT_PHOTO.width, PASSPORT_PHOTO.height, own), own);
    }

    const cut = cropPadded(
      photo,
      scaleRect(portrait.frame, 1 / portrait.scale),
      BorderTypes.BORDER_REPLICATE,
      0,
      own,
    );
    const person = liftBrightness(
      resizeTo(cut, PASSPORT_PHOTO.width, PASSPORT_PHOTO.height, own),
      own,
    );
    if (!isStudioBackground(filter)) return person;

    // Beyond the photo's edges is background: the mask is padded with 0.
    const maskCut = cropPadded(portrait.mask, portrait.frame, BorderTypes.BORDER_CONSTANT, 0, own);
    const alpha = lookUp(
      resizeTo(maskCut, PASSPORT_PHOTO.width, PASSPORT_PHOTO.height, own),
      alphaCurve(),
      own,
    );
    const pixels = compositeOnBackground(
      person.toBuffer('uint8').buffer,
      alpha.toBuffer('uint8').buffer,
      STUDIO_COLOURS[filter],
    );
    return own(
      Mat.createFromBuffer('uint8', PASSPORT_PHOTO.height, PASSPORT_PHOTO.width, 3, pixels),
    );
  });
}

/**
 * Writes a passport photo as the best-quality JPEG within `PASSPORT_MAX_BYTES`, trying
 * `PASSPORT_JPEG_QUALITIES` in turn. The last is kept even if a very busy photo is still over.
 */
function savePassportJpeg(image: Mat): string {
  let uri: string | null = null;
  for (const quality of PASSPORT_JPEG_QUALITIES) {
    deleteQuietly(uri);
    const output = new File(Paths.cache, `scan-page-${randomUUID()}.jpg`);
    image.saveToFile(output.uri, 'jpeg', quality);
    uri = output.uri;
    if (output.size <= PASSPORT_MAX_BYTES) break;
  }
  return uri as string;
}

/** Longest side of the copy a signature's ink is found on: plenty to box it, and quick. */
const INK_SAMPLE_SIDE = 800;
/** Room left around a trimmed signature, as a share of its size, and at least this many pixels. */
const SIGNATURE_MARGIN = 0.06;
const SIGNATURE_MIN_MARGIN = 24;

/**
 * Crops a finished signature page to its ink plus a margin (`inkBounds`). The ink is found on a
 * small, cleaned copy — lighting evened and toned, so paper is white whatever filter the page
 * was given — and the box scaled back up. A page with no ink found is left as it is.
 */
function trimToInk(page: Mat, singleChannel: boolean, keep: Keep): Mat {
  const box = withScope((own) => {
    let gray = page;
    if (!singleChannel) {
      gray = own(emptyMat());
      OpenCV.cvtColor(page, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    }
    const small = shrink(gray, INK_SAMPLE_SIDE, own);
    const cleaned = applyToneCurve(evenOutLighting(small, own), own);
    const found = inkBounds({
      width: cleaned.cols,
      height: cleaned.rows,
      pixels: cleaned.toBuffer('uint8').buffer,
    });
    if (!found) return null;
    const scale = page.cols / cleaned.cols;
    const x = Math.floor(found.x * scale);
    const y = Math.floor(found.y * scale);
    return padRect(
      {
        x,
        y,
        width: Math.min(page.cols - x, Math.ceil(found.width * scale)),
        height: Math.min(page.rows - y, Math.ceil(found.height * scale)),
      },
      { width: page.cols, height: page.rows },
      SIGNATURE_MARGIN,
      SIGNATURE_MIN_MARGIN,
    );
  });
  return box ? cropTo(page, box, keep) : page;
}

/** `image` shrunk to preview size and written as a filter card's JPEG. */
function savePreview(image: Mat, keep: Keep): string {
  return saveJpeg(shrink(image, PREVIEW_MAX_SIDE, keep), 'scan-preview');
}

/**
 * Flattens the page inside `quad`, applies `filter` and the rotation, and writes a JPEG to the
 * app cache — plus, when asked, one small preview per filter the preset offers, from the same
 * flattened page. The preset shapes the result (`presets.ts`): an ID card is squared up to
 * ID-1, a photo is cut to 35 × 45 mm and only gently corrected, and a signature is cropped to
 * its ink.
 */
export async function renderPage(
  photoUri: string,
  quad: Quad,
  filter: PageFilter,
  { rotation = 0, previews = false, preset = 'document' }: RenderOptions = {},
): Promise<RenderedPage> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };
  try {
    const { flat, detailScale } = await flattenPhoto(photoUri, quad, preset, keep);

    if (preset === 'photo') {
      const photo = rotate(flat, rotation, keep);
      // Found once, for the photo and every preview card.
      const portrait = await findPortrait(photo, keep);
      const result = passportPhoto(photo, portrait, filter, keep);
      let photoPreviews: FilterPreviews | undefined;
      if (previews) {
        const written: Partial<Record<PageFilter, string>> = {};
        for (const each of presetFilters(preset, portrait !== null)) {
          written[each] = savePreview(passportPhoto(photo, portrait, each, keep), keep);
        }
        photoPreviews = written;
      }
      return {
        uri: savePassportJpeg(result),
        width: result.cols,
        height: result.rows,
        ...(photoPreviews ? { previews: photoPreviews } : {}),
        ...(isStudioBackground(filter) && !portrait ? { backgroundKept: true } : {}),
      };
    }

    let previewUris: FilterPreviews | undefined;
    if (previews) {
      const small = shrink(flat, PREVIEW_MAX_SIDE, keep);
      const written: Partial<Record<PageFilter, string>> = {};
      for (const each of presetFilters(preset)) {
        written[each] = saveJpeg(
          rotate(applyFilter(small, each, 1, keep), rotation, keep),
          'scan-preview',
        );
      }
      previewUris = written;
    }

    let result = rotate(applyFilter(flat, filter, detailScale, keep), rotation, keep);
    if (preset === 'signature') {
      result = trimToInk(result, filter === 'grayscale' || filter === 'blackWhite', keep);
    }
    return {
      uri: saveJpeg(result, 'scan-page'),
      width: result.cols,
      height: result.rows,
      ...(previewUris ? { previews: previewUris } : {}),
    };
  } finally {
    for (const object of scope.reverse()) object.release();
  }
}

/**
 * Lays an ID card's rendered sides (front, then back) out on one A4 page at 300 dpi, each at the
 * card's true size (`idCardSheetLayout`) on white, and writes it as a JPEG in the app cache — a
 * plaintext temporary file like every render, for the caller to seal and delete. Each half of
 * the sheet is one side padded with white; the halves are stacked.
 */
export async function composeIdCardSheet(sides: readonly { uri: string }[]): Promise<RenderedPage> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };
  try {
    const images: Mat[] = [];
    for (const side of sides) images.push(await loadUpright(side.uri, keep));
    const { sheet, placements } = idCardSheetLayout(
      images.map((image) => ({ width: image.cols, height: image.rows })),
    );

    const half = Math.floor(sheet.height / 2);
    const white = keep(Scalar.create(255, 255, 255));
    const parts = keep(MatVector.create());
    placements.forEach((place, index) => {
      const sized = resizeTo(images[index] as Mat, place.width, place.height, keep);
      const top = index * half;
      // The last part runs to the sheet's foot, so the halves always add up to the whole page.
      const bottom = index === placements.length - 1 ? sheet.height : top + half;
      const padded = keep(emptyMat());
      OpenCV.copyMakeBorder(
        sized,
        padded,
        place.y - top,
        bottom - (place.y + place.height),
        place.x,
        sheet.width - (place.x + place.width),
        BorderTypes.BORDER_CONSTANT,
        white,
      );
      parts.push(padded);
    });

    const page = keep(emptyMat());
    OpenCV.vconcat(parts, page);
    return { uri: saveJpeg(page, 'scan-idcard'), width: page.cols, height: page.rows };
  } finally {
    for (const object of scope.reverse()) releaseQuietly(object);
  }
}
