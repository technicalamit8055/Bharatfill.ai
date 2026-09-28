/**
 * An operator's starting values for the document tools (Settings → My preferences).
 *
 * A counter that prints forty passport sheets a day on 6 × 4 paper should not have to pick
 * 6 × 4 forty times. These are only starting values: every one can still be changed inside the
 * tool for the job in hand.
 *
 * No customer data belongs here — only paper, sizes, counts and switches. The web app keeps
 * the object on the operator's own computer; this module is the shape and the forgiving parse,
 * so a stale or hand-edited value falls back to the default for that one field instead of
 * throwing away the rest.
 */

import { z } from 'zod';
import { DEFAULT_PRINT_DPI, PRINT_SHEETS } from './sheets';

/** The photo sizes offered as tiles in the passport-photo sheet tool. */
export const GRID_PHOTO_SIZE_CODES = ['passport', 'stamp', 'square'] as const;
export type GridPhotoSizeCode = (typeof GRID_PHOTO_SIZE_CODES)[number];

/** The counts customers actually ask for. `null` elsewhere means "fill the sheet". */
export const GRID_COUNT_OPTIONS = [4, 6, 8, 12, 16] as const;

export const GRID_DPI_MIN = 150;
export const GRID_DPI_MAX = 600;
export const GRID_DPI_STEP = 50;

export const CARD_COPIES_MIN = 1;
export const CARD_COPIES_MAX = 4;

export type ToolPreferences = {
  grid: {
    sheetCode: string;
    photoSize: GridPhotoSizeCode;
    /** `null` fills the sheet. */
    count: number | null;
    cutMarks: boolean;
    dpi: number;
  };
  card: { copies: number };
  pdf: { allowRasterise: boolean };
};

export const DEFAULT_TOOL_PREFERENCES: ToolPreferences = {
  grid: {
    sheetCode: '4x6',
    photoSize: 'passport',
    count: 8,
    cutMarks: true,
    dpi: DEFAULT_PRINT_DPI,
  },
  card: { copies: 2 },
  pdf: { allowRasterise: true },
};

const defaults = DEFAULT_TOOL_PREFERENCES;

const gridSchema = z
  .object({
    sheetCode: z
      .string()
      .refine((code) => PRINT_SHEETS.some((sheet) => sheet.code === code))
      .catch(defaults.grid.sheetCode),
    photoSize: z.enum(GRID_PHOTO_SIZE_CODES).catch(defaults.grid.photoSize),
    count: z
      .number()
      .refine((value) => (GRID_COUNT_OPTIONS as readonly number[]).includes(value))
      .nullable()
      .catch(defaults.grid.count),
    cutMarks: z.boolean().catch(defaults.grid.cutMarks),
    dpi: z
      .number()
      .int()
      .min(GRID_DPI_MIN)
      .max(GRID_DPI_MAX)
      .multipleOf(GRID_DPI_STEP)
      .catch(defaults.grid.dpi),
  })
  .catch(defaults.grid);

const cardSchema = z
  .object({
    copies: z
      .number()
      .int()
      .min(CARD_COPIES_MIN)
      .max(CARD_COPIES_MAX)
      .catch(defaults.card.copies),
  })
  .catch(defaults.card);

const pdfSchema = z
  .object({ allowRasterise: z.boolean().catch(defaults.pdf.allowRasterise) })
  .catch(defaults.pdf);

export const toolPreferencesSchema = z
  .object({ grid: gridSchema, card: cardSchema, pdf: pdfSchema })
  .catch(defaults);

/**
 * Never throws. Anything unrecognisable becomes the default for that field alone, and unknown
 * keys are dropped, so whatever this returns is safe to feed straight into a tool.
 */
export function parseToolPreferences(raw: unknown): ToolPreferences {
  return toolPreferencesSchema.parse(raw);
}
