/**
 * Auto-fit: preparing a customer file for one upload box at the moment it is attached.
 * Master spec §7.4.5 ("Prepare file using document tools") and §13.2 ("Compress to target KB").
 *
 * The common case this exists for: the customer's Aadhaar is a 1.2 MB PDF scan and the portal
 * says "PDF, max 200 KB", or the vault photo is a 150 KB PNG and the portal wants a 20–50 KB
 * JPEG. The operator used to open Document Tools Studio for that; the extension can now run the
 * same encoders itself, show the operator the result, and attach it once they confirm.
 *
 * This module is the pure half — deciding *whether* a file needs fitting and *what* it should
 * become. The browser half (decode, encode, rasterise) is `encodeToWindow` and `compressPdf`,
 * run by the extension's offscreen document. Nothing here touches bytes.
 *
 * What it will not do, on purpose:
 *
 *   - Change a PDF into an image or an image into a PDF. A box that wants a PDF and is offered a
 *     photo is a box the operator has matched to the wrong document.
 *   - Crop. Framing a face is a judgement; that stays in Document Tools Studio.
 *   - Grow a PDF to a minimum size. There is no lossless way to, and a padded PDF is a strange
 *     thing to hand a government portal.
 */

import { judgeSize } from './sizing';

/** Image types every Chromium canvas can decode. HEIC is deliberately absent: it cannot. */
export const AUTO_FIT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Largest source the extension will try to fit. The bytes cross one extension message as
 * base64 on their way to the offscreen document, and a 12 MP phone photo decodes to ~48 MB of
 * bitmap — past this the operator is better served by Document Tools Studio.
 */
export const AUTO_FIT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export type AutoFitSource = { filename: string; mimeType: string; sizeBytes: number };

/**
 * The exact picture a box wants, when it states one: "6.0 cm × 2.0 cm at 300 DPI" is
 * 709 × 236 px. `subject` decides how a source that is not already that shape gets there.
 */
export type AutoFitDimensions = {
  widthPx: number;
  heightPx: number;
  /** Written into the JPEG header, so a portal that measures centimetres reads them back. */
  dpi: number | null;
  /**
   * `signature`: paper margin trimmed, then centred on white — a signature on a wider sheet is
   * still a signature. `photo`: never cropped; one of the wrong shape needs a person to frame the
   * face. `document`: centred on white.
   */
  subject: 'signature' | 'photo' | 'document';
};

/** A portal's KB window. `null` and absent both mean the notice did not state that end. */
export type AutoFitWindow = {
  minBytes?: number | null;
  maxBytes?: number | null;
  /** Set when the box states a pixel or physical size; images are then redrawn to it. */
  dimensions?: AutoFitDimensions | null;
};

/** The upload box's own `accept` check, passed in so this package needs no form-engine import. */
export type AcceptsFile = (file: { filename: string; mimeType: string }) => boolean;

export type AutoFitBlockReason =
  /** Not an image a canvas can decode and not a PDF. */
  | 'unsupported_type'
  /** Over `AUTO_FIT_MAX_SOURCE_BYTES`. */
  | 'source_too_large'
  /** A PDF the box does not accept — fitting cannot change what kind of document it is. */
  | 'type_not_accepted'
  /** An image that has to become a JPEG, for a box whose `accept` rules JPEG out. */
  | 'jpeg_not_accepted'
  /** A PDF under the portal's minimum. */
  | 'below_minimum';

/**
 * Found only once the image is decoded: a photo whose shape is too far from the box's to resize
 * without cropping, and framing a face is a person's call.
 */
export type AutoFitLateBlockReason = 'needs_crop';

export type AutoFitPlan =
  | { action: 'none' }
  | {
      action: 'image';
      /** Always JPEG: it is the only format with a quality knob to search along. */
      outputMimeType: 'image/jpeg';
      filename: string;
      minBytes?: number;
      maxBytes?: number;
      /** The source was not a JPEG, so the format changes. Named on the confirm card. */
      converted: boolean;
      /** Redraw to this exact size first; the KB search then never downscales. */
      resize?: AutoFitDimensions;
    }
  | { action: 'pdf'; filename: string; maxBytes: number }
  | { action: 'cannot_fit'; reason: AutoFitBlockReason };

function definedBytes(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function baseName(filename: string): string {
  const stripped = filename.replace(/\.[a-z0-9]+$/i, '');
  return stripped.length > 0 ? stripped : 'document';
}

function isAutoFitImage(mimeType: string): boolean {
  return (AUTO_FIT_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

/**
 * The JPEG filename this box will take, or `null` if it takes none.
 *
 * `.jpg` first because that is what most portal notices write; `.jpeg` second for the portal
 * whose `accept` lists only that spelling. A JPEG source already named for the box keeps its
 * name unchanged.
 */
function jpegFilenameFor(source: AutoFitSource, accepts: AcceptsFile): string | null {
  if (
    source.mimeType.toLowerCase() === 'image/jpeg' &&
    /\.jpe?g$/i.test(source.filename) &&
    accepts({ filename: source.filename, mimeType: 'image/jpeg' })
  ) {
    return source.filename;
  }
  const base = baseName(source.filename);
  for (const extension of ['.jpg', '.jpeg']) {
    const candidate = `${base}${extension}`;
    if (accepts({ filename: candidate, mimeType: 'image/jpeg' })) return candidate;
  }
  return null;
}

/**
 * Decides what, if anything, has to happen to `source` before it goes into this upload box.
 *
 * Runs twice per file: in the side panel on metadata alone, to decide whether to offer a fit at
 * all, and again in the background worker on the real byte count, because a row's `sizeBytes`
 * is what the database says and the download is what the portal will receive.
 */
export function planAutoFit(
  source: AutoFitSource,
  window: AutoFitWindow,
  accepts: AcceptsFile,
): AutoFitPlan {
  const mimeType = source.mimeType.toLowerCase();
  const isPdf = mimeType === 'application/pdf';
  if (!isPdf && !isAutoFitImage(mimeType))
    return { action: 'cannot_fit', reason: 'unsupported_type' };

  const minBytes = definedBytes(window.minBytes);
  const maxBytes = definedBytes(window.maxBytes);
  const resize = isPdf ? undefined : usableDimensions(window.dimensions);
  const accepted = accepts({ filename: source.filename, mimeType: source.mimeType });
  const verdict = judgeSize(source.sizeBytes, {
    ...(minBytes !== undefined ? { minBytes } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
  });

  /*
   * A stated size is checked by the portal on the pixels, and an original upload's metadata has
   * none — so an image for a sized box is always redrawn. Redrawing one that is already right
   * costs a second, and the operator still sees and confirms it.
   */
  if (accepted && (verdict === 'ok' || verdict === 'unknown') && !resize) {
    return { action: 'none' };
  }
  if (source.sizeBytes > AUTO_FIT_MAX_SOURCE_BYTES) {
    return { action: 'cannot_fit', reason: 'source_too_large' };
  }

  if (isPdf) {
    if (!accepted) return { action: 'cannot_fit', reason: 'type_not_accepted' };
    if (verdict === 'too_small') return { action: 'cannot_fit', reason: 'below_minimum' };
    // `accepted` and not `ok`/`unknown`/`too_small` leaves `too_large`, so `maxBytes` is set.
    return { action: 'pdf', filename: source.filename, maxBytes: maxBytes as number };
  }

  const filename = jpegFilenameFor(source, accepts);
  if (filename === null) return { action: 'cannot_fit', reason: 'jpeg_not_accepted' };

  return {
    action: 'image',
    outputMimeType: 'image/jpeg',
    filename,
    ...(minBytes !== undefined ? { minBytes } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    converted: mimeType !== 'image/jpeg',
    ...(resize ? { resize } : {}),
  };
}

/** Dimensions worth acting on: whole pixels, in a range no misread could produce. */
function usableDimensions(
  dimensions: AutoFitDimensions | null | undefined,
): AutoFitDimensions | undefined {
  if (!dimensions) return undefined;
  const sane = (value: number) => Number.isInteger(value) && value >= 16 && value <= 8000;
  return sane(dimensions.widthPx) && sane(dimensions.heightPx) ? dimensions : undefined;
}

// ---------------------------------------------------------------------------
// Describing a fit to the operator
// ---------------------------------------------------------------------------

/** What the encoders report back, trimmed to what the confirm card needs. */
export type AutoFitReport = {
  fromBytes: number;
  toBytes: number;
  /** Image: the format changed (PNG → JPEG). */
  converted: boolean;
  /** Image: resolution multiplier the search fell back to; 1 or `null` when none. */
  scale: number | null;
  /** Image: comment padding added to reach the minimum. Invisible in the picture. */
  padded: boolean;
  /** PDF: pages flattened to pictures. Text is no longer selectable. */
  rasterised: boolean;
  /** PDF: DPI the pages were rasterised at, when they were. */
  dpi: number | null;
  /** Image: redrawn to the box's exact size. Absent on reports from before resizing existed. */
  resized?: { widthPx: number; heightPx: number; dpi: number | null } | null;
};

/** "1.2 MB", "186 KB" — a size the way an operator reads it off a portal notice. */
export function formatFileSize(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe >= 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(safe / 1024))} KB`;
}

/**
 * The changes worth telling an operator about before they confirm, most consequential first.
 *
 * Rasterising leads, and says what it costs, because it is the one change that can make an
 * identity document hard to read — and the confirm card exists precisely so that is a decision
 * someone looked at rather than one the extension made on its own.
 */
export function describeAutoFit(report: AutoFitReport): { headline: string; changes: string[] } {
  const changes: string[] = [];
  if (report.rasterised) {
    changes.push(
      `Pages turned into images${report.dpi ? ` at ${report.dpi} DPI` : ''} — check the text is still readable.`,
    );
  }
  if (report.resized) {
    const { widthPx, heightPx, dpi } = report.resized;
    const cm = (px: number, at: number) => ((px / at) * 2.54).toFixed(1);
    changes.push(
      dpi
        ? `Resized to ${cm(widthPx, dpi)} × ${cm(heightPx, dpi)} cm (${widthPx} × ${heightPx} px at ${dpi} DPI).`
        : `Resized to ${widthPx} × ${heightPx} px.`,
    );
  }
  if (report.converted) changes.push('Converted to JPEG.');
  if (report.scale !== null && report.scale < 1) {
    changes.push(`Resolution reduced to ${Math.round(report.scale * 100)}%.`);
  }
  if (report.padded) changes.push('Padded to reach the minimum size — the picture is unchanged.');
  return {
    headline: `${formatFileSize(report.fromBytes)} → ${formatFileSize(report.toBytes)}`,
    changes,
  };
}

/** Why a file could not be fitted, as one sentence for the panel. */
export const AUTO_FIT_BLOCK_MESSAGES: Record<
  AutoFitBlockReason | AutoFitLateBlockReason | 'still_over_limit' | 'processing_failed',
  string
> = {
  needs_crop:
    'This photo is not the shape the portal asks for and needs cropping — prepare it in Document Tools Studio.',
  unsupported_type: 'This file type cannot be resized automatically.',
  source_too_large: 'This file is too large to resize here — prepare it in Document Tools Studio.',
  type_not_accepted: 'This upload box does not accept this kind of document.',
  jpeg_not_accepted:
    'This box needs a different image format — prepare it in Document Tools Studio.',
  below_minimum: 'This PDF is smaller than the portal’s minimum and cannot be enlarged.',
  still_over_limit:
    'Could not get this file under the portal’s limit without making it unreadable — prepare it in Document Tools Studio.',
  processing_failed: 'Could not resize this file. Prepare it in Document Tools Studio instead.',
};
