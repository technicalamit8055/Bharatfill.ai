/**
 * Scanner presets: what each mode allows, the print sizes they produce, the ID card's A4 layout
 * and the signature's ink box. Images are synthetic strokes, not real signatures.
 */

import { describe, expect, it } from 'vitest';

import { PAGE_FILTERS, PHOTO_FILTERS } from '../lib/scan/filters';
import type { PixelRect } from '../lib/scan/geometry';
import {
  A4_SHEET,
  centredCrop,
  ID_CARD_ASPECT,
  idCardSheetLayout,
  inkBounds,
  mmToPixels,
  padRect,
  parseScanPreset,
  PASSPORT_PHOTO,
  PASSPORT_PHOTO_ASPECT,
  PRESET_DOCUMENT_TYPE,
  presetCaptureMode,
  presetDefaultFilter,
  presetFilters,
  presetPageLimit,
  SCAN_PRESETS,
  snapAspect,
} from '../lib/scan/presets';
import { MULTI_PAGE_LIMIT } from '../lib/scan/scan-session';

describe('parseScanPreset', () => {
  it('reads every preset', () => {
    for (const preset of SCAN_PRESETS) expect(parseScanPreset(preset)).toBe(preset);
  });

  it('falls back to the ordinary scanner', () => {
    for (const value of [undefined, null, '', 'ID_CARD', 'passport', 3, ['photo']]) {
      expect(parseScanPreset(value)).toBe('document');
    }
  });
});

describe('preset rules', () => {
  it('limits the pages each preset takes', () => {
    expect(presetPageLimit('document')).toBe(MULTI_PAGE_LIMIT);
    expect(presetPageLimit('id_card')).toBe(2);
    expect(presetPageLimit('photo')).toBe(1);
    expect(presetPageLimit('signature')).toBe(1);
  });

  it('keeps a photo out of the document filters', () => {
    expect(presetFilters('photo')).toEqual(['original']);
    expect(presetDefaultFilter('photo')).toBe('original');
    for (const preset of ['document', 'id_card', 'signature'] as const) {
      expect(presetFilters(preset)).toEqual(PAGE_FILTERS);
      expect(presetDefaultFilter(preset)).toBe('magic');
    }
  });

  it('offers every default filter it starts on', () => {
    for (const preset of SCAN_PRESETS) {
      expect(presetFilters(preset)).toContain(presetDefaultFilter(preset));
    }
  });

  it('starts a photo on the shutter, everything else on auto capture', () => {
    expect(presetCaptureMode('photo')).toBe('manual');
    expect(presetCaptureMode('id_card')).toBe('auto');
    expect(presetCaptureMode('signature')).toBe('auto');
    expect(presetCaptureMode('document')).toBe('auto');
  });

  it('files photos and signatures as such, and leaves cards to the citizen', () => {
    expect(PRESET_DOCUMENT_TYPE).toEqual({
      document: null,
      id_card: null,
      photo: 'photo',
      signature: 'signature',
    });
  });
});

describe('print sizes', () => {
  it('converts millimetres at 300 dpi', () => {
    expect(mmToPixels(25.4)).toBe(300);
    expect(mmToPixels(85.6)).toBe(1011);
    expect(mmToPixels(53.98)).toBe(638);
  });

  it('makes A4 and the passport photo the standard pixel sizes', () => {
    expect(A4_SHEET).toEqual({ width: 2480, height: 3508 });
    expect(PASSPORT_PHOTO).toEqual({ width: 413, height: 531 });
    expect(PASSPORT_PHOTO_ASPECT).toBeCloseTo(35 / 45, 6);
  });
});

describe('snapAspect', () => {
  it('squares a nearly-ID-1 shape up to ID-1, either way round', () => {
    expect(snapAspect(1.5, ID_CARD_ASPECT, 0.12)).toBe(ID_CARD_ASPECT);
    expect(snapAspect(1.7, ID_CARD_ASPECT, 0.12)).toBe(ID_CARD_ASPECT);
    expect(snapAspect(1 / 1.55, ID_CARD_ASPECT, 0.12)).toBe(1 / ID_CARD_ASPECT);
  });

  it('leaves other shapes alone', () => {
    expect(snapAspect(1, ID_CARD_ASPECT, 0.12)).toBe(1);
    expect(snapAspect(0.707, ID_CARD_ASPECT, 0.12)).toBe(0.707);
    expect(snapAspect(2.2, ID_CARD_ASPECT, 0.12)).toBe(2.2);
    expect(snapAspect(0, ID_CARD_ASPECT, 0.12)).toBe(0);
  });
});

function inside(rect: PixelRect, size: { width: number; height: number }): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= size.width &&
    rect.y + rect.height <= size.height
  );
}

function overlap(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('idCardSheetLayout', () => {
  it('places front and back at true size, front above back, centred', () => {
    const { sheet, placements } = idCardSheetLayout([
      { width: 1200, height: 760 },
      { width: 1180, height: 750 },
    ]);
    expect(sheet).toEqual(A4_SHEET);
    const [front, back] = placements as [PixelRect, PixelRect];
    expect(front).toMatchObject({ width: 1011, height: 638 });
    expect(back).toMatchObject({ width: 1011, height: 638 });
    expect(front.y + front.height).toBeLessThanOrEqual(sheet.height / 2);
    expect(back.y).toBeGreaterThanOrEqual(sheet.height / 2);
    for (const side of placements) {
      expect(inside(side, sheet)).toBe(true);
      expect(side.x * 2 + side.width).toBeCloseTo(sheet.width, -1);
    }
    expect(overlap(front, back)).toBe(false);
  });

  it('keeps a card held upright upright', () => {
    const { sheet, placements } = idCardSheetLayout([
      { width: 700, height: 1100 },
      { width: 1100, height: 700 },
    ]);
    expect(placements[0]).toMatchObject({ width: 638, height: 1011 });
    expect(placements[1]).toMatchObject({ width: 1011, height: 638 });
    for (const side of placements) expect(inside(side, sheet)).toBe(true);
    expect(overlap(placements[0] as PixelRect, placements[1] as PixelRect)).toBe(false);
  });

  it('puts a single side in the top half', () => {
    const { placements } = idCardSheetLayout([{ width: 1000, height: 630 }]);
    expect(placements).toHaveLength(1);
    expect((placements[0] as PixelRect).y + 638).toBeLessThanOrEqual(A4_SHEET.height / 2);
  });

  it('refuses no sides or more than two', () => {
    expect(() => idCardSheetLayout([])).toThrow(RangeError);
    const side = { width: 10, height: 6 };
    expect(() => idCardSheetLayout([side, side, side])).toThrow(RangeError);
  });
});

describe('centredCrop', () => {
  it('cuts a wide photo down to the passport shape, centred', () => {
    const crop = centredCrop({ width: 1000, height: 900 }, PASSPORT_PHOTO_ASPECT);
    expect(crop.height).toBe(900);
    expect(crop.width).toBe(700);
    expect(crop.x).toBe(150);
    expect(crop.y).toBe(0);
  });

  it('cuts a tall photo across', () => {
    const crop = centredCrop({ width: 700, height: 1200 }, PASSPORT_PHOTO_ASPECT);
    expect(crop).toEqual({ x: 0, y: 150, width: 700, height: 900 });
  });

  it('keeps a photo already the right shape whole', () => {
    expect(centredCrop({ width: 413, height: 531 }, PASSPORT_PHOTO_ASPECT)).toEqual({
      x: 0,
      y: 0,
      width: 413,
      height: 531,
    });
  });
});

/** White paper with a scrawl of ink and, optionally, a few specks of dust. */
function signaturePage(specks: boolean) {
  const width = 600;
  const height = 400;
  const pixels = new Uint8Array(width * height).fill(255);
  const dot = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) pixels[(y + dy) * width + x + dx] = 30;
    }
  };
  // A wavy stroke from (150, 200) to (450, 200), 60px high.
  for (let x = 150; x <= 450; x += 1) dot(x, Math.round(200 + 30 * Math.sin(x / 15)));
  if (specks) {
    pixels[30 * width + 40] = 20;
    pixels[360 * width + 560] = 20;
    pixels[50 * width + 520] = 20;
  }
  return { width, height, pixels };
}

describe('inkBounds', () => {
  it('boxes the signature', () => {
    const box = inkBounds(signaturePage(false)) as PixelRect;
    expect(box.x).toBeGreaterThanOrEqual(145);
    expect(box.x).toBeLessThanOrEqual(155);
    expect(box.x + box.width).toBeGreaterThanOrEqual(445);
    expect(box.x + box.width).toBeLessThanOrEqual(455);
    expect(box.y).toBeGreaterThanOrEqual(165);
    expect(box.y + box.height).toBeLessThanOrEqual(235);
  });

  it('is not stretched by specks of dust far from it', () => {
    const clean = inkBounds(signaturePage(false)) as PixelRect;
    const dusty = inkBounds(signaturePage(true)) as PixelRect;
    expect(Math.abs(dusty.x - clean.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(dusty.y - clean.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(dusty.width - clean.width)).toBeLessThanOrEqual(6);
    expect(Math.abs(dusty.height - clean.height)).toBeLessThanOrEqual(6);
  });

  it('ignores the dark edge of the page', () => {
    const page = signaturePage(false);
    for (let y = 0; y < page.height; y += 1) {
      for (let x = 0; x < 6; x += 1) page.pixels[y * page.width + x] = 0;
    }
    const box = inkBounds(page) as PixelRect;
    expect(box.x).toBeGreaterThanOrEqual(145);
  });

  it('finds nothing on blank paper', () => {
    expect(
      inkBounds({ width: 300, height: 200, pixels: new Uint8Array(300 * 200).fill(250) }),
    ).toBe(null);
  });
});

describe('padRect', () => {
  it('adds room on every side', () => {
    expect(
      padRect({ x: 100, y: 100, width: 200, height: 50 }, { width: 600, height: 400 }, 0.1, 8),
    ).toEqual({
      x: 80,
      y: 80,
      width: 240,
      height: 90,
    });
  });

  it('adds at least the minimum, and stays inside the image', () => {
    expect(
      padRect({ x: 2, y: 3, width: 20, height: 10 }, { width: 30, height: 20 }, 0.1, 8),
    ).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 20,
    });
  });
});

describe('studio passport photo looks', () => {
  it('offers white, light blue and the photo as taken, starting on white', () => {
    expect(presetFilters('photo', true)).toEqual(PHOTO_FILTERS);
    expect(presetDefaultFilter('photo', true)).toBe('studioWhite');
    expect(presetFilters('photo', true)).toContain(presetDefaultFilter('photo', true));
  });

  it('never gives a document the studio looks', () => {
    for (const preset of ['document', 'id_card', 'signature'] as const) {
      expect(presetFilters(preset, true)).toEqual(PAGE_FILTERS);
      expect(presetDefaultFilter(preset, true)).toBe('magic');
    }
  });
});
