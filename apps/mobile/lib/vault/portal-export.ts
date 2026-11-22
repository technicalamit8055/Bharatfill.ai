/**
 * Export for a form, on the phone: one vault page shaped to a portal preset (`portal-presets.ts`)
 * and encoded as a JPEG inside the portal's KB window, then handed to the share sheet.
 *
 * The size search is the extension's own (`@assistigo/document-tools` sizing): JPEG quality is
 * walked down until the file fits under the maximum — and the picture shrunk too, only when the
 * preset states no picture size. A file still under the minimum is padded with JPEG comment
 * segments, which every decoder skips, so the picture is unchanged. The DPI the preset names is
 * written into the JPEG header, for portals that measure centimetres.
 *
 * Plaintext exists only in memory and in two short-lived cache files: each encode probe (deleted
 * straight after it is read) and the shared copy (deleted when the share sheet closes). Nothing
 * is logged; the file is named after the preset, never the citizen.
 */

import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import {
  BorderTypes,
  ColorConversionCodes,
  DataTypes,
  InterpolationFlags,
  Mat,
  OpenCV,
  Rect,
  Scalar,
  Size,
} from 'react-native-fast-opencv';
import {
  estimateInitialScale,
  judgeSize,
  nextQualityProbe,
  padJpegToMinimum,
  recordQualityProbe,
  type RequirementPreset,
  setJpegDpi,
  type SizeVerdict,
  startQualitySearch,
} from '@assistigo/document-tools';

import { pageBase64, shareJpegBytes } from './document-export';
import {
  canShrink,
  planPortalRender,
  portalFileName,
  type PortalRenderPlan,
} from './portal-presets';
import type { VaultDocument } from './vault-index';

/** Quality used when the preset states no maximum: sharp, still a modest file. */
const OPEN_QUALITY = 0.92;

export type PortalExportResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly fileName: string;
      readonly width: number;
      readonly height: number;
      readonly verdict: SizeVerdict;
    }
  | { readonly ok: false; readonly reason: 'needs_crop' | 'too_large' };

type Releasable = { release(): void };

function emptyMat(): Mat {
  return Mat.create(0, 0, DataTypes.CV_8U);
}

/** The source page as 3-channel BGR, whatever it was stored as. */
function toBgr(image: Mat, keep: <R extends Releasable>(object: R) => R): Mat {
  const channels = image.toBuffer('uint8').channels;
  if (channels === 3) return image;
  const bgr = keep(emptyMat());
  OpenCV.cvtColor(
    image,
    bgr,
    channels === 4 ? ColorConversionCodes.COLOR_BGRA2BGR : ColorConversionCodes.COLOR_GRAY2BGR,
  );
  return bgr;
}

function resized(
  image: Mat,
  width: number,
  height: number,
  keep: <R extends Releasable>(object: R) => R,
): Mat {
  if (image.cols === width && image.rows === height) return image;
  const out = keep(emptyMat());
  const shrinking = width < image.cols;
  OpenCV.resize(
    image,
    out,
    keep(Size.create(width, height)),
    0,
    0,
    shrinking ? InterpolationFlags.INTER_AREA : InterpolationFlags.INTER_CUBIC,
  );
  return out;
}

/** The picture the portal wants, before any file-size work. */
function shape(
  source: Mat,
  plan: Exclude<PortalRenderPlan, { kind: 'needs_crop' }>,
  keep: <R extends Releasable>(object: R) => R,
): Mat {
  switch (plan.kind) {
    case 'keep':
      return source;
    case 'cover': {
      const cut = keep(emptyMat());
      const { x, y, width, height } = plan.crop;
      OpenCV.crop(source, cut, keep(Rect.create(x, y, width, height)));
      return resized(cut, plan.size.width, plan.size.height, keep);
    }
    case 'contain': {
      const { content, frame } = plan;
      const fitted = resized(source, content.width, content.height, keep);
      const framed = keep(emptyMat());
      OpenCV.copyMakeBorder(
        fitted,
        framed,
        content.y,
        frame.height - content.height - content.y,
        content.x,
        frame.width - content.width - content.x,
        BorderTypes.BORDER_CONSTANT,
        keep(Scalar.create(255, 255, 255)),
      );
      return framed;
    }
  }
}

/** One JPEG encode through a throwaway cache file; the file is gone before this returns. */
async function encode(image: Mat, quality: number): Promise<Uint8Array> {
  const probe = new File(Paths.cache, `portal-probe-${randomUUID()}.jpg`);
  try {
    image.saveToFile(probe.uri, 'jpeg', Math.min(1, Math.max(0.01, quality)));
    return await probe.bytes();
  } finally {
    try {
      if (probe.exists) probe.delete();
    } catch {
      // The OS clears the cache folder on its own.
    }
  }
}

/** Shapes the document's first page to `preset` and encodes it inside the preset's KB window. */
export async function renderForPortal(
  document: VaultDocument,
  preset: RequirementPreset,
): Promise<PortalExportResult> {
  const scope: Releasable[] = [];
  const keep = <R extends Releasable>(object: R): R => {
    scope.push(object);
    return object;
  };

  try {
    const base64 = await pageBase64(document, 0);
    const decoded = keep(Mat.createFromBase64(base64));
    if (decoded.rows === 0 || decoded.cols === 0) throw new Error('The page could not be decoded.');
    const source = toBgr(decoded, keep);

    const plan = planPortalRender(preset, { width: source.cols, height: source.rows });
    if (plan.kind === 'needs_crop') return { ok: false, reason: 'needs_crop' };
    const picture = shape(source, plan, keep);

    const { minBytes, maxBytes } = preset;
    let bytes: Uint8Array;
    let scale = 1;

    if (maxBytes === undefined) {
      bytes = await encode(picture, OPEN_QUALITY);
    } else {
      const shrink = canShrink(plan);
      // One look at the full-size file only when shrinking is allowed, to open at a sensible rung.
      const startScale = shrink
        ? estimateInitialScale((await encode(picture, OPEN_QUALITY)).length, maxBytes)
        : 1;
      let state = startQualitySearch({ fixedScale: !shrink, startScale });
      let best: { bytes: Uint8Array; scale: number } | null = null;
      for (let probe = nextQualityProbe(state); probe; probe = nextQualityProbe(state)) {
        const sized =
          probe.scale === 1
            ? picture
            : resized(
                picture,
                Math.max(1, Math.round(picture.cols * probe.scale)),
                Math.max(1, Math.round(picture.rows * probe.scale)),
                keep,
              );
        const encoded = await encode(sized, probe.quality);
        if (encoded.length <= maxBytes && (!best || encoded.length > best.bytes.length)) {
          best = { bytes: encoded, scale: probe.scale };
        }
        state = recordQualityProbe(state, probe, encoded.length, maxBytes);
      }
      if (!best) return { ok: false, reason: 'too_large' };
      bytes = best.bytes;
      scale = best.scale;
    }

    if (preset.dpi) bytes = setJpegDpi(bytes, preset.dpi);
    if (minBytes !== undefined) bytes = padJpegToMinimum(bytes, minBytes);

    return {
      ok: true,
      bytes,
      fileName: portalFileName(preset),
      width: Math.max(1, Math.round(picture.cols * scale)),
      height: Math.max(1, Math.round(picture.rows * scale)),
      verdict: judgeSize(bytes.length, {
        ...(minBytes !== undefined ? { minBytes } : {}),
        ...(maxBytes !== undefined ? { maxBytes } : {}),
      }),
    };
  } finally {
    for (const object of scope.reverse()) {
      try {
        object.release();
      } catch {
        // Already released.
      }
    }
  }
}

/** Opens the share sheet with an exported file. */
export function sharePortalExport(
  result: Extract<PortalExportResult, { ok: true }>,
  dialogTitle: string,
): Promise<void> {
  return shareJpegBytes(result.bytes, result.fileName, dialogTitle);
}
