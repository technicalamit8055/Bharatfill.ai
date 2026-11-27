/**
 * The Profile tab's pure helpers: the phone line, the display name, language labels, the app
 * version, and what a production build shows before sign-in exists.
 */

import { describe, expect, it } from 'vitest';

import { LOCALES } from '../lib/i18n';
import {
  appVersionOf,
  displayNameOf,
  languageLabelKey,
  PROFILE_LANGUAGES,
  PROFILE_MENU_ITEMS,
  phoneLineOf,
  SIGNED_OUT_PROFILE,
} from '../lib/profile/profile-screen';

describe('phoneLineOf', () => {
  it('shows a valid number with the country code, grouped 5 + 5', () => {
    expect(phoneLineOf('9876543210')).toBe('+91 98765 43210');
    expect(phoneLineOf('6000000000')).toBe('+91 60000 00000');
  });

  it('hides anything that is not a 10-digit Indian mobile number', () => {
    expect(phoneLineOf('')).toBeNull();
    expect(phoneLineOf('987654321')).toBeNull();
    expect(phoneLineOf('98765432101')).toBeNull();
    expect(phoneLineOf('5876543210')).toBeNull();
    expect(phoneLineOf('+919876543210')).toBeNull();
  });
});

describe('displayNameOf', () => {
  it('tidies whitespace', () => {
    expect(displayNameOf('  Sample   Citizen ')).toBe('Sample Citizen');
    expect(displayNameOf('अमित कुमार')).toBe('अमित कुमार');
  });

  it('has no name to show for blank input', () => {
    expect(displayNameOf('')).toBeNull();
    expect(displayNameOf('   ')).toBeNull();
  });
});

describe('languageLabelKey', () => {
  it('offers every locale the app has', () => {
    expect(PROFILE_LANGUAGES).toEqual(LOCALES);
    expect(languageLabelKey('en')).toBe('profile.languages.en');
    expect(languageLabelKey('hi')).toBe('profile.languages.hi');
  });
});

describe('appVersionOf', () => {
  it('uses the version the build reports', () => {
    expect(appVersionOf('1.0.0')).toBe('1.0.0');
    expect(appVersionOf(' 0.1.0 ')).toBe('0.1.0');
  });

  it('has no version when the build reports none', () => {
    expect(appVersionOf(undefined)).toBeNull();
    expect(appVersionOf(null)).toBeNull();
    expect(appVersionOf('  ')).toBeNull();
  });
});

describe('profile screen', () => {
  it('lists the settings rows in the mockup order', () => {
    expect(PROFILE_MENU_ITEMS).toEqual([
      'personal',
      'family',
      'security',
      'centres',
      'notifications',
      'language',
      'appearance',
      'help',
      'about',
    ]);
  });

  it('starts signed out, so production shows no account, plan or Log Out', () => {
    expect(SIGNED_OUT_PROFILE).toEqual({ status: 'signed_out' });
  });
});
