/**
 * The app settings file: what a cold start reads to skip onboarding and restore the language.
 * Anything it cannot trust must give the first-launch defaults, never an error.
 */

import { describe, expect, it } from 'vitest';

import {
  APP_SETTINGS_VERSION,
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  serialiseAppSettings,
  withAppSettings,
} from '../lib/settings/app-settings';

describe('parseAppSettings', () => {
  it('round-trips what it writes', () => {
    const settings = { onboardingComplete: true, locale: 'hi' } as const;
    expect(parseAppSettings(serialiseAppSettings(settings))).toEqual(settings);
    expect(parseAppSettings(serialiseAppSettings(DEFAULT_APP_SETTINGS))).toEqual(
      DEFAULT_APP_SETTINGS,
    );
  });

  it('starts fresh when there is no file', () => {
    expect(parseAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(parseAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(parseAppSettings('')).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('starts fresh on corrupt or foreign content', () => {
    for (const text of [
      '{',
      'null',
      '[]',
      '"settings"',
      JSON.stringify({ onboardingComplete: true, locale: 'hi' }),
      JSON.stringify({ version: APP_SETTINGS_VERSION + 1, onboardingComplete: true, locale: null }),
      JSON.stringify({ version: APP_SETTINGS_VERSION, onboardingComplete: 'yes', locale: null }),
      JSON.stringify({ version: APP_SETTINGS_VERSION, onboardingComplete: true, locale: 'fr' }),
    ]) {
      expect(parseAppSettings(text), text).toEqual(DEFAULT_APP_SETTINGS);
    }
  });

  it('writes only the settings, never anything else', () => {
    const written = JSON.parse(serialiseAppSettings({ onboardingComplete: true, locale: 'en' }));
    expect(Object.keys(written).sort()).toEqual(['locale', 'onboardingComplete', 'version']);
  });
});

describe('withAppSettings', () => {
  it('changes only what is given', () => {
    const start = { onboardingComplete: false, locale: 'hi' } as const;
    expect(withAppSettings(start, { onboardingComplete: true })).toEqual({
      onboardingComplete: true,
      locale: 'hi',
    });
    expect(withAppSettings(start, { locale: 'en' })).toEqual({
      onboardingComplete: false,
      locale: 'en',
    });
  });

  it('can go back to following the phone language', () => {
    expect(withAppSettings({ onboardingComplete: true, locale: 'hi' }, { locale: null })).toEqual({
      onboardingComplete: true,
      locale: null,
    });
  });
});
