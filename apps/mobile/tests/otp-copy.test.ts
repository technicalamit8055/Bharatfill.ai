/**
 * Guards the OTP verification copy: every key the screen and route render must resolve in
 * both catalogues, and the sent-to line must still carry the number.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';

const RENDERED_KEYS = [
  'splash.brandPrimary',
  'splash.brandAccent',
  'splash.subtitle',
  'registration.back',
  'registration.ok',
  'registration.otpUnavailableTitle',
  'registration.otpUnavailableBody',
  'otp.help',
  'otp.helpHint',
  'otp.helpTitle',
  'otp.helpBody',
  'otp.eyebrow',
  'otp.headlineAccent',
  'otp.headlineRest',
  'otp.sentTo',
  'otp.codeLabel',
  'otp.incomplete',
  'otp.expiresPrefix',
  'otp.expiresSuffix',
  'otp.expired',
  'otp.verify',
  'otp.notReceived',
  'otp.resend',
  'otp.resendWait',
  'otp.secureTitle',
  'otp.secureBody',
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('otp copy', () => {
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
  ])('interpolates the phone number in %s', (_locale, dictionary) => {
    expect(lookup(dictionary, 'otp.sentTo')).toContain('{phone}');
  });
});
