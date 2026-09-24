/**
 * Guards the mobile-number registration copy: every key the screen and route render must
 * resolve in both catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';

const RENDERED_KEYS = [
  'splash.brandPrimary',
  'splash.brandAccent',
  'splash.subtitle',
  'splash.footer',
  'registration.back',
  'registration.skip',
  'registration.skipHint',
  'registration.headlineLead',
  'registration.headlineAccent',
  'registration.subtitle',
  'registration.fieldLabel',
  'registration.country',
  'registration.placeholder',
  'registration.invalidNumber',
  'registration.getOtp',
  'registration.legalPrefix',
  'registration.terms',
  'registration.and',
  'registration.privacyPolicy',
  'registration.privacyTitle',
  'registration.privacyBody',
  'registration.otpUnavailableTitle',
  'registration.otpUnavailableBody',
  'registration.ok',
];

/** May be empty: English needs no words after "Privacy Policy", Hindi does. */
const OPTIONAL_KEYS = ['registration.legalSuffix'];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('registration copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
    for (const key of OPTIONAL_KEYS) {
      expect(typeof lookup(dictionary, key), key).toBe('string');
    }
  });
});
