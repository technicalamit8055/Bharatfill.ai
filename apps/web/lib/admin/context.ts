import 'server-only';

import {
  assertPlatformCan,
  consolePortalFor,
  platformPermissionsFor,
  unauthenticated,
  notFound,
  type ConsolePortal,
  type PlatformPermission,
  type PlatformRole,
} from '@assistigo/core';
import { serverEnv } from '../env';
import { resolveUser } from '../api/context';
import { createSupabaseAdminClient, type AssistigoSupabaseClient } from '../supabase/server';
import type { PlatformAdminRow } from '../supabase/database.types';
import { parseAdminEmails, resolvePlatformIdentity } from './authorize';
import {
  CONSOLE_SESSION_COOKIE,
  deriveConsoleKey,
  readCookie,
  verifyConsoleSession,
} from './console-session';

/**
 * Request context for `/api/admin/*`.
 *
 * Two clients, and the distinction matters:
 *
 *   `supabase` is the SERVICE-ROLE client and bypasses RLS. It is how the panel reads the tenant
 *   aggregates and writes global catalogue rows, none of which any user JWT is permitted to
 *   touch. docs/SECURITY.md §2 lists who may hold it, and this is the fourth entry after the job
 *   worker, the billing webhook and the seed script.
 *
 *   `userSupabase` is the caller's own client, still subject to RLS. Anything that could be done
 *   as the user should be done through it.
 *
 * Holding the service role means authorization has already happened *here*: `resolvePlatformContext`
 * verifies the JWT against the auth server, looks the caller up in `platform_admins`, and throws
 * before either client is handed out. A handler that forgets `requirePlatformPermission` is still
 * a bug — but it is a bug behind a closed door, not an open one.
 */

export type PlatformContext = {
  /** Service-role client. BYPASSES RLS — see the note above. */
  supabase: AssistigoSupabaseClient;
  /** The caller's own client, still under RLS. */
  userSupabase: AssistigoSupabaseClient;
  userId: string;
  email: string | null;
  role: PlatformRole;
  permissions: ReadonlySet<PlatformPermission>;
  /** How access was granted. `bootstrap` means ADMIN_EMAILS, not a roster row. */
  via: 'roster' | 'bootstrap';
  /** The console portal the caller's session was opened through. */
  portal: ConsolePortal;
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * Looks the caller up on the internal staff roster.
 *
 * Read with the service role rather than the caller's client: `platform_admins` only lets a user
 * select their own row, which would work, but this path also has to count super admins and read
 * other people's rows for the team screen. One code path, one client, no policy-dependent
 * branching.
 */
export async function loadRosterEntry(
  supabase: AssistigoSupabaseClient,
  userId: string,
): Promise<Pick<PlatformAdminRow, 'role' | 'is_active'> | null> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Pick<PlatformAdminRow, 'role' | 'is_active'> | null) ?? null;
}

/**
 * Resolves the caller as internal staff, or throws.
 *
 * Throws `notFound()` rather than `permissionDenied()` when the caller is a legitimate but
 * non-staff user. The existence of an internal admin surface is not something a tenant's session
 * needs confirmed, and a 403 confirms it.
 */
export async function resolvePlatformContext(request: Request): Promise<PlatformContext> {
  const auth = await resolveUser(request);

  // The extension has no business here. It authenticates with a long-lived bearer token scoped to
  // form filling, and nothing in the admin panel is part of that job.
  if (auth.actorType !== 'user') throw notFound('errors.not_found');

  const supabase = createSupabaseAdminClient();
  const roster = await loadRosterEntry(supabase, auth.userId);

  // Confirmation only matters on the bootstrap path, and establishing it costs a round trip to
  // the auth admin API. A roster row settles the question without it, which is the common case on
  // every admin request once a deployment has a real team.
  const needsConfirmation = roster === null;

  const identity = resolvePlatformIdentity({
    email: auth.email,
    emailConfirmed: needsConfirmation ? await isEmailConfirmed(supabase, auth.userId) : false,
    roster: roster ? { role: roster.role, isActive: roster.is_active } : null,
    adminEmails: parseAdminEmails(serverEnv().ADMIN_EMAILS),
  });

  if (!identity.granted) throw notFound('errors.not_found');

  // Staff, but did this browser come in through the console's front door? Same check as the pages
  // (lib/admin/session.ts). 401 rather than 404: the caller is already known to be staff.
  const portal = consolePortalFor(identity.role);
  const consoleSession = verifyConsoleSession(
    consoleSigningKey(),
    readCookie(request.headers.get('cookie'), CONSOLE_SESSION_COOKIE),
    { userId: auth.userId, portal },
  );
  if (!consoleSession.valid) throw unauthenticated('errors.console_session_required');

  return {
    supabase,
    userSupabase: auth.supabase,
    userId: auth.userId,
    email: auth.email,
    role: identity.role,
    permissions: platformPermissionsFor(identity.role),
    via: identity.via,
    portal,
    ipAddress: auth.ipAddress,
    userAgent: auth.userAgent,
  };
}

let cachedConsoleKey: Buffer | null = null;

/**
 * The key console session tokens are signed with (./console-session.ts), derived once from the
 * service-role key.
 */
export function consoleSigningKey(): Buffer {
  cachedConsoleKey ??= deriveConsoleKey(serverEnv().SUPABASE_SERVICE_ROLE_KEY);
  return cachedConsoleKey;
}

/**
 * Whether Supabase has confirmed this address.
 *
 * Only consulted on the bootstrap path, where it is the difference between "the owner of this
 * mailbox" and "whoever signed up with that address first".
 */
async function isEmailConfirmed(
  supabase: AssistigoSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return Boolean(data.user.email_confirmed_at);
}

/**
 * Server-side authorization gate for admin handlers. Hiding a nav item is not authorization
 * (docs/DEVELOPMENT_RULES.md §4), and neither is the fact that /admin is hard to guess.
 */
export function requirePlatformPermission(
  context: PlatformContext,
  permission: PlatformPermission,
): void {
  assertPlatformCan(context.role, permission);
}

export function hasPlatformPermission(
  context: PlatformContext,
  permission: PlatformPermission,
): boolean {
  return context.permissions.has(permission);
}

/** Re-exported so admin handlers do not reach past this module for the 401 case. */
export { unauthenticated };
