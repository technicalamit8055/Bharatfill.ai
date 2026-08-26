/**
 * Unit conversion for portal dimension rules.
 * Master spec §13.2 — "Resize by pixels", "Resize by cm/inch at DPI".
 *
 * Millimetres are the internal physical unit and pixels are always derived from a DPI, because
 * "3.5 × 4.5 cm" only becomes a pixel count once you pick a resolution. Portals that state
 * centimetres almost never state the DPI, so the tool picks a sane default and shows it.
 */

import type { LengthUnit, RequirementPreset, Size } from './types';

export const MM_PER_INCH = 25.4;

/**
 * Default resolution when a preset states physical size but no DPI.
 *
 * 300 is the print-quality convention and what every photo lab in a service centre uses, so a
 * photo prepared for an upload can also be printed without being re-made.
 */
export const DEFAULT_DPI = 300;

/** Resolution for on-screen-only work, where 300 DPI would make a needlessly large file. */
export const SCREEN_DPI = 96;

export function toMm(value: number, unit: LengthUnit, dpi: number = DEFAULT_DPI): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'cm':
      return value * 10;
    case 'in':
      return value * MM_PER_INCH;
    case 'px':
      return (value / dpi) * MM_PER_INCH;
  }
}

export function fromMm(mm: number, unit: LengthUnit, dpi: number = DEFAULT_DPI): number {
  switch (unit) {
    case 'mm':
      return mm;
    case 'cm':
      return mm / 10;
    case 'in':
      return mm / MM_PER_INCH;
    case 'px':
      return (mm / MM_PER_INCH) * dpi;
  }
}

/** Physical millimetres to a whole pixel count. Always rounds up: a portal's stated size is a
 *  minimum in practice, and a photo one pixel short of 3.5 cm is a photo that gets rejected. */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return Math.max(1, Math.ceil((mm / MM_PER_INCH) * dpi));
}

export function pxToMm(px: number, dpi: number = DEFAULT_DPI): number {
  return (px / dpi) * MM_PER_INCH;
}

/**
 * The pixel size a preset asks for, or `null` when it states no dimension at all.
 *
 * Exact pixels win over physical size: a portal that publishes "200 × 230 px" is validating the
 * pixel count itself, and re-deriving it from millimetres would land a pixel or two off.
 */
export function presetTargetSize(preset: RequirementPreset, dpiOverride?: number): Size | null {
  if (preset.widthPx && preset.heightPx) {
    return { width: preset.widthPx, height: preset.heightPx };
  }
  if (preset.widthMm && preset.heightMm) {
    const dpi = dpiOverride ?? preset.dpi ?? DEFAULT_DPI;
    return { width: mmToPx(preset.widthMm, dpi), height: mmToPx(preset.heightMm, dpi) };
  }
  // A range-only preset (min/max px) has no single answer; the midpoint of the range is a
  // defensible default and the operator can override it.
  if (preset.minWidthPx && preset.minHeightPx) {
    const width = preset.maxWidthPx
      ? Math.round((preset.minWidthPx + preset.maxWidthPx) / 2)
      : preset.minWidthPx;
    const height = preset.maxHeightPx
      ? Math.round((preset.minHeightPx + preset.maxHeightPx) / 2)
      : preset.minHeightPx;
    return { width, height };
  }
  return null;
}

/** The aspect ratio the crop box should lock to, or `null` when the preset does not fix one. */
export function presetAspectRatio(preset: RequirementPreset): number | null {
  const size = presetTargetSize(preset);
  if (!size) return null;
  return size.width / size.height;
}

/**
 * Fits `source` inside `bounds` without distortion (letterbox), returning the drawn size.
 * Never upscales past `bounds`; used for preview rendering.
 */
export function fitWithin(source: Size, bounds: Size): Size {
  const scale = Math.min(bounds.width / source.width, bounds.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * The largest centred rectangle of a given aspect ratio that fits inside `source`.
 * This is the starting crop box: it keeps the whole subject in frame and is what an operator
 * expects to see before they drag anything.
 */
export function centredCropForAspect(
  source: Size,
  aspect: number,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const sourceAspect = source.width / source.height;
  const width = sourceAspect > aspect ? source.height * aspect : source.width;
  const height = sourceAspect > aspect ? source.height : source.width / aspect;
  return {
    x: (source.width - width) / 2,
    y: (source.height - height) / 2,
    width,
    height,
  };
}

/** Keeps a crop rectangle inside the image after a drag or a resize. */
export function clampRectToBounds(
  rect: { x: number; y: number; width: number; height: number },
  bounds: Size,
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    width,
    height,
    x: Math.min(Math.max(0, rect.x), bounds.width - width),
    y: Math.min(Math.max(0, rect.y), bounds.height - height),
  };
}

/** "3.5 × 4.5 cm" / "200 × 230 px" — how a portal notice reads, for the preset card. */
export function formatDimension(preset: RequirementPreset): string | null {
  if (preset.widthPx && preset.heightPx) return `${preset.widthPx} × ${preset.heightPx} px`;
  if (preset.widthMm && preset.heightMm) {
    const cm = (mm: number) => Number((mm / 10).toFixed(1));
    return `${cm(preset.widthMm)} × ${cm(preset.heightMm)} cm`;
  }
  if (preset.minWidthPx && preset.minHeightPx) {
    const max =
      preset.maxWidthPx && preset.maxHeightPx
        ? `–${preset.maxWidthPx} × ${preset.maxHeightPx}`
        : '+';
    return `${preset.minWidthPx} × ${preset.minHeightPx}${max} px`;
  }
  return null;
}
