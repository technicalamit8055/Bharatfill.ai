/**
 * Guards the scanner, review and scan-result copy: every key those screens render — including
 * one per status, capture mode and filter — must resolve in both catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { PAGE_FILTERS } from '../lib/scan/filters';
import { QUALITY_ISSUES } from '../lib/scan/photo-quality';
import { CAPTURE_MODES } from '../lib/scan/scan-session';

/** Mirrors `ScannerStatus` in `components/scanner/ScannerScreen.tsx`. */
const STATUSES = ['starting', 'searching', 'hold', 'tap', 'capturing'];
const FILTERS = PAGE_FILTERS;
const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

const RENDERED_KEYS = [
  'scan.placeholderTitle',
  'scan.placeholderBody',
  'scan.open',
  ...[
    'close',
    'flash',
    'flashOn',
    'flashOff',
    'tips',
    'tipsHint',
    'tipsTitle',
    'tipsBody',
    'headlineLead',
    'headlineAccent',
    'subtitle',
    'gallery',
    'galleryHint',
    'shutter',
    'multiPage',
    'multiPageOn',
    'multiPageOff',
    'done',
    'reviewPages',
    'aiTitle',
    'aiBody',
    'access.title',
    'access.body',
    'access.action',
    'discardTitle',
    'discardBody',
    'discard',
    'errors.title',
    'errors.captureFailed',
    'errors.pageLimit',
    'presets.idCard.front',
    'presets.idCard.back',
    'presets.photo.guide',
    'presets.signature.guide',
    'platform.title',
    'platform.body',
    'platform.opening',
    'platform.scan',
    'platform.useCamera',
  ].map((key) => `scanner.${key}`),
  ...STATUSES.map((status) => `scanner.status.${status}`),
  ...CAPTURE_MODES.map((mode) => `scanner.captureModes.${mode}`),
  ...FILTERS.map((filter) => `scanner.filters.${filter}`),
  ...[
    'back',
    'pageOf',
    'subtitle',
    'pageLabel',
    'cropTitle',
    'cropDone',
    'cropCancel',
    'cropApply',
    'cropReset',
    'cropHint',
    'crop',
    'rotateLeft',
    'rotateRight',
    'straighten',
    'straightenReset',
    'retake',
    'replace',
    'deletePage',
    'deleteTitle',
    'deleteBody',
    'addPage',
    'save',
    'processing',
    'failed',
    'retry',
    'notDetected',
    'previewLabel',
    'zoom',
    'zoomIn',
    'zoomOut',
    'zoomClose',
    'zoomHint',
    'saveFailed',
    'sides.front',
    'sides.back',
    'quality.keep',
    'quality.keepHint',
  ].map((key) => `scanReview.${key}`),
  ...QUALITY_ISSUES.map((issue) => `scanReview.quality.${issue}`),
  ...CORNERS.map((corner) => `scanReview.corners.${corner}`),
  'scanResult.title',
  'scanResult.subtitle',
  'scanResult.pageLabel',
  'scanResult.loading',
  'scanResult.notFound',
  'scanResult.unreadable',
  'scanResult.done',
  'scanResult.scanAnother',
  'scanResult.delete',
  'scanResult.deleteTitle',
  'scanResult.deleteBody',
  'scanResult.deleteFailed',
  'scanResult.cancel',
  'common.ok',
  'common.errorTitle',
];

/** Keys whose copy must keep a placeholder the screen interpolates. */
const PLACEHOLDERS: Record<string, readonly string[]> = {
  'scanner.done': ['{count}'],
  'scanner.reviewPages': ['{count}'],
  'scanner.errors.pageLimit': ['{max}'],
  'scanReview.pageOf': ['{number}', '{total}'],
  'scanReview.pageLabel': ['{number}'],
  'scanResult.pageLabel': ['{number}', '{total}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('scanner copy', () => {
  it('names every filter the catalogue defines, and no others', () => {
    expect(Object.keys(en.scanner.filters).sort()).toEqual([...FILTERS].sort());
  });

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

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the interpolation placeholders in %s', (_locale, dictionary) => {
    for (const [key, placeholders] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of placeholders) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });
});
