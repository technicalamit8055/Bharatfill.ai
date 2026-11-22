/**
 * Guards the security-setup copy: every key the screen renders must resolve in both
 * catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { REGISTRATION_STEPS } from '../lib/auth/registration-steps';

const RENDERED_KEYS = [
  'splash.brandPrimary',
  'splash.brandAccent',
  'splash.subtitle',
  'splash.footer',
  'registration.back',
  'registration.stepProgress',
  ...REGISTRATION_STEPS.map((step) => `registration.steps.${step}`),
  'securitySetup.skip',
  'securitySetup.skipHint',
  'securitySetup.headlineLead',
  'securitySetup.headlineAccent',
  'securitySetup.subtitle',
  'securitySetup.options.biometric.title',
  'securitySetup.options.biometric.body',
  'securitySetup.options.pin.title',
  'securitySetup.options.pin.body',
  'securitySetup.setUp',
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('security setup copy', () => {
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
