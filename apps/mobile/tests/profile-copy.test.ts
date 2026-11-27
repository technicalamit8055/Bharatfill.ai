/**
 * Guards the Profile tab copy: every key the screen and its route render, including the ones
 * built from a menu row, a plan, a locale, a colour scheme or a "not live yet" reason, must
 * resolve in both catalogues — and keep the placeholders the screen fills in.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { LOCALES } from '../lib/i18n';
import { PROFILE_MENU_ITEMS, PROFILE_PLANS } from '../lib/profile/profile-screen';

/** Rows whose second line is fixed copy rather than the current language or scheme. */
const ROWS_WITH_SUBTITLES = PROFILE_MENU_ITEMS.filter(
  (item) => item !== 'language' && item !== 'appearance',
);

/**
 * Everything the route can say is not live yet: every row but Language, About and Family
 * (which is on the phone, so always there), and more.
 */
const UNAVAILABLE_REASONS = [
  ...PROFILE_MENU_ITEMS.filter(
    (item) => item !== 'language' && item !== 'about' && item !== 'family',
  ),
  'settings',
  'photo',
  'plan',
  'logout',
];

const RENDERED_KEYS = [
  'profile.title',
  'profile.heading',
  'profile.subtitle',
  'profile.settings',
  'profile.openAccount',
  'profile.changePhoto',
  'profile.verified',
  'profile.signIn',
  'profile.signedOutTitle',
  'profile.signedOutBody',
  ...PROFILE_PLANS.flatMap((plan) => [`profile.plan.${plan}.title`, `profile.plan.${plan}.body`]),
  'profile.plan.upgrade',
  ...PROFILE_MENU_ITEMS.map((item) => `profile.menu.${item}.title`),
  ...ROWS_WITH_SUBTITLES.map((item) => `profile.menu.${item}.subtitle`),
  'profile.menu.about.subtitleUnknown',
  ...LOCALES.map((locale) => `profile.languages.${locale}`),
  'profile.languageSheetTitle',
  'profile.close',
  'profile.appearance.light',
  'profile.appearance.dark',
  'profile.logout',
  ...UNAVAILABLE_REASONS.map((reason) => `profile.unavailable.${reason}`),
  'app.name',
  'app.tagline',
  'common.comingSoon',
  'common.ok',
];

/** Keys whose copy must keep a placeholder the screen interpolates. */
const PLACEHOLDERS: Record<string, readonly string[]> = {
  'profile.menu.about.subtitle': ['{version}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('profile copy', () => {
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

  it('defines the same profile keys in Hindi as in English', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(hi.profile).sort()).toEqual(keys(en.profile).sort());
  });
});
