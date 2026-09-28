import { KeyRound, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import {
  CONSOLE_PORTAL_PATHS,
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_PERMISSIONS,
  consolePortalFor,
  formatIndianDate,
  isPlatformRole,
} from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { parseAdminEmails } from '@/lib/admin/authorize';
import { serverEnv } from '@/lib/env';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import type { PlatformAdminRow } from '@/lib/supabase/database.types';
import { AdminBadge, AdminCard, AdminNote, AdminPageHeader } from '../ui';
import { GrantForm, TeamTable, type TeamMember } from './team-panel';

export const metadata = { title: 'Team' };

/**
 * The internal staff roster.
 *
 * Readable by anyone with `platform.team.view` (Super Admin only today), writable with
 * `platform.team.manage`. Two permissions rather than one because "who has access?" is a question
 * a future auditor role should be able to answer without also being able to change the answer.
 *
 * The role guide beside it is generated from PLATFORM_ROLE_PERMISSIONS and the portal rules, not
 * written by hand, so it cannot describe a role differently from how the server enforces it.
 */
export default async function AdminTeamPage() {
  const session = await requirePlatformPagePermission('platform.team.view');
  const { t, locale } = await getTranslations();

  const { data } = await session.supabase
    .from('platform_admins')
    .select('*')
    .order('created_at', { ascending: true });

  const members: TeamMember[] = ((data ?? []) as PlatformAdminRow[])
    .filter((row) => isPlatformRole(row.role))
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      createdAt: formatIndianDate(row.created_at) ?? '',
    }));

  const bootstrapEmails = [...parseAdminEmails(serverEnv().ADMIN_EMAILS)];
  const canManage = session.permissions.has('platform.team.manage');
  const activeCount = members.filter((member) => member.isActive).length;

  return (
    <>
      <AdminPageHeader
        icon={<Users />}
        title={t('admin.team.title')}
        description={t('admin.team.subtitle')}
        meta={
          <>
            <AdminBadge tone="success" dot>
              {t('admin.team.activeCount', { count: activeCount })}
            </AdminBadge>
            <AdminBadge>{t('admin.team.totalCount', { count: members.length })}</AdminBadge>
          </>
        }
      />

      {bootstrapEmails.length > 0 ? (
        // Worth showing: an address in ADMIN_EMAILS holds Super Admin without appearing in the
        // roster below, so a team page that listed only roster rows would be an incomplete answer
        // to "who can get in?".
        <AdminNote tone="warning">
          {t('admin.team.bootstrapWarning', { count: bootstrapEmails.length })}
          <ul className="mt-1 font-mono">
            {bootstrapEmails.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        </AdminNote>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {canManage ? <GrantForm /> : null}
          <TeamTable members={members} canManage={canManage} />
        </div>

        <AdminCard
          icon={<KeyRound />}
          title={t('admin.team.roleGuideTitle')}
          description={t('admin.team.roleGuideSubtitle')}
        >
          <ul className="space-y-4">
            {PLATFORM_ROLES.map((role) => {
              const portal = consolePortalFor(role);
              return (
                <li
                  key={role}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">
                      {localised(PLATFORM_ROLE_LABELS[role], locale)}
                    </span>
                    <AdminBadge tone={portal === 'super_admin' ? 'warning' : 'info'}>
                      {portal === 'super_admin' ? (
                        <LockKeyhole className="h-3 w-3" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                      {CONSOLE_PORTAL_PATHS[portal]}
                    </AdminBadge>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {t(`admin.team.roleGuide.${role}`)}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-600">
                    {t('admin.team.permissionCount', {
                      count: PLATFORM_ROLE_PERMISSIONS[role].length,
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      </div>

      <AdminNote>{t('admin.team.privacyNote')}</AdminNote>
    </>
  );
}
