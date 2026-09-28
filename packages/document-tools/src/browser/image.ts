/**
 * Canvas image operations.
 * Master spec §13.2 — the photo and signature tools.
 *
 * Everything here runs in the operator's browser. That is a privacy decision before it is a
 * performance one: an uncropped Aadhaar card, a signature, a customer's face never leave the
 * machine unless the operator explicitly saves a prepared file. The server sees the finished
 * derivative or nothing at all (docs/SECURITY.md §4).
 *
 * The arithmetic these functions apply lives in the pure modules one directory up, and is unit
 * tested there. What is left in this file is the canvas plumbing: decode, draw, read back, encode.
 */

import {
  MAX_QUALITY,
  cleanSignature,
  contentBoundingBox,
  enhance,
  estimateInitialScale,
  isJpeg,
  nextQualityProbe,
  padJpegToMinimum,
  recordQualityProbe,
  startQualitySearch,
  type CleanSignatureOptions,
  type EnhanceOptions,
  type OutputMimeType,
  type Rect,
  type RgbaImage,
} from '../index';
import type { RedactionBox } from '../cards';
import { cutMarksForCell, type SheetLayout } from '../sheets';

export type { RedactionBox };

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export type DecodedImage = {
  /** Drawable at natural size. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the GPU-side bitmap. Always call it; a 12 MP bitmap is ~48 MB. */
  release: () => void;
};

/**
 * Decodes a `File` or `Blob` to something drawable.
 *
 * `createImageBitmap` is preferred because it decodes off the main thread — an operator dropping
 * a 12 MP phone photo should not see the UI freeze. `<img>` with an object URL is the fallback
 * for browsers that refuse the blob (some older Safari builds).
 */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path rather than failing the operator's upload.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image_decode_failed'));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas_context_unavailable');
  return context;
}

/** Paints the canvas white. JPEG has no alpha, and an unpainted canvas encodes to black. */
export function fillWhite(canvas: HTMLCanvasElement): void {
  const context = context2d(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Runs a pure pixel operation over a canvas.
 *
 * One `getImageData` / `putImageData` pair per call. Chaining several operations through this
 * helper costs a round trip each, which is the right trade: the alternative is a fused pipeline
 * that cannot be unit tested one step at a time.
 */
export function applyPixels(
  canvas: HTMLCanvasElement,
  operation: (image: RgbaImage) => RgbaImage,
): void {
  const context = context2d(canvas);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = operation({
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  });

  // The pure operations mutate in place and hand the same buffer back, so the common path writes
  // the `ImageData` we already have. The copy is the honest fallback for an operation that
  // returns a fresh buffer — `new Uint8ClampedArray(…)` re-backs it with a plain ArrayBuffer,
  // which is what the `ImageData` constructor accepts.
  if (result.data === imageData.data) {
    context.putImageData(imageData, 0, 0);
    return;
  }
  context.putImageData(
    new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
    0,
    0,
  );
}

export function applyEnhance(canvas: HTMLCanvasElement, options: EnhanceOptions): void {
  applyPixels(canvas, (image) => enhance(image, options));
}

export function applyCleanSignature(
  canvas: HTMLCanvasElement,
  options: CleanSignatureOptions,
): void {
  applyPixels(canvas, (image) => cleanSignature(image, options));
}

/**
 * The crop rectangle that trims uniform border off the canvas, or `null` if there is none.
 * Reads pixels but changes nothing — the caller decides whether to apply it.
 */
export function findTrimRect(
  canvas: HTMLCanvasElement,
  options: { tolerance?: number; padding?: number } = {},
): Rect | null {
  const context = context2d(canvas);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return contentBoundingBox(
    { data: imageData.data, width: imageData.width, height: imageData.height },
    options,
  );
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type RenderOptions = {
  /** Region of the source to take. Defaults to the whole thing. */
  crop?: Rect;
  /** Output size. Defaults to the crop size. */
  width?: number;
  height?: number;
  /** Free rotation in degrees, clockwise. Applied around the centre of the crop. */
  rotate?: number;
  flipHorizontal?: boolean;
  /** JPEG cannot carry alpha, so a background is painted unless the output is PNG. */
  background?: string | null;
};

/**
 * Crop → rotate → scale, in one draw.
 *
 * Order matters and this is the order an operator expects from the controls: they frame the
 * subject, straighten it, and the tool then produces the portal's pixel size. Doing it in one
 * `drawImage` also means one resampling pass, which is what keeps a 3.5 × 4.5 cm crop of a phone
 * photo looking like a photograph rather than like a thumbnail that has been enlarged.
 */
export function renderImage(image: DecodedImage, options: RenderOptions = {}): HTMLCanvasElement {
  const crop = options.crop ?? { x: 0, y: 0, width: image.width, height: image.height };
  const rotate = options.rotate ?? 0;

  // Free rotation grows the frame; the output canvas has to hold the rotated crop.
  const radians = (rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const rotatedWidth = crop.width * cos + crop.height * sin;
  const rotatedHeight = crop.width * sin + crop.height * cos;

  const outWidth = options.width ?? rotatedWidth;
  const outHeight = options.height ?? rotatedHeight;

  const canvas = createCanvas(outWidth, outHeight);
  const context = context2d(canvas);

  if (options.background !== null) {
    context.fillStyle = options.background ?? '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Bilinear-ish smoothing. Off would produce aliased edges on a downscaled face; "high" is
  // what makes a 4000 px photo resample cleanly to 276 px.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(
    (canvas.width / rotatedWidth) * (options.flipHorizontal ? -1 : 1),
    canvas.height / rotatedHeight,
  );
  if (rotate !== 0) context.rotate(radians);
  context.drawImage(
    image.source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -crop.width / 2,
    -crop.height / 2,
    crop.width,
    crop.height,
  );
  context.restore();

  return canvas;
}

/** Scales a canvas by a factor, for the compressor's resolution ladder. */
export function scaleCanvas(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return canvas;
  const scaled = createCanvas(canvas.width * scale, canvas.height * scale);
  const context = context2d(scaled);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

export type StampOptions = {
  /** Printed on the photo. SSC, NTA, UPSC and the Army all require it (§13.2). */
  name: string;
  /** Date the photo was taken, already formatted for display. */
  date: string;
  position?: 'bottom' | 'top';
  /** Fraction of the photo height the text band occupies. */
  bandHeight?: number;
};

/**
 * Prints the candidate's name and the capture date across the photo.
 *
 * A white band with black text rather than text laid over the face: several portals specify the
 * text must be legible, and text over a dark shirt at 276 px wide is not. The band is drawn
 * *inside* the frame, so the photo remains exactly the pixel size the portal asked for — growing
 * the canvas to make room would silently break the dimension rule the operator just satisfied.
 */
export function drawNameDateStamp(canvas: HTMLCanvasElement, options: StampOptions): void {
  const { name, date, position = 'bottom', bandHeight = 0.14 } = options;
  const context = context2d(canvas);
  const band = Math.max(14, Math.round(canvas.height * bandHeight));
  const top = position === 'bottom' ? canvas.height - band : 0;

  context.save();
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.fillRect(0, top, canvas.width, band);

  context.fillStyle = '#111111';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const lines = [name.trim(), date.trim()].filter((line) => line !== '');
  // Fit the longest line to 92% of the width rather than guessing a point size: a 276 px photo
  // and a 1000 px photo both have to end up legible.
  let fontSize = Math.max(6, Math.floor(band / (lines.length + 0.4)));
  for (; fontSize > 5; fontSize -= 1) {
    context.font = `600 ${fontSize}px system-ui, sans-serif`;
    const widest = Math.max(...lines.map((line) => context.measureText(line).width));
    if (widest <= canvas.width * 0.92) break;
  }

  const lineHeight = band / (lines.length + 0.4);
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, top + lineHeight * (index + 0.7));
  });
  context.restore();
}

/**
 * Paints redaction boxes over the canvas.
 *
 * Destructive by construction: the pixels underneath are replaced, not covered by a layer. A
 * "redaction" that leaves the original data recoverable is the failure mode that makes news, and
 * a flattened canvas has no layers to peel back.
 */
export function drawRedactions(canvas: HTMLCanvasElement, boxes: readonly RedactionBox[]): void {
  if (boxes.length === 0) return;
  const context = context2d(canvas);
  context.save();
  for (const box of boxes) {
    context.fillStyle = '#111111';
    context.fillRect(box.x, box.y, box.width, box.height);

    if (box.style === 'crosses') {
      // The XXXX XXXX convention a masked Aadhaar prints, so the redaction reads as deliberate
      // rather than as a printer fault.
      const size = Math.max(8, Math.floor(box.height * 0.62));
      context.fillStyle = '#ffffff';
      context.font = `700 ${size}px ui-monospace, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const crosses = Math.max(4, Math.floor(box.width / (size * 0.72)));
      context.fillText(
        'X'.repeat(Math.min(24, crosses)),
        box.x + box.width / 2,
        box.y + box.height / 2,
        box.width * 0.94,
      );
    }
  }
  context.restore();
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Tiles one photo across a print sheet.
 *
 * The photo is drawn to fill each cell, cropping the overflow, because the cell is already the
 * physical size the customer asked for — letterboxing would print white bars the operator then
 * has to cut around.
 */
export function composePhotoSheet(
  photo: HTMLCanvasElement,
  layout: SheetLayout,
  options: { cutMarks?: boolean } = {},
): HTMLCanvasElement {
  const sheet = createCanvas(layout.sheetWidthPx, layout.sheetHeightPx);
  const context = context2d(sheet);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  for (const cell of layout.cells) {
    // On a turned grid the cell is the photo on its side: fill the upright slot, then rotate it a
    // quarter turn into place. Filling the cell directly would stretch the face sideways.
    const slotWidth = layout.turned ? cell.height : cell.width;
    const slotHeight = layout.turned ? cell.width : cell.height;
    const scale = Math.max(slotWidth / photo.width, slotHeight / photo.height);
    const drawWidth = photo.width * scale;
    const drawHeight = photo.height * scale;
    context.save();
    context.beginPath();
    context.rect(cell.x, cell.y, cell.width, cell.height);
    context.clip();
    context.translate(cell.x + cell.width / 2, cell.y + cell.height / 2);
    if (layout.turned) context.rotate(Math.PI / 2);
    context.drawImage(photo, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  }

  if (options.cutMarks !== false) {
    context.strokeStyle = 'rgba(0,0,0,0.55)';
    context.lineWidth = Math.max(1, Math.round(layout.dpi / 300));
    const tick = Math.round(layout.dpi * 0.05); // ~1.3 mm
    context.beginPath();
    for (const cell of layout.cells) {
      for (const [x1, y1, x2, y2] of cutMarksForCell(cell, tick)) {
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
      }
    }
    context.stroke();
  }

  return sheet;
}

/** Places already-prepared card faces into their slots on a sheet. */
export function composeCardSheet(
  faces: readonly HTMLCanvasElement[],
  layout: { sheetWidthPx: number; sheetHeightPx: number; slots: readonly Rect[]; dpi: number },
  options: { cutMarks?: boolean } = {},
): HTMLCanvasElement {
  const sheet = createCanvas(layout.sheetWidthPx, layout.sheetHeightPx);
  const context = context2d(sheet);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  layout.slots.forEach((slot, index) => {
    const face = faces[index % Math.max(1, faces.length)];
    if (!face) return;
    context.drawImage(face, slot.x, slot.y, slot.width, slot.height);
    if (options.cutMarks !== false) {
      context.strokeStyle = 'rgba(0,0,0,0.5)';
      context.lineWidth = Math.max(1, Math.round(layout.dpi / 300));
      context.strokeRect(slot.x, slot.y, slot.width, slot.height);
    }
  });

  return sheet;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: OutputMimeType,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas_encode_failed'))),
      mimeType,
      quality,
    );
  });
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export type EncodeResult = {
  bytes: Uint8Array;
  mimeType: OutputMimeType;
  width: number;
  height: number;
  /** JPEG quality actually used, or `null` for PNG. */
  quality: number | null;
  /** Resolution multiplier the search had to fall back to, 1 when none was needed. */
  scale: number;
  /** True when comment padding was added to reach the portal's minimum size. */
  padded: boolean;
  /** Set when the maximum could not be met even at the lowest rung. */
  overLimit: boolean;
};

/**
 * Encodes a canvas into a portal's KB window.
 *
 * PNG has no quality knob, so a PNG that overshoots is re-encoded as JPEG only if the caller
 * asked for JPEG; otherwise it is handed back as-is with `overLimit` set. Silently swapping the
 * format would break a portal that validates the extension.
 */
export async function encodeToWindow(
  canvas: HTMLCanvasElement,
  options: {
    mimeType: OutputMimeType;
    minBytes?: number;
    maxBytes?: number;
  },
): Promise<EncodeResult> {
  const { mimeType, minBytes, maxBytes } = options;

  if (mimeType === 'image/png' || maxBytes === undefined) {
    const blob = await canvasToBlob(canvas, mimeType, mimeType === 'image/jpeg' ? MAX_QUALITY : undefined);
    let bytes = await blobBytes(blob);
    const padded = minBytes !== undefined && bytes.length < minBytes && isJpeg(bytes);
    if (padded) bytes = padJpegToMinimum(bytes, minBytes);
    return {
      bytes,
      mimeType,
      width: canvas.width,
      height: canvas.height,
      quality: mimeType === 'image/jpeg' ? MAX_QUALITY : null,
      scale: 1,
      padded,
      overLimit: maxBytes !== undefined && bytes.length > maxBytes,
    };
  }

  // Opening guess from the un-compressed size, so the common "4 MB photo into 50 KB" case does
  // not spend its probe budget at full resolution.
  const reference = await blobBytes(await canvasToBlob(canvas, 'image/jpeg', MAX_QUALITY));
  let state = startQualitySearch({ startScale: estimateInitialScale(reference.length, maxBytes) });

  const rendered = new Map<number, HTMLCanvasElement>([[1, canvas]]);
  const encoded = new Map<string, Uint8Array>();
  let probe = nextQualityProbe(state);

  while (probe) {
    const key = `${probe.scale}:${probe.quality}`;
    let bytes = encoded.get(key);
    if (!bytes) {
      let target = rendered.get(probe.scale);
      if (!target) {
        target = scaleCanvas(canvas, probe.scale);
        rendered.set(probe.scale, target);
      }
      bytes = await blobBytes(await canvasToBlob(target, 'image/jpeg', probe.quality));
      encoded.set(key, bytes);
    }
    state = recordQualityProbe(state, probe, bytes.length, maxBytes);
    probe = nextQualityProbe(state);
  }

  const best = state.best;
  if (!best) {
    // Nothing fitted. Hand back the smallest thing produced and say so, rather than pretending.
    const smallest = [...encoded.values()].sort((a, b) => a.length - b.length)[0] ?? reference;
    const fallback = rendered.get(state.scale) ?? canvas;
    return {
      bytes: smallest,
      mimeType: 'image/jpeg',
      width: fallback.width,
      height: fallback.height,
      quality: state.low,
      scale: state.scale,
      padded: false,
      overLimit: true,
    };
  }

  let bytes = encoded.get(`${best.scale}:${best.quality}`) ?? reference;
  const padded = minBytes !== undefined && bytes.length < minBytes;
  if (padded) bytes = padJpegToMinimum(bytes, minBytes);

  const target = rendered.get(best.scale) ?? canvas;
  return {
    bytes,
    mimeType: 'image/jpeg',
    width: target.width,
    height: target.height,
    quality: best.quality,
    scale: best.scale,
    // Padding can push past the maximum if the window is narrower than the padding overhead;
    // report that honestly rather than hiding it.
    padded,
    overLimit: bytes.length > maxBytes,
  };
}

/** A data URL for an `<img>` preview, from bytes already encoded. */
export function bytesToObjectUrl(bytes: Uint8Array, mimeType: string): string {
  // Copy into a fresh buffer: a Uint8Array view over a larger ArrayBuffer would blob the lot.
  return URL.createObjectURL(new Blob([bytes.slice()], { type: mimeType }));
}

/**
 * Wraps an existing canvas so it can be fed back through `renderImage`.
 *
 * The editors keep a "working canvas" — the source with straightening and adjustments already
 * baked in — and crop from that rather than from the original. Two resampling passes cost a
 * little sharpness, but the alternative is recomputing rotation on every pointer move of a crop
 * handle, which is what makes an editor feel slow.
 */
export function canvasAsSource(canvas: HTMLCanvasElement): DecodedImage {
  return {
    source: canvas,
    width: canvas.width,
    height: canvas.height,
    release: () => undefined,
  };
}
