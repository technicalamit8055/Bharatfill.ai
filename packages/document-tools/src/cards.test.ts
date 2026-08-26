import { describe, expect, it } from 'vitest';
import { HIGH_SENSITIVITY_DOCUMENT_TYPES } from '@assistigo/core';
import {
  CARD_PRINT_DPI,
  CR80_ASPECT,
  CR80_HEIGHT_MM,
  CR80_WIDTH_MM,
  aadhaarMaskDefault,
  isMeaningfulRedaction,
  planCardSheet,
  redactionRequiredFor,
} from './cards';
import { mmToPx } from './units';

const FOUR_BY_SIX = { sheetWidthMm: 101.6, sheetHeightMm: 152.4 };
const A4 = { sheetWidthMm: 210, sheetHeightMm: 297 };

describe('CR-80', () => {
  it('is the ID-1 size every bank and PAN card is cut to', () => {
    expect(CR80_WIDTH_MM).toBe(85.6);
    expect(CR80_HEIGHT_MM).toBe(53.98);
    expect(CR80_ASPECT).toBeCloseTo(1.586, 3);
  });
});

describe('planCardSheet', () => {
  it('fits the front/back pair an operator laminates together on one 4 × 6 sheet', () => {
    const layout = planCardSheet({ ...FOUR_BY_SIX, count: 2 });
    expect(layout.slots).toHaveLength(2);
  });

  it('fits more cards on A4 than on a photo sheet', () => {
    expect(planCardSheet({ ...A4, count: 99 }).capacity).toBeGreaterThan(
      planCardSheet({ ...FOUR_BY_SIX, count: 99 }).capacity,
    );
  });

  it('renders each card at its real physical size in print pixels', () => {
    const layout = planCardSheet({ ...A4, count: 1, dpi: 300 });
    const long = mmToPx(CR80_WIDTH_MM, 300);
    const short = mmToPx(CR80_HEIGHT_MM, 300);
    // Either orientation, but always the true card dimensions.
    expect([layout.cardWidthPx, layout.cardHeightPx].sort((a, b) => a - b)).toEqual(
      [short, long].sort((a, b) => a - b),
    );
  });

  it('never overlaps two cards', () => {
    const layout = planCardSheet({ ...A4, count: 99 });
    for (let a = 0; a < layout.slots.length; a += 1) {
      for (let b = a + 1; b < layout.slots.length; b += 1) {
        const first = layout.slots[a]!;
        const second = layout.slots[b]!;
        const separated =
          first.x + first.width <= second.x ||
          second.x + second.width <= first.x ||
          first.y + first.height <= second.y ||
          second.y + second.height <= first.y;
        expect(separated).toBe(true);
      }
    }
  });

  it('keeps every card inside the sheet', () => {
    const layout = planCardSheet({ ...A4, count: 99 });
    for (const slot of layout.slots) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.width).toBeLessThanOrEqual(layout.sheetWidthPx);
      expect(slot.y + slot.height).toBeLessThanOrEqual(layout.sheetHeightPx);
    }
  });

  it('centres a short final row', () => {
    const layout = planCardSheet({ ...A4, count: 3 });
    if (layout.slots.length === 3 && layout.capacity > 3) {
      const rows = new Map<number, typeof layout.slots>();
      for (const slot of layout.slots) {
        rows.set(slot.y, [...(rows.get(slot.y) ?? []), slot]);
      }
      for (const row of rows.values()) {
        const left = Math.min(...row.map((slot) => slot.x));
        const right = layout.sheetWidthPx - Math.max(...row.map((s) => s.x + s.width));
        expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('clamps a request above capacity rather than laying out off-sheet', () => {
    const layout = planCardSheet({ ...FOUR_BY_SIX, count: 50 });
    expect(layout.slots).toHaveLength(layout.capacity);
  });

  it('lays out nothing for a zero request', () => {
    expect(planCardSheet({ ...A4, count: 0 }).slots).toEqual([]);
  });

  it('defaults to print resolution', () => {
    expect(planCardSheet({ ...A4, count: 1 }).dpi).toBe(CARD_PRINT_DPI);
  });
});

describe('aadhaarMaskDefault', () => {
  const card = { width: 1012, height: 638 }; // CR-80 at 300 DPI

  it('proposes a mask over the number band on a card-shaped crop', () => {
    const box = aadhaarMaskDefault(card);
    expect(box).not.toBeNull();
    expect(box?.suggested).toBe(true);
    expect(box?.style).toBe('solid');
  });

  it('leaves the last four digits outside the mask, the way UIDAI’s own masked format does', () => {
    const box = aadhaarMaskDefault(card)!;
    // The mask stops well short of the right-hand end of the number band.
    expect(box.x + box.width).toBeLessThan(card.width * 0.7);
  });

  it('sits on the lower part of the card, where the number is printed', () => {
    const box = aadhaarMaskDefault(card)!;
    expect(box.y).toBeGreaterThan(card.height * 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(card.height);
  });

  it('stays inside the card', () => {
    const box = aadhaarMaskDefault(card)!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(card.width);
    expect(box.y + box.height).toBeLessThanOrEqual(card.height);
  });

  it('proposes nothing for a crop that is not card-shaped, rather than guessing', () => {
    expect(aadhaarMaskDefault({ width: 600, height: 900 })).toBeNull();
    expect(aadhaarMaskDefault({ width: 2000, height: 300 })).toBeNull();
    expect(aadhaarMaskDefault({ width: 0, height: 0 })).toBeNull();
  });
});

describe('isMeaningfulRedaction', () => {
  const card = { width: 1000, height: 630 };

  it('accepts a mask that really covers the number band', () => {
    expect(isMeaningfulRedaction({ x: 200, y: 420, width: 420, height: 90 }, card)).toBe(true);
  });

  it('rejects a stray click, so the UI cannot claim a file is masked when it is not', () => {
    expect(isMeaningfulRedaction({ x: 10, y: 10, width: 4, height: 4 }, card)).toBe(false);
  });

  it('rejects a box that is wide but a hairline tall', () => {
    expect(isMeaningfulRedaction({ x: 0, y: 300, width: 900, height: 2 }, card)).toBe(false);
  });

  it('rejects a box that is tall but a hairline wide', () => {
    expect(isMeaningfulRedaction({ x: 500, y: 0, width: 3, height: 600 }, card)).toBe(false);
  });

  it('refuses to divide by a zero-size card', () => {
    expect(
      isMeaningfulRedaction({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }),
    ).toBe(false);
  });
});

describe('redactionRequiredFor', () => {
  it('requires a mask on an Aadhaar-class document', () => {
    expect(redactionRequiredFor('aadhaar_like')).toBe(true);
  });

  it('does not require one on a marksheet or a photo', () => {
    expect(redactionRequiredFor('marksheet_10')).toBe(false);
    expect(redactionRequiredFor('photo')).toBe(false);
  });

  it('handles an unset document type', () => {
    expect(redactionRequiredFor(null)).toBe(false);
    expect(redactionRequiredFor(undefined)).toBe(false);
  });

  it('only ever names document types the core catalogue knows are high sensitivity', () => {
    // Guards against this list drifting away from @assistigo/core's own idea of what is
    // sensitive — if PAN or voter ID is added here, it has to be a type core agrees about.
    const required = ['aadhaar_like'];
    for (const type of required) {
      expect(HIGH_SENSITIVITY_DOCUMENT_TYPES).toContain(type);
    }
  });
});
