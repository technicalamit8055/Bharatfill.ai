/**
 * Scanner presets: the dedicated application-asset modes of `docs/CITIZEN_MOBILE_APP_SPEC.md`
 * §3 Feature 1 item 5, which Home's ID Card, Photo and Signature shortcuts open.
 *
 * - **ID card** — front, then back, of an ISO/IEC 7810 ID-1 card (Aadhaar PVC, PAN, voter ID,
 *   driving licence), each flattened to the card's exact shape and laid out at true size on one
 *   A4 page at 300 dpi, as a photocopy would be.
 * - **Photo** — a passport photograph cut to the Indian 35 × 45 mm at 300 dpi, with a gentle
 *   brightness correction only: the document filters would whiten a face and crush its shadows.
 *   Where the phone can find the person (`lib/vision/on-device-vision.ts`), it starts on the
 *   studio look: framed around the face, on plain white or light blue (`studio-photo.ts`).
 *   Otherwise the background is left as photographed.
 * - **Signature** — a signature on plain paper, cleaned like a document and cropped tight to the
 *   ink.
 * - **Document** — the ordinary scanner.
 *
 * Pure (sizes, layouts, the ink box), so it is unit tested; the pixels are drawn in
 * `document-vision.ts`.
 */

import type { DocumentType } from '@assistigo/core';

import { PAGE_FILTERS, type PageFilter, PHOTO_FILTERS } from './filters';
import type { PixelRect, Size } from './geometry';
import type { GrayImage } from './paper-light';
import { type CaptureMode, MULTI_PAGE_LIMIT } from './scan-session';

/** Each has copy at `scanner.presets.<preset>`. */
export const SCAN_PRESETS = ['document', 'id_card', 'photo', 'signature'] as const;
export type ScanPreset = (typeof SCAN_PRESETS)[number];

/** A preset from a route param; the ordinary scanner for anything else. */
export function parseScanPreset(value: unknown): ScanPreset {
  return typeof value === 'string' && (SCAN_PRESETS as readonly string[]).includes(value)
    ? (value as ScanPreset)
    : 'document';
}

/** Most pages a scan in this preset can hold: an ID card has a front and a back. */
export function presetPageLimit(preset: ScanPreset): number {
  switch (preset) {
    case 'document':
      return MULTI_PAGE_LIMIT;
    case 'id_card':
      return 2;
    default:
      return 1;
  }
}

/**
 * The filters offered. A photo never gets the document looks, which would wreck a face: it gets
 * the studio backgrounds when `studio` (the phone can cut the person out), else its own look.
 */
export function presetFilters(preset: ScanPreset, studio = false): readonly PageFilter[] {
  if (preset !== 'photo') return PAGE_FILTERS;
  return studio ? PHOTO_FILTERS : ['original'];
}

/** The first filter: plain white for a photo when the phone can cut the person out. */
export function presetDefaultFilter(preset: ScanPreset, studio = false): PageFilter {
  if (preset !== 'photo') return 'magic';
  return studio ? 'studioWhite' : 'original';
}

/** A portrait has no page outline to auto-capture on, so a photo starts on the shutter. */
export function presetCaptureMode(preset: ScanPreset): CaptureMode {
  return preset === 'photo' ? 'manual' : 'auto';
}

/** What Save Document files the scan as; null leaves it to the citizen (which card is it?). */
export const PRESET_DOCUMENT_TYPE: Readonly<Record<ScanPreset, DocumentType | null>> = {
  document: null,
  id_card: null,
  photo: 'photo',
  signature: 'signature',
};

// ---- Print sizes -----------------------------------------------------------------------------

/** What portals and printers expect of a scan. */
export const PRINT_DPI = 300;

const MM_PER_INCH = 25.4;

export function mmToPixels(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** ISO/IEC 7810 ID-1, in millimetres. */
export const ID_CARD_MM: Size = { width: 85.6, height: 53.98 };
export const ID_CARD_ASPECT = ID_CARD_MM.width / ID_CARD_MM.height;
/** How far a measured card shape may be from ID-1 and still be squared up to it. */
export const ID_CARD_ASPECT_TOLERANCE = 0.12;

/** An A4 page at `PRINT_DPI`, portrait. */
export const A4_SHEET: Size = { width: mmToPixels(210), height: mmToPixels(297) };

/** The Indian passport photograph, 35 × 45 mm, at `PRINT_DPI`. */
export const PASSPORT_PHOTO_MM: Size = { width: 35, height: 45 };
export const PASSPORT_PHOTO: Size = {
  width: mmToPixels(PASSPORT_PHOTO_MM.width),
  height: mmToPixels(PASSPORT_PHOTO_MM.height),
};
export const PASSPORT_PHOTO_ASPECT = PASSPORT_PHOTO_MM.width / PASSPORT_PHOTO_MM.height;

/**
 * `target` (or its inverse, for something held the other way round) when `aspect` is within
 * `tolerance` of it, relatively; otherwise `aspect` unchanged. Squares a slightly-off measured
 * card up to its standard shape, without forcing a shape onto something that is not one.
 */
export function snapAspect(aspect: number, target: number, tolerance: number): number {
  if (!(aspect > 0) || !(target > 0)) return aspect;
  for (const shape of [target, 1 / target]) {
    if (Math.abs(aspect / shape - 1) <= tolerance) return shape;
  }
  return aspect;
}

export type IdCardSheet = {
  readonly sheet: Size;
  /** Where each side goes on the sheet, in the order given: front, then back. */
  readonly placements: readonly PixelRect[];
};

/**
 * Lays out an ID card's sides on an A4 sheet at true size: each at ID-1 size at `PRINT_DPI` in
 * its own orientation (landscape when it is at least as wide as it is tall), centred across the
 * sheet, the front in the middle of the top half and the back in the middle of the bottom half.
 */
export function idCardSheetLayout(sides: readonly Size[]): IdCardSheet {
  if (sides.length < 1 || sides.length > 2) {
    throw new RangeError('An ID card has one or two sides.');
  }
  const long = mmToPixels(ID_CARD_MM.width);
  const short = mmToPixels(ID_CARD_MM.height);
  const half = Math.floor(A4_SHEET.height / 2);
  const placements = sides.map((side, index): PixelRect => {
    const landscape = side.width >= side.height;
    const width = landscape ? long : short;
    const height = landscape ? short : long;
    return {
      x: Math.round((A4_SHEET.width - width) / 2),
      y: index * half + Math.round((half - height) / 2),
      width,
      height,
    };
  });
  return { sheet: A4_SHEET, placements };
}

/** The largest rectangle of `aspect` (width ÷ height) centred in `size`. */
export function centredCrop(size: Size, aspect: number): PixelRect {
  let width = size.width;
  let height = Math.round(width / aspect);
  if (height > size.height) {
    height = size.height;
    width = Math.round(height * aspect);
  }
  width = Math.max(1, Math.min(size.width, width));
  height = Math.max(1, Math.min(size.height, height));
  return {
    x: Math.floor((size.width - width) / 2),
    y: Math.floor((size.height - height) / 2),
    width,
    height,
  };
}

// ---- Signature trimming ----------------------------------------------------------------------

export type InkBoundsOptions = {
  /** Darker than this is ink, on a cleaned page where paper is white. */
  readonly inkBelow: number;
  /** Share of each side left out: the page's edge and its shadow. */
  readonly borderShare: number;
  /** Share of the ink dropped at each end of each axis, so stray specks do not stretch the box. */
  readonly trimShare: number;
  /** Less ink than this share of the page is no signature. */
  readonly minInkShare: number;
};

export const DEFAULT_INK_BOUNDS: InkBoundsOptions = {
  inkBelow: 160,
  borderShare: 0.02,
  trimShare: 0.004,
  minInkShare: 0.0005,
};

/**
 * The box around the ink on a cleaned signature page, or null when there is too little ink to be
 * a signature. Counts ink per column and per row and cuts each end where the outermost
 * `trimShare` of the ink lies, so a speck of dust far from the signature does not stretch the
 * box, while the signature's own flourishes, a share of its ink, stay in.
 */
export function inkBounds(
  image: GrayImage,
  options: InkBoundsOptions = DEFAULT_INK_BOUNDS,
): PixelRect | null {
  const { width, height, pixels } = image;
  const bx = Math.floor(width * options.borderShare);
  const by = Math.floor(height * options.borderShare);
  const columns = new Uint32Array(width);
  const rows = new Uint32Array(height);
  let total = 0;
  for (let y = by; y < height - by; y += 1) {
    const row = y * width;
    for (let x = bx; x < width - bx; x += 1) {
      if ((pixels[row + x] as number) < options.inkBelow) {
        columns[x] = (columns[x] as number) + 1;
        rows[y] = (rows[y] as number) + 1;
        total += 1;
      }
    }
  }
  const area = Math.max(1, (width - 2 * bx) * (height - 2 * by));
  if (total === 0 || total < options.minInkShare * area) return null;

  const cut = options.trimShare * total;
  const ends = (profile: Uint32Array): [number, number] => {
    let first = 0;
    let seen = 0;
    while (first < profile.length - 1 && seen + (profile[first] as number) <= cut) {
      seen += profile[first] as number;
      first += 1;
    }
    let last = profile.length - 1;
    seen = 0;
    while (last > first && seen + (profile[last] as number) <= cut) {
      seen += profile[last] as number;
      last -= 1;
    }
    return [first, last];
  };
  const [left, right] = ends(columns);
  const [top, bottom] = ends(rows);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * `rect` grown by `share` of its larger side, at least `minPixels`, on every side, and clipped to
 * `size`: breathing room around a trimmed signature.
 */
export function padRect(rect: PixelRect, size: Size, share: number, minPixels: number): PixelRect {
  const pad = Math.max(minPixels, Math.round(share * Math.max(rect.width, rect.height)));
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const right = Math.min(size.width, rect.x + rect.width + pad);
  const bottom = Math.min(size.height, rect.y + rect.height + pad);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}
