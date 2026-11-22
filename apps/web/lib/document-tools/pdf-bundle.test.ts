import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { PDF_BUNDLE_COPY_KEYS } from './pdf-bundle';

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

/** Keys the editor borrows from the other tools. */
const SHARED_KEYS = [
  'documentTools.rule.maxKb',
  'documentTools.pdf.allowRasterise',
  'documentTools.pdf.rasterisedWarning',
  'documentTools.card.password',
  'documentTools.card.unlock',
  'documentTools.card.passwordIncorrect',
  'documentTools.warnings.overLimit',
  'documentTools.warnings.tooLargeToSave',
  'documentTools.errors.assembleFailed',
  'documentTools.hub.pdfStudio.title',
];

describe('PDF bundle copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a non-empty %s string for every key', (_locale, messages) => {
    const missing = [...PDF_BUNDLE_COPY_KEYS, ...SHARED_KEYS].filter((key) => {
      const value = lookup(messages, key);
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders in both locales', () => {
    for (const messages of [en, hi]) {
      expect(lookup(messages, 'documentTools.bundle.summary')).toContain('{documents}');
      expect(lookup(messages, 'documentTools.bundle.summary')).toContain('{pages}');
      expect(lookup(messages, 'documentTools.bundle.passwordFor')).toContain('{name}');
    }
  });
});
