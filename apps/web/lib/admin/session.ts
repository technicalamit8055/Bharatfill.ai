import 'server-only';

import { cookies } from 'next/headers';
import { notFound as renderNotFound, redirect } from 'next/navigation';
import {
  CONSOLE_PORTAL_PATHS,
  consolePortalFor,
  platformPermissionsFor,
  type ConsolePortal,
  type PlatformPermission,
  type PlatformRole,
} from '@assistigo/core';
import { publicEnv, serverEnv } from '../env';
import { createSupabaseAdminClient, createSupabaseServerClient } from '../supabase/server';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { parseAdminEmails, resolvePlatformIdentity, type PlatformIdentity } from './authorize';
import { consoleSigningKey, loadRosterEntry } from './context';
import {
  CONSOLE_SESSION_COOKIE,
  CONSOLE_SESSION_TTL_SECONDS,
  mintConsoleSession,
  verifyConsoleSession,
  type ConsoleSessionPayload,
} from './console-session';

/**
 * Session helpers for the `/admin` Server Components and server actions.
 *
 * The page counterpart to ./context.ts, exactly as lib/auth/session.ts is to lib/api/context.ts:
 * same rules, different entry point, because a page has no Request object to read a bearer token
 * from.
 *
 * Three gates, in order:
 *
 *   1. Signed in at all. If not, the Super Admin sign-in page — the one redirect that says nothing
 *      about whether /admin exists for this person.
 *   2. Internal staff. A signed-in user who is not gets a 404, not a redirect and not a 403. The
 *      existence of an internal admin surface is not something a tenant's session needs confirmed.
 *   3. A console session for the portal their role belongs to (./console-session.ts). Staff who
 *      are signed in to the dashboard but did not come in through /admin/login or /staff/login are
 *      sent there to prove it.
 */

export type PlatformSession = {
  userId: string;
  email: string | null;
  role: PlatformRole;
  permissions: ReadonlySet<PlatformPermission>;
  via: 'roster' | 'bootstrap';
  /** The portal this session was opened through. */
  portal: ConsolePortal;
  /** When the console session lapses and the portal asks for the password again. */
  consoleExpiresAt: string;
  /** Service-role client. BYPASSES RLS; only reachable after the gates above have passed. */
  supabase: AssistigoSupabaseClient;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

/** The caller's platform identity: roster row first, then the `ADMIN_EMAILS` bootstrap. */
export async function resolveStaffIdentity(
  supabase: AssistigoSupabaseClient,
  user: AuthUserLike,
): Promise<PlatformIdentity> {
  const roster = await loadRosterEntry(supabase, user.id);
  return resolvePlatformIdentity({
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    roster: roster ? { role: roster.role, isActive: roster.is_active } : null,
    adminEmails: parseAdminEmails(serverEnv().ADMIN_EMAILS),
  });
}

/** The console session cookie, if it is valid for this user at this portal. */
export async function readConsoleSession(
  userId: string,
  portal: ConsolePortal,
): Promise<ConsoleSessionPayload | null> {
  const store = await cookies();
  const check = verifyConsoleSession(
    consoleSigningKey(),
    store.get(CONSOLE_SESSION_COOKIE)?.value,
    {
      userId,
      portal,
    },
  );
  return check.valid ? check.payload : null;
}

/** Mints the console session after a successful portal sign-in. Server actions only. */
export async function startConsoleSession(
  userId: string,
  portal: ConsolePortal,
): Promise<ConsoleSessionPayload> {
  const { token, payload } = mintConsoleSession(consoleSigningKey(), { userId, portal });
  const store = await cookies();
  store.set(CONSOLE_SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure wherever the app is served over TLS; plain-http localhost would otherwise drop it.
    secure: publicEnv().NEXT_PUBLIC_APP_URL.startsWith('https://'),
    sameSite: 'lax',
    // `/` rather than `/admin`: the console's own route handlers under /api/admin read it too.
    path: '/',
    maxAge: CONSOLE_SESSION_TTL_SECONDS,
  });
  return payload;
}

export async function endConsoleSession(): Promise<void> {
  const store = await cookies();
  store.delete(CONSOLE_SESSION_COOKIE);
}

export async function requirePlatformSession(): Promise<PlatformSession> {
  const userClient = await createSupabaseServerClient();
  const { data, error } = await userClient.auth.getUser();

  if (error || !data.user) redirect(CONSOLE_PORTAL_PATHS.super_admin);

  const supabase = createSupabaseAdminClient();
  const identity = await resolveStaffIdentity(supabase, data.user);

  if (!identity.granted) renderNotFound();

  const portal = consolePortalFor(identity.role);
  const consoleSession = await readConsoleSession(data.user.id, portal);
  if (!consoleSession) redirect(`${CONSOLE_PORTAL_PATHS[portal]}?reason=reauth`);

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    role: identity.role,
    permissions: platformPermissionsFor(identity.role),
    via: identity.via,
    portal,
    consoleExpiresAt: new Date(consoleSession.exp * 1000).toISOString(),
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

export type ConsoleLoginState = {
  /** Who this browser is signed in as, so the page can offer "continue as" rather than a blank form. */
  signedInEmail: string | null;
  /** Already holding a console session for this portal: the page should just open the console. */
  alreadyInConsole: boolean;
};

/**
 * What a portal sign-in page needs to know before it renders.
 *
 * `alreadyInConsole` requires everything `requirePlatformSession()` will check — a granted
 * identity whose role belongs to this portal *and* a valid console session — so a page that
 * redirects on it can never bounce back and forth with the console.
 */
export async function getConsoleLoginState(portal: ConsolePortal): Promise<ConsoleLoginState> {
  const userClient = await createSupabaseServerClient();
  const { data } = await userClient.auth.getUser();
  if (!data.user) return { signedInEmail: null, alreadyInConsole: false };

  const signedInEmail = data.user.email ?? null;
  const consoleSession = await readConsoleSession(data.user.id, portal);
  if (!consoleSession) return { signedInEmail, alreadyInConsole: false };

  const identity = await resolveStaffIdentity(createSupabaseAdminClient(), data.user);
  const alreadyInConsole = identity.granted && consolePortalFor(identity.role) === portal;
  return { signedInEmail, alreadyInConsole };
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
