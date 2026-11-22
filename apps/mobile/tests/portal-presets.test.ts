/**
 * Export for a form (portal presets): which presets a vault document is offered, how its picture
 * is shaped to one, and the copy. Pure; the OpenCV encoder is not exercised here.
 */

import { findPreset, presetTargetSize, type RequirementPreset } from '@assistigo/document-tools';
import { describe, expect, it } from 'vitest';

import {
  canShrink,
  PHOTO_TRIM_TOLERANCE,
  planPortalRender,
  plannedSize,
  portalFileName,
  portalPresetsFor,
  presetName,
} from '../lib/vault/portal-presets';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

function preset(code: string): RequirementPreset {
  const found = findPreset(code);
  if (!found) throw new Error(`no preset ${code}`);
  return found;
}

describe('which presets a document is offered', () => {
  it('offers photo presets for a photo, never thumb impressions or declarations', () => {
    const codes = portalPresetsFor('photo', 1).map((p) => p.code);
    expect(codes).toContain('ssc.photo');
    expect(codes).toContain('nta.photo');
    expect(codes.some((code) => /thumb|declaration/.test(code))).toBe(false);
    expect(portalPresetsFor('photo', 1).every((p) => p.outputMime === 'image/jpeg')).toBe(true);
  });

  it('offers signature presets for a signature', () => {
    const codes = portalPresetsFor('signature', 1).map((p) => p.code);
    expect(codes).toContain('ssc.signature');
    expect(codes.every((code) => code.includes('signature'))).toBe(true);
  });

  it('offers nothing for other documents or for several pages', () => {
    expect(portalPresetsFor('marksheet_10', 1)).toEqual([]);
    expect(portalPresetsFor(null, 1)).toEqual([]);
    expect(portalPresetsFor('photo', 2)).toEqual([]);
  });
});

describe('shaping the picture', () => {
  it('trims a passport-shaped photo to the portal’s exact pixels', () => {
    const ssc = preset('ssc.photo');
    const target = presetTargetSize(ssc);
    // The app's own Photo preset: 35 × 45 mm at 300 dpi.
    const plan = planPortalRender(ssc, { width: 413, height: 531 });
    expect(plan.kind).toBe('cover');
    if (plan.kind !== 'cover') return;
    expect(plan.size).toEqual(target);
    expect(plan.crop.x).toBeGreaterThanOrEqual(0);
    expect(plan.crop.y).toBeGreaterThanOrEqual(0);
    expect(plan.crop.x + plan.crop.width).toBeLessThanOrEqual(413);
    expect(plan.crop.y + plan.crop.height).toBeLessThanOrEqual(531);
    expect(plannedSize(plan, { width: 413, height: 531 })).toEqual(target);
    expect(canShrink(plan)).toBe(false);
  });

  it('refuses to frame a photo whose shape is far from the portal’s', () => {
    expect(planPortalRender(preset('ssc.photo'), { width: 4000, height: 3000 })).toEqual({
      kind: 'needs_crop',
    });
    // Just inside the tolerance is trimmed, not refused.
    const target = presetTargetSize(preset('ssc.photo'));
    if (!target) throw new Error('ssc.photo states a size');
    const near = {
      width: Math.round(
        target.height * (target.width / target.height) * (1 + PHOTO_TRIM_TOLERANCE * 0.8),
      ),
      height: target.height,
    };
    expect(planPortalRender(preset('ssc.photo'), near).kind).toBe('cover');
  });

  it('centres a signature on white inside the portal’s exact box', () => {
    const ssc = preset('ssc.signature');
    const frame = presetTargetSize(ssc);
    const plan = planPortalRender(ssc, { width: 1200, height: 300 });
    expect(plan.kind).toBe('contain');
    if (plan.kind !== 'contain' || !frame) return;
    expect(plan.frame).toEqual(frame);
    const { x, y, width, height } = plan.content;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(x + width).toBeLessThanOrEqual(frame.width);
    expect(y + height).toBeLessThanOrEqual(frame.height);
    // Not stretched: the ink keeps its shape.
    expect(Math.abs(width / height - 1200 / 300)).toBeLessThan(0.05);
  });

  it('keeps the picture size, and may shrink it, when the preset states none', () => {
    const sizeOnly: RequirementPreset = {
      code: 'test.photo',
      portal: 'Test',
      label: 'Photo under 100 KB',
      category: 'photo',
      outputMime: 'image/jpeg',
      maxBytes: 100 * 1024,
      source: 'test',
      confidence: 'published',
    };
    const plan = planPortalRender(sizeOnly, { width: 900, height: 1200 });
    expect(plan).toEqual({ kind: 'keep' });
    expect(canShrink(plan)).toBe(true);
    expect(plannedSize(plan, { width: 900, height: 1200 })).toEqual({ width: 900, height: 1200 });
  });
});

describe('names', () => {
  it('names the file after the preset, never the citizen', () => {
    expect(portalFileName(preset('ssc.photo'))).toBe('ssc-photo.jpg');
    expect(portalFileName(preset('up_scholarship.signature'))).toBe('up-scholarship-signature.jpg');
  });

  it('shows the preset in Hindi when the catalogue has it', () => {
    expect(presetName(preset('ssc.signature'), 'en')).toBe('SSC · Signature');
    expect(presetName(preset('ssc.signature'), 'hi')).toBe('एसएससी · हस्ताक्षर');
  });
});

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

const RENDERED_KEYS = [
  'documentDetails.menu.forPortal',
  'documentDetails.actions.share',
  'common.cancel',
  'common.ok',
  ...[
    'chooseTitle',
    'chooseBody',
    'readyTitle',
    'readyBody',
    'window',
    'nameDateStamp',
    'failedTitle',
    'needs_crop',
    'too_large',
  ].map((key) => `portalExport.${key}`),
];

describe('export for a form copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('uses the same placeholders in English and Hindi', () => {
    const placeholders = (text: unknown) =>
      [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of RENDERED_KEYS) {
      expect(placeholders(lookup(hi, key)), key).toEqual(placeholders(lookup(en, key)));
    }
  });
});
