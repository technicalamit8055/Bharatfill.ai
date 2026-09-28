import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import {
  EXAMPLE_TAB_KEYS,
  STUDIO_CHECKLIST_KEYS,
  STUDIO_COPY_KEYS,
  STUDIO_EXAMPLES,
  STUDIO_FEATURES,
} from './studio';

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
  ...STUDIO_COPY_KEYS,
  ...STUDIO_CHECKLIST_KEYS,
  ...STUDIO_FEATURES.map((feature) => feature.labelKey),
  ...Object.values(EXAMPLE_TAB_KEYS),
  ...Object.values(STUDIO_EXAMPLES).flatMap((stages) => stages.map((stage) => stage.labelKey)),
];

describe('photo studio copy', () => {
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
});

describe('photo studio examples', () => {
  it('draws the same four stages for every kind, so the grid never reflows between tabs', () => {
    for (const stages of Object.values(STUDIO_EXAMPLES)) {
      expect(stages.map((stage) => stage.style)).toEqual(['plain', 'cutout', 'portal', 'custom']);
    }
  });

  it('points every example at a file that ships in public/', () => {
    const publicDir = join(__dirname, '../../public');
    for (const stage of Object.values(STUDIO_EXAMPLES).flat()) {
      expect(existsSync(join(publicDir, stage.src)), stage.src).toBe(true);
    }
  });
});
