/**
 * Indian mobile number handling for citizen sign-in (`docs/CITIZEN_MOBILE_APP_SPEC.md` §3
 * Feature 3: registration is by 10-digit mobile number + SMS OTP).
 *
 * The input box shows a fixed +91, so the citizen only ever types the 10-digit national number.
 * Everything here is pure so it can be tested without a device, and nothing here logs or
 * persists the number — it is PII.
 */

import { z } from 'zod';

export const INDIA_DIAL_CODE = '+91';
export const MOBILE_NUMBER_LENGTH = 10;

/** Indian mobile numbers are 10 digits and start with 6, 7, 8 or 9. */
export const indianMobileSchema = z.string().regex(/^[6-9]\d{9}$/);

export type MobileNumberStatus = 'incomplete' | 'invalid' | 'valid';

/**
 * Reduces whatever was typed or pasted to at most 10 national digits.
 *
 * A pasted "+91 98xxx xxxxx" or "098xxxxxxxx" carries a prefix the fixed +91 box already
 * shows, so a full 12-digit `91…` or 11-digit `0…` number has that prefix dropped rather than
 * being truncated into the wrong number.
 */
export function normaliseMobileInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.length === MOBILE_NUMBER_LENGTH + 2 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === MOBILE_NUMBER_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, MOBILE_NUMBER_LENGTH);
}

/** Groups national digits as "98xxx xxxxx" for display. */
export function formatMobileForDisplay(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function mobileNumberStatus(digits: string): MobileNumberStatus {
  if (digits.length < MOBILE_NUMBER_LENGTH) return 'incomplete';
  return indianMobileSchema.safeParse(digits).success ? 'valid' : 'invalid';
}

/** E.164 form (`+91XXXXXXXXXX`) — what an SMS OTP provider expects. Throws on bad input. */
export function toE164(digits: string): string {
  return `${INDIA_DIAL_CODE}${indianMobileSchema.parse(digits)}`;
}

/**
 * Reads an E.164 Indian number back to its 10 national digits, or `null` when it is not one.
 *
 * Only the digits are checked, because a `+` in a route param can arrive decoded as a space.
 */
export function nationalDigitsFromE164(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== MOBILE_NUMBER_LENGTH + 2 || !digits.startsWith('91')) return null;

  const national = digits.slice(2);
  return indianMobileSchema.safeParse(national).success ? national : null;
}

/** "+91 98765 43210" — how the citizen's own number is echoed back on the OTP screen. */
export function formatE164ForDisplay(nationalDigits: string): string {
  return `${INDIA_DIAL_CODE} ${formatMobileForDisplay(nationalDigits)}`;
}
