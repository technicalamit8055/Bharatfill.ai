/**
 * Export for a form: which portal presets a vault document can be exported to, and how its
 * picture is shaped to one. CITIZEN_MOBILE_APP_SPEC §6 Phase 3 "Portal Presets"; design §9.7.
 *
 * The presets are the extension's own catalogue (`@assistigo/document-tools`), so the app and
 * the operator's extension agree on every size. Pure, so it is tested without a device; the
 * encoding is `portal-export.ts`.
 *
 * Only single-page photos and signatures, as JPEG: the app holds images, and those are the two
 * uploads every recruitment form asks for. PDF presets (certificates under 200 KB) need a PDF
 * compressor the app does not have yet.
 *
 * Shaping follows the extension's auto-fit rules: a signature is centred on white inside the
 * portal's exact box; a photo is never framed by the app beyond trimming a sliver — one whose
 * shape is far from the portal's needs a person to frame the face, so it is refused with a
 * reason instead.
 */

import type { DocumentType } from '@assistigo/core';
import {
  aspectDeviation,
  centredCropForAspect,
  containInFrame,
  presetsForCategory,
  presetTargetSize,
  type RequirementPreset,
  type Size,
} from '@assistigo/document-tools';

/** Thumb impressions and handwritten declarations sit under "photo" in the catalogue but are not face photos. */
const NOT_A_FACE_PHOTO = /thumb|declaration/;
/** Thumb impressions and declarations are filed with signatures in some catalogues; keep to signatures. */
const SIGNATURE_CODE = /signature/;

/**
 * Presets a document can be exported to: photo presets for a photo, signature presets for a
 * signature, nothing for anything else or for several pages.
 */
export function portalPresetsFor(
  documentType: DocumentType | null,
  pageCount: number,
): RequirementPreset[] {
  if (pageCount !== 1) return [];
  const jpeg = (preset: RequirementPreset) => preset.outputMime === 'image/jpeg';
  if (documentType === 'photo') {
    return presetsForCategory('photo').filter(
      (preset) => jpeg(preset) && !NOT_A_FACE_PHOTO.test(preset.code),
    );
  }
  if (documentType === 'signature') {
    return presetsForCategory('signature').filter(
      (preset) => jpeg(preset) && SIGNATURE_CODE.test(preset.code),
    );
  }
  return [];
}

/** How far a photo's shape may differ from the portal's before the app refuses to trim it. */
export const PHOTO_TRIM_TOLERANCE = 0.12;
/** White kept around a signature inside the portal's box, as a fraction of each side. */
export const SIGNATURE_MARGIN = 0.06;

export type PixelBox = { x: number; y: number; width: number; height: number };

export type PortalRenderPlan =
  /** Cut `crop` out of the source and resize it to exactly `size`. */
  | { readonly kind: 'cover'; readonly crop: PixelBox; readonly size: Size }
  /** Resize the whole source to `content` and centre it on white in a `frame` box. */
  | { readonly kind: 'contain'; readonly frame: Size; readonly content: PixelBox }
  /** The preset states no picture size: keep the source's shape; only the file size is fitted. */
  | { readonly kind: 'keep' }
  /** A photo too far from the portal's shape to trim without cutting into the face. */
  | { readonly kind: 'needs_crop' };

function roundBox(box: PixelBox, bounds: Size): PixelBox {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(bounds.width - x, Math.round(box.width))),
    height: Math.max(1, Math.min(bounds.height - y, Math.round(box.height))),
  };
}

export function planPortalRender(preset: RequirementPreset, source: Size): PortalRenderPlan {
  const target = presetTargetSize(preset);
  if (!target) return { kind: 'keep' };

  if (preset.category === 'photo') {
    if (aspectDeviation(source, target) > PHOTO_TRIM_TOLERANCE) return { kind: 'needs_crop' };
    const crop = centredCropForAspect(source, target.width / target.height);
    return { kind: 'cover', crop: roundBox(crop, source), size: target };
  }

  return {
    kind: 'contain',
    frame: target,
    content: containInFrame(source, target, SIGNATURE_MARGIN),
  };
}

/** The pixel size the exported file will have. */
export function plannedSize(plan: PortalRenderPlan, source: Size): Size | null {
  switch (plan.kind) {
    case 'cover':
      return plan.size;
    case 'contain':
      return plan.frame;
    case 'keep':
      return source;
    case 'needs_crop':
      return null;
  }
}

/**
 * Whether the encoder may also shrink the picture to reach the maximum. Never when the portal
 * states a picture size — SSC rejects a signature that is not 6.0 × 2.0 cm at 300 DPI — only
 * quality moves then.
 */
export function canShrink(plan: PortalRenderPlan): boolean {
  return plan.kind === 'keep';
}

/** "SSC · Photograph (CGL / CHSL / MTS / GD)", in Hindi when the catalogue has it. */
export function presetName(preset: RequirementPreset, locale: 'en' | 'hi'): string {
  const portal = locale === 'hi' ? (preset.portalHi ?? preset.portal) : preset.portal;
  const label = locale === 'hi' ? (preset.labelHi ?? preset.label) : preset.label;
  return `${portal} · ${label}`;
}

/** "ssc-photo.jpg": names the preset, never the citizen. */
export function portalFileName(preset: RequirementPreset): string {
  return `${preset.code
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}.jpg`;
}
