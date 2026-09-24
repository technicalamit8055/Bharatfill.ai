/**
 * SMS OTP entry for citizen sign-in (`docs/CITIZEN_MOBILE_APP_SPEC.md` §3 Feature 3).
 *
 * This is the citizen typing the code BharatDoc sent to their own phone — not portal OTP
 * handling, which the product never automates. Everything here is pure so it can be tested
 * without a device, and nothing here logs or persists the code.
 */

import { z } from 'zod';

export const OTP_LENGTH = 6;

/** How long a sent code stays valid; the Resend link unlocks when it runs out. */
export const OTP_TTL_SECONDS = 60;

export const otpSchema = z.string().regex(/^\d{6}$/);

/** Reduces whatever was typed or pasted ("123 456", "123-456") to at most 6 digits. */
export function normaliseOtpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return otpSchema.safeParse(code).success;
}

/**
 * Whole seconds left until `expiresAt` (epoch ms), rounded up so the display reads 00:01 until
 * the code has actually expired. Never negative.
 */
export function secondsRemaining(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/** `52` → "00:52", `75` → "01:15". */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
