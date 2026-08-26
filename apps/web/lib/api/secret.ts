import { timingSafeEqual } from 'node:crypto';
import { unauthenticated } from '@assistigo/core';

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifies a `Bearer <secret>` header against a configured shared secret, for routes that run
 * with the service-role client and so must fail closed (scheduler crons, provider webhooks).
 * Throws `unauthenticated()` when the header is missing/wrong or the secret is unconfigured.
 */
export function requireBearerSecret(request: Request, expected: string | undefined): void {
  if (!expected) throw unauthenticated('errors.unauthenticated');

  const header = request.headers.get('authorization') ?? '';
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (provided === '' || !secretMatches(provided, expected)) {
    throw unauthenticated('errors.unauthenticated');
  }
}
