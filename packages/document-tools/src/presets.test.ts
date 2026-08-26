import { describe, expect, it } from 'vitest';
import {
  REQUIREMENT_PRESETS,
  findPreset,
  groupPresetsByPortal,
  isPresetCode,
  presetsForCategory,
  searchPresets,
} from './presets';
import { PRESET_CATEGORIES, OUTPUT_MIME_TYPES, COLOR_MODES } from './types';
import { presetTargetSize } from './units';

describe('catalogue integrity', () => {
  it('has a unique code for every preset', () => {
    const codes = REQUIREMENT_PRESETS.map((preset) => preset.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('names the portal it read its numbers from, so an operator can check them', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      expect(preset.source.length).toBeGreaterThan(3);
      expect(['published', 'commonly_reported']).toContain(preset.confidence);
    }
  });

  it('only uses categories, output types and colour modes the database also accepts', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      expect(PRESET_CATEGORIES).toContain(preset.category);
      expect(OUTPUT_MIME_TYPES).toContain(preset.outputMime);
      if (preset.colorMode) expect(COLOR_MODES).toContain(preset.colorMode);
    }
  });

  it('never states a KB window whose minimum is above its maximum', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      if (preset.minBytes !== undefined && preset.maxBytes !== undefined) {
        expect(preset.minBytes).toBeLessThan(preset.maxBytes);
      }
    }
  });

  it('never states a pixel range whose minimum is above its maximum', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      if (preset.minWidthPx !== undefined && preset.maxWidthPx !== undefined) {
        expect(preset.minWidthPx).toBeLessThanOrEqual(preset.maxWidthPx);
      }
      if (preset.minHeightPx !== undefined && preset.maxHeightPx !== undefined) {
        expect(preset.minHeightPx).toBeLessThanOrEqual(preset.maxHeightPx);
      }
    }
  });

  it('gives every PDF preset a PDF output type and no pixel dimensions', () => {
    for (const preset of REQUIREMENT_PRESETS.filter((p) => p.category === 'pdf')) {
      expect(preset.outputMime).toBe('application/pdf');
      expect(preset.widthPx).toBeUndefined();
      expect(preset.heightPx).toBeUndefined();
    }
  });

  it('never asks for a PDF from an image category', () => {
    for (const preset of REQUIREMENT_PRESETS.filter((p) => p.category !== 'pdf')) {
      expect(preset.outputMime).not.toBe('application/pdf');
    }
  });

  it('gives every dimensioned preset a resolvable target size', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      const stated =
        preset.widthPx !== undefined ||
        preset.widthMm !== undefined ||
        preset.minWidthPx !== undefined;
      if (stated) {
        const size = presetTargetSize(preset);
        expect(size).not.toBeNull();
        expect(size?.width).toBeGreaterThan(0);
        expect(size?.height).toBeGreaterThan(0);
      }
    }
  });

  it('states a DPI wherever it states a physical size, so pixels are derivable', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      if (preset.widthMm !== undefined) expect(preset.dpi).toBeGreaterThan(0);
    }
  });

  it('covers the portals a service centre files against every day', () => {
    const portals = new Set(REQUIREMENT_PRESETS.map((preset) => preset.portal));
    for (const portal of ['SSC', 'NTA', 'UPSC', 'IBPS', 'Railway RRB']) {
      expect(portals).toContain(portal);
    }
  });

  it('has a photo and a signature preset for each recruitment portal, since both are asked for together', () => {
    for (const portal of ['SSC', 'NTA', 'UPSC', 'IBPS', 'Railway RRB']) {
      const forPortal = REQUIREMENT_PRESETS.filter((preset) => preset.portal === portal);
      expect(forPortal.some((preset) => preset.category === 'photo')).toBe(true);
      expect(forPortal.some((preset) => preset.category === 'signature')).toBe(true);
    }
  });

  it('has a Hindi label wherever it has an English one, because the UI is bilingual', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      expect(preset.labelHi).toBeTruthy();
      expect(preset.portalHi).toBeTruthy();
    }
  });

  it('translates its notes too, where it has notes at all', () => {
    for (const preset of REQUIREMENT_PRESETS) {
      if (preset.notes) expect(preset.notesHi).toBeTruthy();
    }
  });

  it('flags a name-and-date stamp only on photo presets, which is the only slot that takes one', () => {
    for (const preset of REQUIREMENT_PRESETS.filter((p) => p.requiresNameDateStamp)) {
      expect(preset.category).toBe('photo');
    }
  });
});

describe('lookup', () => {
  it('finds a preset by code', () => {
    expect(findPreset('ssc.photo')?.portal).toBe('SSC');
  });

  it('returns null for an unknown code rather than throwing', () => {
    expect(findPreset('nope.nothing')).toBeNull();
    expect(isPresetCode('nope.nothing')).toBe(false);
    expect(isPresetCode(42)).toBe(false);
    expect(isPresetCode('ssc.photo')).toBe(true);
  });
});

describe('presetsForCategory', () => {
  it('filters to one category', () => {
    const signatures = presetsForCategory('signature');
    expect(signatures.length).toBeGreaterThan(4);
    expect(signatures.every((preset) => preset.category === 'signature')).toBe(true);
  });

  it('accepts several categories, which is how the photo editor offers both of its jobs', () => {
    const both = presetsForCategory(['photo', 'signature']);
    expect(both.some((preset) => preset.category === 'photo')).toBe(true);
    expect(both.some((preset) => preset.category === 'signature')).toBe(true);
    expect(both.some((preset) => preset.category === 'pdf')).toBe(false);
  });
});

describe('groupPresetsByPortal', () => {
  it('keeps catalogue order, so the commonest portal stays at the top', () => {
    const groups = groupPresetsByPortal(REQUIREMENT_PRESETS);
    expect(groups[0]?.portal).toBe('SSC');
  });

  it('lists each portal exactly once', () => {
    const groups = groupPresetsByPortal(REQUIREMENT_PRESETS);
    const portals = groups.map((group) => group.portal);
    expect(new Set(portals).size).toBe(portals.length);
  });

  it('loses no preset', () => {
    const groups = groupPresetsByPortal(REQUIREMENT_PRESETS);
    const total = groups.reduce((sum, group) => sum + group.presets.length, 0);
    expect(total).toBe(REQUIREMENT_PRESETS.length);
  });

  it('carries the Hindi portal name through for the group heading', () => {
    const group = groupPresetsByPortal(REQUIREMENT_PRESETS).find((g) => g.portal === 'SSC');
    expect(group?.portalHi).toBe('एसएससी');
  });
});

describe('searchPresets', () => {
  it('matches the exam an operator types, not just the portal', () => {
    expect(searchPresets('cgl').map((preset) => preset.code)).toContain('ssc.photo');
    expect(searchPresets('neet').length).toBeGreaterThan(0);
  });

  it('matches on the Hindi label', () => {
    expect(searchPresets('हस्ताक्षर').length).toBeGreaterThan(0);
  });

  it('ignores case and surrounding spaces', () => {
    expect(searchPresets('  IbPs  ').length).toBe(searchPresets('ibps').length);
  });

  it('returns everything for an empty query', () => {
    expect(searchPresets('')).toHaveLength(REQUIREMENT_PRESETS.length);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchPresets('zzzzz')).toEqual([]);
  });

  it('searches inside a narrowed list', () => {
    const results = searchPresets('photo', presetsForCategory('signature'));
    expect(results.every((preset) => preset.category === 'signature')).toBe(true);
  });
});
