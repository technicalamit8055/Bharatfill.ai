import 'server-only';

import { notFound as renderNotFound, redirect } from 'next/navigation';
import {
  platformPermissionsFor,
  type PlatformPermission,
  type PlatformRole,
} from '@assistigo/core';
import { serverEnv } from '../env';
import { createSupabaseAdminClient, createSupabaseServerClient } from '../supabase/server';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { parseAdminEmails, resolvePlatformIdentity } from './authorize';
import { loadRosterEntry } from './context';

/**
 * Session helpers for the `/admin` Server Components.
 *
 * The page counterpart to ./context.ts, exactly as lib/auth/session.ts is to lib/api/context.ts:
 * same rules, different entry point, because a page has no Request object to read a bearer token
 * from.
 *
 * A signed-in user who is not internal staff gets a 404, not a redirect and not a 403. The
 * existence of an internal admin surface is not something a tenant's session needs confirmed.
 */

export type PlatformSession = {
  userId: string;
  email: string | null;
  role: PlatformRole;
  permissions: ReadonlySet<PlatformPermission>;
  via: 'roster' | 'bootstrap';
  /** Service-role client. BYPASSES RLS; only reachable after the gate below has passed. */
  supabase: AssistigoSupabaseClient;
};

export async function requirePlatformSession(): Promise<PlatformSession> {
  const userClient = await createSupabaseServerClient();
  const { data, error } = await userClient.auth.getUser();

  // Not signed in at all: send them to sign in and bring them back. This is the one case where a
  // redirect is right — it says nothing about whether /admin exists for them.
  if (error || !data.user) redirect('/sign-in?next=/admin');

  const supabase = createSupabaseAdminClient();
  const roster = await loadRosterEntry(supabase, data.user.id);

  const identity = resolvePlatformIdentity({
    email: data.user.email ?? null,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
    roster: roster ? { role: roster.role, isActive: roster.is_active } : null,
    adminEmails: parseAdminEmails(serverEnv().ADMIN_EMAILS),
  });

  if (!identity.granted) renderNotFound();

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    role: identity.role,
    permissions: platformPermissionsFor(identity.role),
    via: identity.via,
    supabase,
  };
}

/**
 * Page-level gate. The admin sidebar already hides what a role cannot reach, but an employee who
 * types the URL must land on a 404 rather than a half-rendered page that queries anyway.
 */
export async function requirePlatformPagePermission(
  permission: PlatformPermission,
): Promise<PlatformSession> {
  const session = await requirePlatformSession();
  if (!session.permissions.has(permission)) renderNotFound();
  return session;
}

/**
 * Whether the current user is internal staff, for rendering the "Admin" link in the operator
 * shell — and nothing else.
 *
 * Reads `platform_admins` through the CALLER'S OWN client, not the service role. That is what the
 * self-read policy in 0021 exists for: one indexed lookup of a row the user is allowed to see,
 * on a hot layout render, without minting a service-role client on every dashboard page load.
 *
 * Deliberately does not consult `ADMIN_EMAILS`. A bootstrap admin can still open /admin by URL;
 * making the link appear would mean reading a server secret on a path that only decides whether
 * to draw a link, and the link is not the gate — `requirePlatformSession()` is.
 */
export async function isPlatformStaff(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;

  const { data: row } = await supabase
    .from('platform_admins')
    .select('is_active')
    .eq('user_id', data.user.id)
    .maybeSingle();

  return Boolean((row as { is_active: boolean } | null)?.is_active);
}
