import 'server-only';

import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { ROAMING_OTP_LENGTH } from '@assistigo/core';

/**
 * The roaming consent code: generation, hashing, verification.
 * Migration 0024; docs/DEVELOPMENT_RULES.md §5 ("only sanctioned path" pattern applied here to a
 * secret rather than a customer value).
 *
 * The code itself is never stored — only a salted HMAC — mirroring
 * `apps/web/lib/extension/pairing.ts`. Unlike a pairing code this one is short enough to read
 * aloud and type at a counter, so it needs its own module rather than reusing that one's
 * 256-bit, base64url scheme.
 */

/** Six digits, drawn with `randomInt` rather than `Math.random()` (never a security-sensitive PRNG). */
export function generateRoamingOtp(): string {
  const max = 10 ** ROAMING_OTP_LENGTH;
  return String(randomInt(0, max)).padStart(ROAMING_OTP_LENGTH, '0');
}

/** "849201" -> "849 201", the form the outbound message and the operator's ear both use. */
export function formatRoamingOtp(otp: string): string {
  const mid = Math.ceil(otp.length / 2);
  return `${otp.slice(0, mid)} ${otp.slice(mid)}`;
}

export function newOtpSalt(): string {
  return randomBytes(24).toString('hex');
}

/** HMAC rather than a bare hash: the salt is the key, so no rainbow table spans every row. */
export function hashRoamingOtp(otp: string, salt: string): string {
  return createHmac('sha256', salt).update(otp, 'utf8').digest('hex');
}

/**
 * Named apart from the service-layer `verifyRoamingOtp` orchestration function.
 *
 * `safeEqual` lives at the `@assistigo/core/privacy/crypto` subpath rather than the package
 * barrel, so it can never be pulled into the extension or a browser bundle — imported
 * dynamically here to match every other server-only caller of that module
 * (e.g. `apps/web/lib/extension/pairing.ts`).
 */
export async function matchesRoamingOtp(
  candidate: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const { safeEqual } = await import('@assistigo/core/privacy/crypto');
  return safeEqual(hashRoamingOtp(candidate, salt), expectedHash);
}
