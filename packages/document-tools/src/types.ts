/**
 * Document-tool vocabulary.
 * Master spec §13 (Document Tools), §13.2 (tool inventory), §13.3 (acceptance criteria).
 *
 * Pure types and Zod schemas only. Nothing here touches a canvas, a `File`, or the network, so
 * this module is safe to import from a route handler, the extension, or a Node test.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Requirement presets
// ---------------------------------------------------------------------------

/**
 * What kind of slot on a portal a preset describes.
 *
 * Mirrors the `category` check constraint on `document_requirement_presets`
 * (supabase/migrations/0004_documents.sql), so a code preset and a database preset can never
 * describe different things.
 */
export const PRESET_CATEGORIES = ['photo', 'signature', 'document', 'pdf'] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export const COLOR_MODES = ['colour', 'greyscale', 'bw'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const OUTPUT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type OutputMimeType = (typeof OUTPUT_MIME_TYPES)[number];

/** Physical units an Indian portal notice uses. Millimetres are the internal unit. */
export const LENGTH_UNITS = ['mm', 'cm', 'in', 'px'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/**
 * One portal's rule for one upload slot.
 *
 * Every numeric field is optional because portal notices are inconsistent: some state pixels,
 * some state centimetres, some only state a KB range. A preset says exactly as much as the
 * notice does and no more — inventing a dimension the portal never published is how an
 * application gets rejected for the wrong reason.
 */
export type RequirementPreset = {
  /** Stable slug. Used as the `metadata.preset.code` on a derivative. */
  code: string;
  /** Portal or exam family this belongs to, for grouping in the picker. */
  portal: string;
  portalHi?: string;
  label: string;
  labelHi?: string;
  category: PresetCategory;
  outputMime: OutputMimeType;
  minBytes?: number;
  maxBytes?: number;
  /** Exact pixel dimensions, when the notice states pixels. */
  widthPx?: number;
  heightPx?: number;
  /** Physical size, when the notice states cm/mm. Converted at `dpi`. */
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  /** Acceptable pixel range, when the notice states a range rather than an exact size. */
  minWidthPx?: number;
  minHeightPx?: number;
  maxWidthPx?: number;
  maxHeightPx?: number;
  colorMode?: ColorMode;
  /** Portal asks for the candidate's name and the capture date printed on the photo. */
  requiresNameDateStamp?: boolean;
  /** Operator-facing caveats, shown verbatim next to the preset. */
  notes?: string;
  notesHi?: string;
  /**
   * Which notice these numbers were read from, e.g. "SSC OTR instructions, 2024–25 cycle".
   *
   * Shown in the picker verbatim. Portal rules change between recruitment cycles, and an
   * operator needs to know how stale the number they are trusting is.
   */
  source: string;
  /**
   * How firm the numbers are.
   *
   * `published` — stated on the portal's own notice or upload page.
   * `commonly_reported` — consistent across secondary write-ups but not confirmed against a
   *   current notice.
   *
   * A wrong KB limit gets an application rejected, so the difference is shown in the UI rather
   * than smoothed over, and every number stays operator-editable.
   */
  confidence: 'published' | 'commonly_reported';
};

// ---------------------------------------------------------------------------
// Derivative recipe — what produced a prepared file (§13.3)
// ---------------------------------------------------------------------------

export const DERIVATIVE_OPERATIONS = [
  'crop',
  'resize',
  'rotate',
  'straighten',
  'compress',
  'pad_to_minimum',
  'convert',
  'grayscale',
  'binarise',
  'trim_whitespace',
  'enhance',
  'flatten_background',
  'name_date_stamp',
  'redact',
  'sheet_layout',
  'card_layout',
  'merge',
  'split',
  'reorder',
  'delete_pages',
  'image_to_pdf',
  'rasterise',
  'decrypt',
] as const;
export type DerivativeOperation = (typeof DERIVATIVE_OPERATIONS)[number];

/** One step in the recipe, with the numbers it actually used. */
export const recipeStepSchema = z.object({
  operation: z.enum(DERIVATIVE_OPERATIONS),
  /**
   * Step parameters. Numbers, booleans and short enum-ish strings only — never a customer
   * value. The name/date stamp is the one step whose input *is* a customer value, and it
   * records `{ stamped: true }` rather than the text (docs/DEVELOPMENT_RULES.md §5).
   */
  detail: z.record(z.union([z.number(), z.boolean(), z.string().max(64)])).optional(),
});
export type RecipeStep = z.output<typeof recipeStepSchema>;

export const derivativeRecipeSchema = z.object({
  tool: z.enum(['photo_signature', 'passport_grid', 'pvc_card', 'pdf_studio']),
  presetCode: z.string().max(80).nullable(),
  steps: z.array(recipeStepSchema).max(40),
  output: z.object({
    mimeType: z.enum(OUTPUT_MIME_TYPES),
    widthPx: z.number().int().positive().nullable(),
    heightPx: z.number().int().positive().nullable(),
    dpi: z.number().int().positive().nullable(),
    pageCount: z.number().int().positive().nullable(),
  }),
  /** True when a redaction step ran. Surfaced on the derivative list as a privacy signal. */
  redacted: z.boolean(),
  /** How many source files went in. Filenames are deliberately not recorded. */
  sourceCount: z.number().int().positive(),
});
export type DerivativeRecipe = z.output<typeof derivativeRecipeSchema>;

export type ToolId = DerivativeRecipe['tool'];

/** Maps a tool to the `document_derivatives.tool_type` check-constrained value. */
export const TOOL_TO_DB_TOOL_TYPE: Record<ToolId, 'photo' | 'signature' | 'pdf'> = {
  photo_signature: 'photo',
  passport_grid: 'photo',
  pvc_card: 'photo',
  pdf_studio: 'pdf',
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Print sheet an operator feeds into the shop printer. */
export type SheetSpec = {
  code: string;
  label: string;
  labelHi?: string;
  /** For a compact picker tile, where "photo paper" goes without saying. Falls back to `label`. */
  shortLabel?: string;
  shortLabelHi?: string;
  widthMm: number;
  heightMm: number;
};

/**
 * Derivatives are portal-ready files, so they are small by construction: a 50 KB photo, a
 * 200 KB certificate PDF, a 300 DPI A4 print sheet. The cap is well under the bucket's 15 MB so
 * a runaway canvas export is rejected before it is stored, and it keeps the verify step (which
 * downloads the object to sniff its first bytes) cheap.
 */
export const MAX_DERIVATIVE_BYTES = 8 * 1024 * 1024;
