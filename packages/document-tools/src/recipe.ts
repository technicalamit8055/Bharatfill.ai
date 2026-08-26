/**
 * Derivative naming and recipe metadata.
 * Master spec §13.3 — "Derivative files store metadata: source file, tool used, preset,
 * dimensions, size, format, created by, created at."
 *
 * `created_by` and `created_at` are columns on `document_derivatives`, and the source document is
 * a foreign key, so what this module builds is the rest: the tool, the resolved preset, and the
 * ordered list of operations with the numbers they used. That list is the answer to the question
 * an operator asks three weeks later — "why is this photo 47 KB and the other one 22 KB?"
 *
 * One rule holds throughout: a recipe records *numbers and flags, never values*. The name/date
 * stamp is the only step whose input is a customer value, and it records `{ stamped: true }`
 * (docs/DEVELOPMENT_RULES.md §5 — no PII outside the profile).
 */

import { sanitizeFilename } from '@assistigo/core';
import { findPreset } from './presets';
import type { DerivativeRecipe, OutputMimeType, RecipeStep, ToolId } from './types';

const EXTENSIONS: Record<OutputMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function extensionFor(mimeType: OutputMimeType): string {
  return EXTENSIONS[mimeType];
}

/**
 * Filename for a prepared file.
 *
 * Portal-first, because of how the file is used: the operator downloads it, then hunts for it in
 * the browser's file picker while a portal upload dialog is open. `ssc-photo-2026-08-22.jpg` is
 * findable there; `output(3).jpg` is not.
 *
 * The customer's name is deliberately absent. An operator's own filenames routinely carry it,
 * which is exactly why the upload route logs shape and size rather than the filename — and a
 * name we generate ourselves has no excuse to repeat the mistake.
 */
export function derivativeFilename(input: {
  tool: ToolId;
  presetCode: string | null;
  mimeType: OutputMimeType;
  /** ISO date. Passed in rather than read from the clock so the result is testable. */
  date: string;
  /** Distinguishes several exports from one session, e.g. sheet 1 and sheet 2. */
  sequence?: number;
}): string {
  const preset = input.presetCode ? findPreset(input.presetCode) : null;
  const stem = preset ? preset.code.replace(/\./g, '-') : TOOL_FILENAME_STEM[input.tool];
  const sequence = input.sequence && input.sequence > 1 ? `-${input.sequence}` : '';
  return sanitizeFilename(
    `${stem}-${input.date.slice(0, 10)}${sequence}.${extensionFor(input.mimeType)}`,
  );
}

const TOOL_FILENAME_STEM: Record<ToolId, string> = {
  photo_signature: 'prepared-photo',
  passport_grid: 'photo-sheet',
  pvc_card: 'card-print',
  pdf_studio: 'prepared-pdf',
};

/** Accumulates recipe steps in the order they ran. */
export class RecipeBuilder {
  private readonly steps: RecipeStep[] = [];

  constructor(
    private readonly tool: ToolId,
    private readonly presetCode: string | null,
  ) {}

  /**
   * Records one step. A step with no measurable effect is dropped rather than recorded, so a
   * recipe reads as what happened to the file and not as which sliders exist.
   */
  add(operation: RecipeStep['operation'], detail?: RecipeStep['detail']): this {
    this.steps.push(detail === undefined ? { operation } : { operation, detail });
    return this;
  }

  addIf(
    condition: boolean,
    operation: RecipeStep['operation'],
    detail?: RecipeStep['detail'],
  ): this {
    return condition ? this.add(operation, detail) : this;
  }

  build(output: {
    mimeType: OutputMimeType;
    widthPx?: number | null;
    heightPx?: number | null;
    dpi?: number | null;
    pageCount?: number | null;
    sourceCount: number;
  }): DerivativeRecipe {
    return {
      tool: this.tool,
      presetCode: this.presetCode,
      steps: this.steps.slice(0, 40),
      output: {
        mimeType: output.mimeType,
        widthPx: output.widthPx ?? null,
        heightPx: output.heightPx ?? null,
        dpi: output.dpi ?? null,
        pageCount: output.pageCount ?? null,
      },
      redacted: this.steps.some((step) => step.operation === 'redact'),
      sourceCount: Math.max(1, output.sourceCount),
    };
  }
}

/**
 * The `document_derivatives.metadata` payload.
 *
 * The resolved preset rule is snapshotted here rather than referenced by code alone, because the
 * catalogue in `presets.ts` moves when a portal changes its notice. Three months later, "why was
 * this 45 KB?" has to be answerable from the row, not from whatever the current build believes.
 */
export function buildDerivativeMetadata(recipe: DerivativeRecipe): {
  recipe: DerivativeRecipe;
  preset: {
    code: string;
    portal: string;
    label: string;
    minBytes: number | null;
    maxBytes: number | null;
    source: string;
  } | null;
} {
  const preset = recipe.presetCode ? findPreset(recipe.presetCode) : null;
  return {
    recipe,
    preset: preset
      ? {
          code: preset.code,
          portal: preset.portal,
          label: preset.label,
          minBytes: preset.minBytes ?? null,
          maxBytes: preset.maxBytes ?? null,
          source: preset.source,
        }
      : null,
  };
}

/** Translation-key stem for a step, so the recipe renders in the operator's language. */
export function stepLabelKey(step: RecipeStep): string {
  return `documentTools.operations.${step.operation}`;
}
