'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PLATFORM_ROLES, type PlatformRole } from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { canDemotePlatformAdmin } from '@/lib/admin/authorize';
import { logger } from '@/lib/api/logger';
import type { PlatformAdminRow } from '@/lib/supabase/database.types';

/**
 * Managing the internal staff roster.
 *
 * `platform.team.manage` is Super Admin only. Everything here changes who can change the platform,
 * so every action writes a `critical` audit entry and the guard against removing the last super
 * admin is enforced server-side rather than by hiding a button.
 */

export type TeamActionState = { error?: string; notice?: string };

const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email('validation.email_invalid'),
  role: z.enum(PLATFORM_ROLES),
});

const changeSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(PLATFORM_ROLES),
});

/** Active super admins, for the last-one-out guard. */
async function countActiveSuperAdmins(
  supabase: Awaited<ReturnType<typeof requirePlatformSession>>['supabase'],
): Promise<number> {
  const { count } = await supabase
    .from('platform_admins')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .eq('is_active', true);
  return count ?? 0;
}

/**
 * Grants panel access to an existing Bharatfill account.
 *
 * The person must already have signed up: this creates a roster row against an `auth.users` id,
 * it does not create an account. Inviting somebody who has never signed in would mean minting a
 * platform-privileged identity from an email address, which is a bigger decision than this screen
 * should be able to make.
 */
export async function grantAdminAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.team.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = grantSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  // `listUsers` is paged and has no server-side email filter in supabase-js, so this walks pages
  // until it finds a match. Fine for an internal roster of tens of people; if the user base makes
  // it slow, the fix is an RPC that looks the address up in one query, not a bigger page size.
  const target = await findUserByEmail(session.supabase, parsed.data.email);
  if (!target) return { error: 'admin.team.userNotFound' };

  const { error } = await session.supabase.from('platform_admins').upsert(
    {
      user_id: target.id,
      role: parsed.data.role,
      email: parsed.data.email,
      is_active: true,
      granted_by: session.userId,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    logger.error('platform.grant_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.admin_granted',
    entityType: 'platform_admin',
    entityId: target.id,
    // The address is deliberately not in metadata: `redact()` drops `email` keys anyway, and the
    // user id is the durable identifier an investigation actually needs.
    metadata: { role: parsed.data.role },
  });

  revalidatePath('/admin/team');
  return { notice: 'admin.team.granted' };
}

export async function changeRoleAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.team.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = changeSchema.safeParse({
    id: formData.get('id'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: 'errors.validation_failed' };

  const guard = await assertNotLastSuperAdmin(session, parsed.data.id, parsed.data.role);
  if (guard) return guard;

  const { error } = await session.supabase
    .from('platform_admins')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('platform.role_change_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.admin_role_changed',
    entityType: 'platform_admin',
    entityId: parsed.data.id,
    metadata: { role: parsed.data.role },
  });

  revalidatePath('/admin/team');
  return { notice: 'admin.team.roleChanged' };
}

export async function setActiveAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.team.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }
  const active = formData.get('active') === 'true';

  if (!active) {
    const guard = await assertNotLastSuperAdmin(session, id, null);
    if (guard) return guard;
  }

  const { error } = await session.supabase
    .from('platform_admins')
    .update({ is_active: active })
    .eq('id', id);

  if (error) {
    logger.error('platform.set_active_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: active ? 'platform.admin_granted' : 'platform.admin_revoked',
    entityType: 'platform_admin',
    entityId: id,
    metadata: { active },
  });

  revalidatePath('/admin/team');
  return { notice: active ? 'admin.team.reactivated' : 'admin.team.revoked' };
}

/**
 * Refuses a change that would leave the platform with no active super admin.
 *
 * `nextRole` is the role being moved to, or `null` when the row is being deactivated. The rule
 * lives in lib/admin/authorize.ts so the page and this action cannot disagree about it.
 */
async function assertNotLastSuperAdmin(
  session: Awaited<ReturnType<typeof requirePlatformSession>>,
  rowId: string,
  nextRole: PlatformRole | null,
): Promise<TeamActionState | null> {
  const { data } = await session.supabase
    .from('platform_admins')
    .select('role, is_active')
    .eq('id', rowId)
    .maybeSingle();

  const target = data as Pick<PlatformAdminRow, 'role' | 'is_active'> | null;
  if (!target) return { error: 'admin.team.notFound' };

  // Moving one super admin to another super admin is not a demotion.
  if (nextRole === 'super_admin') return null;

  const allowed = canDemotePlatformAdmin({
    targetRole: target.role,
    targetIsActive: target.is_active,
    activeSuperAdminCount: await countActiveSuperAdmins(session.supabase),
  });

  return allowed ? null : { error: 'admin.team.lastSuperAdmin' };
}

type AuthUser = { id: string; email?: string };

async function findUserByEmail(
  supabase: Awaited<ReturnType<typeof requirePlatformSession>>['supabase'],
  email: string,
): Promise<AuthUser | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      logger.error('platform.list_users_failed', { code: error.status });
      return null;
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return { id: match.id, email: match.email };
    if (data.users.length < perPage) return null;
  }
  return null;
}
