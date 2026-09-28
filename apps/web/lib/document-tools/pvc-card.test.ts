import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { CARD_ARTWORK, CARD_COPY_KEYS, CARD_FEATURES } from './pvc-card';

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

const ALL_KEYS = [
  ...CARD_COPY_KEYS,
  ...CARD_FEATURES.flatMap((feature) => [feature.titleKey, feature.hintKey]),
];

describe('PVC card copy', () => {
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

  it('keeps the face placeholder in the upload title, so Front and Back read differently', () => {
    for (const messages of [en, hi]) {
      expect(lookup(messages, 'documentTools.card.chooseImage')).toContain('{face}');
    }
  });
});

describe('PVC card artwork', () => {
  it('points every image at a file that ships in public/', () => {
    const publicDir = join(__dirname, '../../public');
    for (const src of Object.values(CARD_ARTWORK)) {
      expect(existsSync(join(publicDir, src)), src).toBe(true);
    }
  });
});
