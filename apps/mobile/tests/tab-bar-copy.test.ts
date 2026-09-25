/**
 * Guards the tab bar copy: every tab's label and screen title must resolve in both catalogues.
 * The Connect (Share) screen's own copy is guarded by `connect-copy.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';

/** The tabs in bar order, as registered in `app/(tabs)/_layout.tsx`. */
const TABS = ['home', 'vault', 'scan', 'share', 'profile'] as const;

const RENDERED_KEYS = [...TABS.map((tab) => `tabs.${tab}`), ...TABS.map((tab) => `${tab}.title`)];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('tab bar copy', () => {
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
});
