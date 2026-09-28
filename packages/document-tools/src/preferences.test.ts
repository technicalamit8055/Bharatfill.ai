import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOL_PREFERENCES,
  parseToolPreferences,
  type ToolPreferences,
} from './preferences';

const custom: ToolPreferences = {
  grid: { sheetCode: 'a4', photoSize: 'stamp', count: null, cutMarks: false, dpi: 600 },
  card: { copies: 4 },
  pdf: { allowRasterise: false },
};

describe('parseToolPreferences', () => {
  it('keeps a valid saved object as it is', () => {
    expect(parseToolPreferences(custom)).toEqual(custom);
  });

  it.each([undefined, null, 'garbage', 42, []])('falls back to defaults for %j', (raw) => {
    expect(parseToolPreferences(raw)).toEqual(DEFAULT_TOOL_PREFERENCES);
  });

  it('replaces only the fields that are wrong', () => {
    const parsed = parseToolPreferences({
      ...custom,
      grid: { ...custom.grid, sheetCode: 'no_such_paper', dpi: 275 },
    });
    expect(parsed.grid).toEqual({
      ...custom.grid,
      sheetCode: DEFAULT_TOOL_PREFERENCES.grid.sheetCode,
      dpi: DEFAULT_TOOL_PREFERENCES.grid.dpi,
    });
    expect(parsed.card).toEqual(custom.card);
    expect(parsed.pdf).toEqual(custom.pdf);
  });

  it('fills a group that is missing entirely', () => {
    const parsed = parseToolPreferences({ grid: custom.grid });
    expect(parsed.grid).toEqual(custom.grid);
    expect(parsed.card).toEqual(DEFAULT_TOOL_PREFERENCES.card);
    expect(parsed.pdf).toEqual(DEFAULT_TOOL_PREFERENCES.pdf);
  });

  it('rejects counts and copies outside what the tools offer', () => {
    const parsed = parseToolPreferences({
      ...custom,
      grid: { ...custom.grid, count: 7 },
      card: { copies: 9 },
    });
    expect(parsed.grid.count).toBe(DEFAULT_TOOL_PREFERENCES.grid.count);
    expect(parsed.card.copies).toBe(DEFAULT_TOOL_PREFERENCES.card.copies);
  });

  it('drops keys it does not know, so nothing extra is carried into a tool', () => {
    const parsed = parseToolPreferences({ ...custom, customerName: 'Test Person' });
    expect(parsed).not.toHaveProperty('customerName');
  });
});
