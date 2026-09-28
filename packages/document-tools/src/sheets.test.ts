import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_DPI,
  PRINT_SHEETS,
  cutMarksForCell,
  findSheet,
  planPhotoSheet,
  suggestedCounts,
} from './sheets';
import { mmToPx } from './units';

const a4 = findSheet('a4');
const photo4x6 = findSheet('4x6');

/** 3.5 × 4.5 cm — the passport photo every one of these sheets is made of. */
const PASSPORT = { photoWidthMm: 35, photoHeightMm: 45 };

describe('sheet catalogue', () => {
  it('has the sheets a service centre keeps by the printer', () => {
    expect(PRINT_SHEETS.map((sheet) => sheet.code)).toContain('4x6');
    expect(PRINT_SHEETS.map((sheet) => sheet.code)).toContain('a4');
  });

  it('states A4 and 4 × 6 at their real millimetre sizes', () => {
    expect(a4).toMatchObject({ widthMm: 210, heightMm: 297 });
    expect(photo4x6).toMatchObject({ widthMm: 101.6, heightMm: 152.4 });
  });

  it('returns null for a sheet it does not stock', () => {
    expect(findSheet('legal')).toBeNull();
  });
});

describe('planPhotoSheet', () => {
  it('fits eight passport photos on 4 × 6 inch paper, which is the common order', () => {
    const layout = planPhotoSheet({ sheet: photo4x6!, ...PASSPORT, count: 8 });
    expect(layout.placed).toBe(8);
    expect(layout.dropped).toBe(0);
    expect(layout.cells).toHaveLength(8);
  });

  it('gets those eight by turning the grid, and says so', () => {
    // Upright, 35 mm columns fit two across and three down: six. On their side, eight.
    const layout = planPhotoSheet({ sheet: photo4x6!, ...PASSPORT, count: 8 });
    expect(layout.turned).toBe(true);
    // The cell is the photo on its side, so the compositor has to rotate rather than stretch.
    expect(layout.cells[0]).toMatchObject({ width: mmToPx(45, 300), height: mmToPx(35, 300) });
  });

  it('keeps the grid upright when turning it gains nothing', () => {
    expect(planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null }).turned).toBe(false);
  });

  it('fits far more on A4 than on a photo sheet', () => {
    const onA4 = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null });
    const on4x6 = planPhotoSheet({ sheet: photo4x6!, ...PASSPORT, count: null });
    expect(onA4.capacity).toBeGreaterThan(on4x6.capacity);
    // 210 × 297 mm holds 5 across and 6 down at 3.5 × 4.5 cm with a 2 mm gap.
    expect(onA4.capacity).toBe(30);
  });

  it('fills the sheet when no count is given', () => {
    const layout = planPhotoSheet({ sheet: photo4x6!, ...PASSPORT, count: null });
    expect(layout.placed).toBe(layout.capacity);
  });

  it('reports what it could not fit instead of silently dropping it', () => {
    const layout = planPhotoSheet({ sheet: photo4x6!, ...PASSPORT, count: 200 });
    expect(layout.placed).toBe(layout.capacity);
    expect(layout.dropped).toBe(200 - layout.capacity);
  });

  it('never overlaps two photos', () => {
    const layout = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null });
    for (let a = 0; a < layout.cells.length; a += 1) {
      for (let b = a + 1; b < layout.cells.length; b += 1) {
        const first = layout.cells[a]!;
        const second = layout.cells[b]!;
        const separated =
          first.x + first.width <= second.x ||
          second.x + second.width <= first.x ||
          first.y + first.height <= second.y ||
          second.y + second.height <= first.y;
        expect(separated).toBe(true);
      }
    }
  });

  it('keeps every photo inside the printable sheet', () => {
    const layout = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null, marginMm: 5 });
    for (const cell of layout.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(layout.sheetWidthPx);
      expect(cell.y + cell.height).toBeLessThanOrEqual(layout.sheetHeightPx);
    }
  });

  it('centres the block, so the sheet can be cut with a guillotine', () => {
    const layout = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: 10 });
    const left = Math.min(...layout.cells.map((cell) => cell.x));
    const right = layout.sheetWidthPx - Math.max(...layout.cells.map((c) => c.x + c.width));
    const top = Math.min(...layout.cells.map((cell) => cell.y));
    const bottom = layout.sheetHeightPx - Math.max(...layout.cells.map((c) => c.y + c.height));
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(2);
  });

  it('centres a short final row rather than pushing it against the left edge', () => {
    // 5 across on A4, so 7 photos leaves a row of 2.
    const layout = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: 7 });
    expect(layout.columns).toBe(5);
    const lastRow = layout.cells.slice(5);
    expect(lastRow).toHaveLength(2);
    const left = Math.min(...lastRow.map((cell) => cell.x));
    const right = layout.sheetWidthPx - Math.max(...lastRow.map((c) => c.x + c.width));
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });

  it('renders each photo at its real physical size in print pixels', () => {
    const layout = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: 4, dpi: 300 });
    const cell = layout.cells[0]!;
    expect(cell.width).toBe(mmToPx(35, 300));
    expect(cell.height).toBe(mmToPx(45, 300));
    expect(layout.sheetWidthPx).toBe(mmToPx(210, 300));
  });

  it('turns the whole grid when that fits strictly more, and never one photo alone', () => {
    // A wide short photo on a portrait sheet: turning the grid is the win.
    const layout = planPhotoSheet({
      sheet: a4!,
      photoWidthMm: 90,
      photoHeightMm: 40,
      count: null,
    });
    const widths = new Set(layout.cells.map((cell) => cell.width));
    expect(widths.size).toBe(1); // one orientation for every photo on the sheet
    expect(layout.capacity).toBeGreaterThan(0);
  });

  it('honours a wider gap by fitting fewer photos', () => {
    const tight = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null, gapMm: 1 });
    const loose = planPhotoSheet({ sheet: a4!, ...PASSPORT, count: null, gapMm: 12 });
    expect(loose.capacity).toBeLessThan(tight.capacity);
  });

  it('reports zero capacity for a photo larger than the sheet, rather than a broken layout', () => {
    const layout = planPhotoSheet({
      sheet: photo4x6!,
      photoWidthMm: 300,
      photoHeightMm: 400,
      count: 4,
    });
    expect(layout.capacity).toBe(0);
    expect(layout.cells).toHaveLength(0);
    expect(layout.dropped).toBe(4);
  });

  it('defaults to print resolution', () => {
    expect(planPhotoSheet({ sheet: a4!, ...PASSPORT, count: 1 }).dpi).toBe(DEFAULT_PRINT_DPI);
  });
});

describe('suggestedCounts', () => {
  it('offers only counts that actually fit', () => {
    const counts = suggestedCounts(8);
    expect(counts.every((count) => count <= 8)).toBe(true);
    expect(counts).toContain(8);
    expect(counts).not.toContain(12);
  });

  it('includes filling the sheet exactly, even at an odd capacity', () => {
    expect(suggestedCounts(30)).toContain(30);
    expect(suggestedCounts(7)).toContain(7);
  });

  it('offers nothing when nothing fits', () => {
    expect(suggestedCounts(0)).toEqual([]);
  });
});

describe('cutMarksForCell', () => {
  const cell = { x: 100, y: 200, width: 400, height: 500 };

  it('marks all four corners', () => {
    expect(cutMarksForCell(cell, 10)).toHaveLength(8);
  });

  it('puts every tick on the cell boundary, never across the photo', () => {
    for (const [x1, y1, x2, y2] of cutMarksForCell(cell, 10)) {
      const onVertical = x1 === x2 && (x1 === cell.x || x1 === cell.x + cell.width);
      const onHorizontal = y1 === y2 && (y1 === cell.y || y1 === cell.y + cell.height);
      expect(onVertical || onHorizontal).toBe(true);
    }
  });

  it('keeps a visible tick even when asked for a sub-pixel length', () => {
    for (const [x1, y1, x2, y2] of cutMarksForCell(cell, 0.2)) {
      expect(Math.abs(x2 - x1) + Math.abs(y2 - y1)).toBeGreaterThanOrEqual(2);
    }
  });
});
