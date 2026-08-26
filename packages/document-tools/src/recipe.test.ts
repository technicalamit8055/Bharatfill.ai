import { describe, expect, it } from 'vitest';
import {
  RecipeBuilder,
  buildDerivativeMetadata,
  derivativeFilename,
  extensionFor,
  stepLabelKey,
} from './recipe';
import { derivativeRecipeSchema } from './types';

describe('extensionFor', () => {
  it('uses jpg, the extension a portal upload box expects', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });
});

describe('derivativeFilename', () => {
  it('names the file after the portal slot, so it is findable in an upload dialog', () => {
    expect(
      derivativeFilename({
        tool: 'photo_signature',
        presetCode: 'ssc.photo',
        mimeType: 'image/jpeg',
        date: '2026-08-22',
      }),
    ).toBe('ssc-photo-2026-08-22.jpg');
  });

  it('falls back to the tool when there is no preset', () => {
    expect(
      derivativeFilename({
        tool: 'passport_grid',
        presetCode: null,
        mimeType: 'image/jpeg',
        date: '2026-08-22',
      }),
    ).toBe('photo-sheet-2026-08-22.jpg');
  });

  it('has a distinct stem for every tool', () => {
    const stems = (['photo_signature', 'passport_grid', 'pvc_card', 'pdf_studio'] as const).map(
      (tool) =>
        derivativeFilename({ tool, presetCode: null, mimeType: 'image/jpeg', date: '2026-01-01' }),
    );
    expect(new Set(stems).size).toBe(4);
  });

  it('distinguishes repeat exports from one session', () => {
    const first = derivativeFilename({
      tool: 'pdf_studio',
      presetCode: null,
      mimeType: 'application/pdf',
      date: '2026-08-22',
      sequence: 1,
    });
    const second = derivativeFilename({
      tool: 'pdf_studio',
      presetCode: null,
      mimeType: 'application/pdf',
      date: '2026-08-22',
      sequence: 2,
    });
    expect(first).not.toBe(second);
    expect(second).toBe('prepared-pdf-2026-08-22-2.pdf');
  });

  it('trims a full timestamp down to the date', () => {
    expect(
      derivativeFilename({
        tool: 'pvc_card',
        presetCode: null,
        mimeType: 'image/png',
        date: '2026-08-22T17:45:11.402Z',
      }),
    ).toBe('card-print-2026-08-22.png');
  });

  it('produces a name that survives sanitizeFilename unchanged', () => {
    const name = derivativeFilename({
      tool: 'photo_signature',
      presetCode: 'ibps.handwritten_declaration',
      mimeType: 'image/jpeg',
      date: '2026-08-22',
    });
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('carries no customer name, because the filename is the classic PII leak', () => {
    const name = derivativeFilename({
      tool: 'photo_signature',
      presetCode: 'ssc.photo',
      mimeType: 'image/jpeg',
      date: '2026-08-22',
    });
    // Nothing but the slot, the date and the extension.
    expect(name.split('-')).toHaveLength(5);
  });
});

describe('RecipeBuilder', () => {
  it('records steps in the order they ran', () => {
    const recipe = new RecipeBuilder('photo_signature', 'ssc.photo')
      .add('crop', { width: 800, height: 1029 })
      .add('resize', { width: 276, height: 355 })
      .add('compress', { quality: 0.72, bytes: 47_104 })
      .build({ mimeType: 'image/jpeg', widthPx: 276, heightPx: 355, dpi: 200, sourceCount: 1 });

    expect(recipe.steps.map((step) => step.operation)).toEqual(['crop', 'resize', 'compress']);
    expect(recipe.output).toEqual({
      mimeType: 'image/jpeg',
      widthPx: 276,
      heightPx: 355,
      dpi: 200,
      pageCount: null,
    });
  });

  it('validates against its own schema, so it can cross an API boundary', () => {
    const recipe = new RecipeBuilder('pdf_studio', 'edistrict.certificate_200kb')
      .add('merge', { files: 3 })
      .add('rotate', { degrees: 90, page: 2 })
      .add('rasterise', { dpi: 120 })
      .build({ mimeType: 'application/pdf', pageCount: 3, sourceCount: 3 });

    expect(derivativeRecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it('skips a step whose condition did not hold', () => {
    const recipe = new RecipeBuilder('photo_signature', null)
      .addIf(false, 'binarise')
      .addIf(true, 'trim_whitespace')
      .build({ mimeType: 'image/jpeg', sourceCount: 1 });

    expect(recipe.steps.map((step) => step.operation)).toEqual(['trim_whitespace']);
  });

  it('reports a redaction, which is what the derivative list shows as a privacy signal', () => {
    const plain = new RecipeBuilder('pvc_card', null).add('crop').build({
      mimeType: 'image/png',
      sourceCount: 1,
    });
    const masked = new RecipeBuilder('pvc_card', null)
      .add('crop')
      .add('redact', { boxes: 1, style: 'solid' })
      .build({ mimeType: 'image/png', sourceCount: 1 });

    expect(plain.redacted).toBe(false);
    expect(masked.redacted).toBe(true);
  });

  it('records that a name/date stamp ran, never the text of it', () => {
    const recipe = new RecipeBuilder('photo_signature', 'ssc.photo')
      .add('name_date_stamp', { stamped: true, position: 'bottom' })
      .build({ mimeType: 'image/jpeg', sourceCount: 1 });

    const serialised = JSON.stringify(recipe);
    expect(serialised).toContain('name_date_stamp');
    expect(serialised).toContain('stamped');
    // The customer's name would be the one thing that must never reach this row.
    expect(Object.keys(recipe.steps[0]?.detail ?? {})).toEqual(['stamped', 'position']);
  });

  it('caps the step list so a runaway loop cannot write an unbounded row', () => {
    const builder = new RecipeBuilder('photo_signature', null);
    for (let index = 0; index < 200; index += 1) builder.add('rotate', { degrees: 90 });
    const recipe = builder.build({ mimeType: 'image/jpeg', sourceCount: 1 });
    expect(recipe.steps).toHaveLength(40);
    expect(derivativeRecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it('treats a zero source count as one, since a derivative always has a source', () => {
    const recipe = new RecipeBuilder('pdf_studio', null).build({
      mimeType: 'application/pdf',
      sourceCount: 0,
    });
    expect(recipe.sourceCount).toBe(1);
  });
});

describe('buildDerivativeMetadata', () => {
  it('snapshots the preset rule, so the row still explains itself after the catalogue moves', () => {
    const recipe = new RecipeBuilder('photo_signature', 'ssc.photo')
      .add('compress', { bytes: 47_104 })
      .build({ mimeType: 'image/jpeg', sourceCount: 1 });

    const metadata = buildDerivativeMetadata(recipe);
    expect(metadata.preset).toMatchObject({
      code: 'ssc.photo',
      portal: 'SSC',
      minBytes: 20 * 1024,
      maxBytes: 50 * 1024,
    });
    expect(metadata.preset?.source).toBeTruthy();
  });

  it('has no preset to snapshot when the operator worked to custom numbers', () => {
    const recipe = new RecipeBuilder('photo_signature', null).build({
      mimeType: 'image/jpeg',
      sourceCount: 1,
    });
    expect(buildDerivativeMetadata(recipe).preset).toBeNull();
  });

  it('survives a preset code that has since left the catalogue', () => {
    const recipe = new RecipeBuilder('photo_signature', 'retired.preset').build({
      mimeType: 'image/jpeg',
      sourceCount: 1,
    });
    const metadata = buildDerivativeMetadata(recipe);
    expect(metadata.preset).toBeNull();
    expect(metadata.recipe.presetCode).toBe('retired.preset');
  });
});

describe('stepLabelKey', () => {
  it('points at a translation key rather than an English string', () => {
    expect(stepLabelKey({ operation: 'compress' })).toBe('documentTools.operations.compress');
  });
});
