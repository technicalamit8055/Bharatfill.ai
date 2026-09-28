import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { PDF_ARTWORK, PDF_COPY_KEYS, PDF_FEATURES } from './pdf-studio';

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

const ALL_KEYS = [...PDF_COPY_KEYS, ...PDF_FEATURES.map((feature) => feature.labelKey)];

describe('PDF Studio copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a non-empty %s string for every key', (_locale, messages) => {
    const missing = ALL_KEYS.filter((key) => {
      const value = lookup(messages, key);
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('keeps the size placeholder in the supported-formats caption', () => {
    for (const messages of [en, hi]) {
      expect(lookup(messages, 'documentTools.pdf.supports')).toContain('{size}');
    }
  });

  it('lists each feature once', () => {
    const ids = PDF_FEATURES.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('PDF Studio artwork', () => {
  it('points every image at a file that ships in public/', () => {
    const publicDir = join(__dirname, '../../public');
    for (const src of Object.values(PDF_ARTWORK)) {
      expect(existsSync(join(publicDir, src)), src).toBe(true);
    }
  });
});
