/**
 * Guards the profile-setup copy: every key the screen, its pickers and the route render must
 * resolve in both catalogues, and the messages that quote a limit must still carry it.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { REGISTRATION_STEPS } from '../lib/auth/registration-steps';
import { LOCALES } from '../lib/i18n';
import { MONTH_KEYS } from '../lib/profile/date-of-birth';
import { PROFILE_GENDERS } from '../lib/profile/profile';

const RENDERED_KEYS = [
  'splash.brandPrimary',
  'splash.brandAccent',
  'splash.subtitle',
  'splash.footer',
  'registration.back',
  'registration.ok',
  'registration.stepProgress',
  ...REGISTRATION_STEPS.map((step) => `registration.steps.${step}`),
  'profileSetup.skip',
  'profileSetup.skipHint',
  'profileSetup.headlineLead',
  'profileSetup.headlineAccent',
  'profileSetup.subtitle',
  'profileSetup.nameLabel',
  'profileSetup.namePlaceholder',
  'profileSetup.dobLabel',
  'profileSetup.dobPlaceholder',
  'profileSetup.genderLabel',
  'profileSetup.stateLabel',
  'profileSetup.statePlaceholder',
  'profileSetup.languageLabel',
  'profileSetup.errors.nameMissing',
  'profileSetup.errors.nameTooShort',
  'profileSetup.errors.nameTooLong',
  'profileSetup.errors.nameInvalid',
  'profileSetup.errors.dobMissing',
  'profileSetup.errors.dobInvalid',
  'profileSetup.errors.dobFuture',
  'profileSetup.errors.dobTooOld',
  'profileSetup.errors.genderMissing',
  'profileSetup.errors.stateMissing',
  'profileSetup.trustTitle',
  'profileSetup.trustBody',
  'profileSetup.continue',
  'profileSetup.saveUnavailableTitle',
  'profileSetup.saveUnavailableBody',
  'profileSetup.sheet.close',
  'profileSetup.sheet.cancel',
  'profileSetup.sheet.done',
  'profileSetup.sheet.day',
  'profileSetup.sheet.month',
  'profileSetup.sheet.year',
  ...PROFILE_GENDERS.map((gender) => `profileSetup.genders.${gender}`),
  ...LOCALES.map((locale) => `profileSetup.languages.${locale}`),
  ...MONTH_KEYS.map((month) => `profileSetup.months.${month}`),
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('profile setup copy', () => {
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
  ])('keeps the placeholders in %s', (_locale, dictionary) => {
    expect(lookup(dictionary, 'profileSetup.errors.nameTooLong')).toContain('{max}');
    expect(lookup(dictionary, 'profileSetup.errors.dobTooOld')).toContain('{max}');
    for (const token of ['{current}', '{total}', '{label}']) {
      expect(lookup(dictionary, 'registration.stepProgress')).toContain(token);
    }
  });
});
