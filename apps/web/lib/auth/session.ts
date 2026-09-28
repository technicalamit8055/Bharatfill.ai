import 'server-only';

import { redirect } from 'next/navigation';
import { permissionsFor, type OrgRole, type Permission } from '@assistigo/core';
import { createSupabaseServerClient } from '../supabase/server';
import type {
  MembershipWithOrganization,
  OrganizationMemberRow,
  OrganizationRow,
} from '../supabase/database.types';

/**
 * Session helpers for Server Components.
 *
 * Route handlers use `resolveContext()` in lib/api/context.ts, which takes the incoming
 * Request. Pages have no Request object, so they use these instead — same rules, same RLS.
 */

export type PageSession = {
  userId: string;
  email: string | null;
  /**
   * What the header calls this person. Nothing in our schema stores a name — sign-up asks for
   * an email only — so this is the name an identity provider supplied, else the email's local
   * part. Display only; never used to identify anyone.
   */
  displayName: string;
  organization: OrganizationRow;
  membership: OrganizationMemberRow;
  role: OrgRole;
  permissions: ReadonlySet<Permission>;
};

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** The caller's active memberships, most recent first. */
export async function getMemberships() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as MembershipWithOrganization[];
}

/** Provider-supplied name if there is a usable one, else the part of the email before the @. */
function displayNameFor(metadata: unknown, email: string | undefined): string {
  const fields = (metadata ?? {}) as Record<string, unknown>;
  for (const key of ['full_name', 'name']) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return email?.split('@')[0] || 'Operator';
}

/**
 * Requires a signed-in user who belongs to an organization.
 * Redirects to sign-in or onboarding rather than throwing, because this runs during render.
 */
export async function requireSession(): Promise<PageSession> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const memberships = await getMemberships();
  const active = memberships[0];
  if (!active?.organizations) redirect('/onboarding');

  // Suspended by platform staff (0030). Not a redirect to onboarding — the membership is real and
  // the data is intact — but the dashboard does not act for the centre until it is reactivated.
  if (active.organizations.suspended_at) redirect('/suspended');

  const { organizations, ...membership } = active;
  const role = membership.role as OrgRole;

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: displayNameFor(user.user_metadata, user.email),
    organization: organizations,
    membership: membership as OrganizationMemberRow,
    role,
    permissions: permissionsFor(role),
  };
}

/**
 * Page-level permission gate. The UI also hides what a role cannot do, but a user who types
 * the URL directly must land somewhere sensible rather than on a half-rendered page.
 */
export async function requirePagePermission(permission: Permission): Promise<PageSession> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) redirect('/dashboard?denied=1');
  return session;
}
