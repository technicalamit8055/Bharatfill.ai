/**
 * OTP entry and countdown for sign-in. Codes here are arbitrary digits, not real OTPs.
 */

import { describe, expect, it } from 'vitest';

import {
  formatCountdown,
  isCompleteOtp,
  normaliseOtpInput,
  OTP_LENGTH,
  secondsRemaining,
} from '../lib/auth/otp';

describe('normaliseOtpInput', () => {
  it('keeps digits only', () => {
    expect(normaliseOtpInput('12a3')).toBe('123');
  });

  it('accepts a pasted code with a space or dash', () => {
    expect(normaliseOtpInput('123 456')).toBe('123456');
    expect(normaliseOtpInput('123-456')).toBe('123456');
  });

  it(`caps at ${OTP_LENGTH} digits`, () => {
    expect(normaliseOtpInput('12345678')).toBe('123456');
  });
});

describe('isCompleteOtp', () => {
  it('needs exactly six digits', () => {
    expect(isCompleteOtp('123456')).toBe(true);
    expect(isCompleteOtp('12345')).toBe(false);
    expect(isCompleteOtp('1234567')).toBe(false);
    expect(isCompleteOtp('12345a')).toBe(false);
    expect(isCompleteOtp('')).toBe(false);
  });
});

describe('secondsRemaining', () => {
  const expiresAt = 1_000_000;

  it('rounds up so the last second still reads 00:01', () => {
    expect(secondsRemaining(expiresAt, expiresAt - 60_000)).toBe(60);
    expect(secondsRemaining(expiresAt, expiresAt - 52_300)).toBe(53);
    expect(secondsRemaining(expiresAt, expiresAt - 1)).toBe(1);
  });

  it('is zero at and after expiry', () => {
    expect(secondsRemaining(expiresAt, expiresAt)).toBe(0);
    expect(secondsRemaining(expiresAt, expiresAt + 5_000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('pads minutes and seconds', () => {
    expect(formatCountdown(52)).toBe('00:52');
    expect(formatCountdown(60)).toBe('01:00');
    expect(formatCountdown(75)).toBe('01:15');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('never shows a negative time', () => {
    expect(formatCountdown(-3)).toBe('00:00');
  });
});
