/**
 * Guards the onboarding explainer copy: every key the screen renders must resolve in both
 * catalogues, and the step label must keep its interpolation tokens in each language.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';

const FEATURE_KEYS = ['scan', 'vault', 'forms', 'reach'] as const;

const RENDERED_KEYS = [
  'splash.brandPrimary',
  'splash.brandAccent',
  'onboarding.brandSubtitle',
  'onboarding.skip',
  'onboarding.skipHint',
  'onboarding.headlineScan',
  'onboarding.headlineSave',
  'onboarding.headlineKaro',
  'onboarding.headlineEverywhere',
  'onboarding.subtitle',
  'onboarding.next',
  'onboarding.progress',
  ...FEATURE_KEYS.flatMap((key) => [
    `onboarding.features.${key}.title`,
    `onboarding.features.${key}.body`,
  ]),
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('onboarding copy', () => {
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
  ])('keeps the step placeholders in %s', (_locale, dictionary) => {
    const progress = lookup(dictionary, 'onboarding.progress');
    expect(progress).toContain('{current}');
    expect(progress).toContain('{total}');
  });
});
