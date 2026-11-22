import 'server-only';

import { notFound, unauthenticated } from '@assistigo/core';
import {
  createSupabaseAdminClient,
  createSupabaseTokenClient,
  type AssistigoSupabaseClient,
} from '../supabase/server';

/**
 * Request context for the citizen app's routes (`/api/citizen/*`; docs/VAULT_BRIDGE_DESIGN.md §2).
 *
 * The mirror image of `lib/api/context.ts`: that one requires a centre membership, this one
 * requires a citizen principal — an account tagged `app_metadata.principal = 'citizen'` (0038's
 * trigger tags every phone sign-up) or a phone-only account. An operator's token is answered with
 * the same 404 as an unknown route, so the citizen API does not confirm itself to operators.
 *
 * Bearer token only: the citizen app is a native client, never a cookie session in a browser.
 * `getUser()` verifies the JWT with the auth server — the user's `app_metadata` it returns is the
 * server's copy, not whatever claims a forged token carries.
 *
 * `admin` is the service-role client. Citizen tables accept no client writes (0038 note 2), so
 * routes write through it — only after this function has proved who the citizen is, and only
 * ever with `citizenId` from here in the predicate.
 */

export type CitizenContext = {
  citizenId: string;
  /** E.164 without "+", as Supabase Auth stores it ("919900012345"). Never log it. */
  phone: string | null;
  supabase: AssistigoSupabaseClient;
  admin: AssistigoSupabaseClient;
  ipAddress: string | null;
  userAgent: string | null;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown> | null;
};

/** Same rule as `public.is_citizen_principal()` in 0038. Exported for tests. */
export function isCitizenUser(user: AuthUserLike): boolean {
  if (user.is_anonymous) return false;
  if (user.app_metadata?.principal === 'citizen') return true;
  const hasPhone = typeof user.phone === 'string' && user.phone.trim() !== '';
  const hasEmail = typeof user.email === 'string' && user.email.trim() !== '';
  return hasPhone && !hasEmail;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token === '' ? null : token;
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export async function resolveCitizen(request: Request): Promise<CitizenContext> {
  const token = bearerToken(request);
  if (!token) throw unauthenticated();

  const supabase = createSupabaseTokenClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw unauthenticated();
  if (!isCitizenUser(data.user)) throw notFound();

  return {
    citizenId: data.user.id,
    phone: data.user.phone ?? null,
    supabase,
    admin: createSupabaseAdminClient(),
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  };
}
