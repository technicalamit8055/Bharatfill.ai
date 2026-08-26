/**
 * Print-sheet layout for passport and stamp photo grids.
 *
 * The job: a customer wants eight passport photos. The operator has a 4 × 6 inch photo sheet or
 * an A4 page, and does this by hand in a desktop image editor today — five to ten minutes per
 * customer, per the research in the implementation plan. This module is the arithmetic that
 * makes it one click: given a sheet, a photo size and a count, where does each photo go.
 *
 * Pure millimetre geometry, converted to pixels at the print DPI. Nothing here touches a canvas.
 */

import type { Rect, SheetSpec } from './types';
import { mmToPx } from './units';

/** The sheets a service-centre printer actually holds. */
export const PRINT_SHEETS: readonly SheetSpec[] = [
  {
    code: '4x6',
    label: '4 × 6 in photo paper',
    labelHi: '4 × 6 इंच फोटो पेपर',
    widthMm: 101.6,
    heightMm: 152.4,
  },
  {
    code: '5x7',
    label: '5 × 7 in photo paper',
    labelHi: '5 × 7 इंच फोटो पेपर',
    widthMm: 127,
    heightMm: 177.8,
  },
  { code: 'a4', label: 'A4 paper', labelHi: 'A4 कागज़', widthMm: 210, heightMm: 297 },
  { code: 'a5', label: 'A5 paper', labelHi: 'A5 कागज़', widthMm: 148, heightMm: 210 },
  {
    code: '4x6_landscape',
    label: '6 × 4 in photo paper (landscape)',
    labelHi: '6 × 4 इंच फोटो पेपर (आड़ा)',
    widthMm: 152.4,
    heightMm: 101.6,
  },
];

export function findSheet(code: string): SheetSpec | null {
  return PRINT_SHEETS.find((sheet) => sheet.code === code) ?? null;
}

export type SheetLayoutInput = {
  sheet: SheetSpec;
  /** One photo's finished size on paper. */
  photoWidthMm: number;
  photoHeightMm: number;
  /** How many the customer asked for. `null` fills the sheet. */
  count: number | null;
  /** Gap between photos, so the shop's guillotine has something to cut along. */
  gapMm?: number;
  /** Unprintable border most inkjets impose. */
  marginMm?: number;
  dpi?: number;
};

export type SheetLayout = {
  sheetWidthPx: number;
  sheetHeightPx: number;
  columns: number;
  rows: number;
  /** Positions in sheet pixels, reading order. */
  cells: Rect[];
  /** How many fit. Less than the requested count when the sheet is full. */
  placed: number;
  /** How many the caller asked for but the sheet could not hold. */
  dropped: number;
  capacity: number;
  dpi: number;
};

export const DEFAULT_PRINT_DPI = 300;
export const DEFAULT_GAP_MM = 2;
export const DEFAULT_MARGIN_MM = 3;

/**
 * Lays photos out in a centred grid.
 *
 * Two decisions worth naming:
 *
 *   - The grid is *centred on the sheet*, not packed into the top-left corner. A centred block
 *     leaves an even border, which is what makes the sheet cuttable with a guillotine rather
 *     than scissors.
 *   - It never rotates individual photos to squeeze in one more. A sheet of photos where the
 *     last one is sideways is a sheet the operator has to explain to the customer.
 *
 * The one rotation it does consider is the *whole grid*, tried in both sheet orientations, and
 * only if that fits strictly more photos.
 */
export function planPhotoSheet(input: SheetLayoutInput): SheetLayout {
  const {
    sheet,
    photoWidthMm,
    photoHeightMm,
    count,
    gapMm = DEFAULT_GAP_MM,
    marginMm = DEFAULT_MARGIN_MM,
    dpi = DEFAULT_PRINT_DPI,
  } = input;

  const usableWidth = Math.max(0, sheet.widthMm - marginMm * 2);
  const usableHeight = Math.max(0, sheet.heightMm - marginMm * 2);

  const fitCount = (available: number, size: number): number => {
    if (size <= 0) return 0;
    // n photos need n·size + (n−1)·gap.
    return Math.max(0, Math.floor((available + gapMm) / (size + gapMm)));
  };

  const upright = {
    columns: fitCount(usableWidth, photoWidthMm),
    rows: fitCount(usableHeight, photoHeightMm),
  };
  const turned = {
    columns: fitCount(usableWidth, photoHeightMm),
    rows: fitCount(usableHeight, photoWidthMm),
  };

  const orientation =
    turned.columns * turned.rows > upright.columns * upright.rows ? 'turned' : 'upright';
  const grid = orientation === 'turned' ? turned : upright;
  const cellWidthMm = orientation === 'turned' ? photoHeightMm : photoWidthMm;
  const cellHeightMm = orientation === 'turned' ? photoWidthMm : photoHeightMm;

  const capacity = grid.columns * grid.rows;
  const wanted = count === null ? capacity : Math.max(0, count);
  const placed = Math.min(capacity, wanted);

  // Only lay out the rows actually needed, so six photos on an A4 do not sit in a 4 × 5 block
  // with fourteen blank cells: they fill two rows and the block is centred as two rows.
  const usedRows = grid.columns > 0 ? Math.ceil(placed / grid.columns) : 0;

  // The horizontal origin is computed per row below (`rowOriginXMm`), because a short final row
  // is centred on its own rather than left-aligned under a full row above it.
  const blockHeightMm = usedRows > 0 ? usedRows * cellHeightMm + (usedRows - 1) * gapMm : 0;
  const originYMm = (sheet.heightMm - blockHeightMm) / 2;

  const cells: Rect[] = [];
  for (let index = 0; index < placed; index += 1) {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    // The final row is centred on its own, so a trailing row of two under a row of four is not
    // pushed against the left edge.
    const rowCount = row === usedRows - 1 ? placed - row * grid.columns : grid.columns;
    const rowWidthMm = rowCount * cellWidthMm + (rowCount - 1) * gapMm;
    const rowOriginXMm = (sheet.widthMm - rowWidthMm) / 2;

    cells.push({
      x: mmToPx(rowOriginXMm + column * (cellWidthMm + gapMm), dpi),
      y: mmToPx(originYMm + row * (cellHeightMm + gapMm), dpi),
      width: mmToPx(cellWidthMm, dpi),
      height: mmToPx(cellHeightMm, dpi),
    });
  }

  return {
    sheetWidthPx: mmToPx(sheet.widthMm, dpi),
    sheetHeightPx: mmToPx(sheet.heightMm, dpi),
    columns: grid.columns,
    rows: grid.rows,
    cells,
    placed,
    dropped: Math.max(0, wanted - placed),
    capacity,
    dpi,
  };
}

/**
 * The counts to offer as one-click buttons for a given sheet and photo size.
 *
 * Built from the sheet's real capacity rather than a hard-coded 6/8/12/16 list, because 16 stamp
 * photos fit on a 4 × 6 sheet and 16 passport photos do not, and offering a button that silently
 * drops four photos is worse than not offering it.
 */
export function suggestedCounts(layoutCapacity: number): number[] {
  const candidates = [4, 6, 8, 9, 12, 16, 20, 24, 32, 40];
  const fitting = candidates.filter((candidate) => candidate <= layoutCapacity);
  if (layoutCapacity > 0 && !fitting.includes(layoutCapacity)) fitting.push(layoutCapacity);
  return fitting;
}

/**
 * Corner cut marks for one cell, as line segments in sheet pixels.
 *
 * Corner ticks rather than full grid lines: a full line printed between two photos ends up
 * visible on the cut edge of both, whereas a tick sits in the gap and is consumed by the cut.
 */
export function cutMarksForCell(cell: Rect, lengthPx: number): [number, number, number, number][] {
  const { x, y, width, height } = cell;
  const length = Math.max(2, Math.round(lengthPx));
  const right = x + width;
  const bottom = y + height;
  return [
    [x, y, x + length, y],
    [x, y, x, y + length],
    [right - length, y, right, y],
    [right, y, right, y + length],
    [x, bottom - length, x, bottom],
    [x, bottom, x + length, bottom],
    [right - length, bottom, right, bottom],
    [right, bottom - length, right, bottom],
  ];
}
