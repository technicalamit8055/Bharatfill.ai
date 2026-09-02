import { formatIndianDate, isPlatformRole } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { parseAdminEmails } from '@/lib/admin/authorize';
import { serverEnv } from '@/lib/env';
import { getTranslations } from '@/lib/i18n/server';
import type { PlatformAdminRow } from '@/lib/supabase/database.types';
import { AdminNote, AdminPageHeader } from '../ui';
import { GrantForm, TeamTable, type TeamMember } from './team-panel';

export const metadata = { title: 'Team' };

/**
 * The internal staff roster.
 *
 * Readable by anyone with `platform.team.view` (Super Admin only today), writable with
 * `platform.team.manage`. Two permissions rather than one because "who has access?" is a question
 * a future auditor role should be able to answer without also being able to change the answer.
 */
export default async function AdminTeamPage() {
  const session = await requirePlatformPagePermission('platform.team.view');
  const { t } = await getTranslations();

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

  return (
    <>
      <AdminPageHeader title={t('admin.team.title')} description={t('admin.team.subtitle')} />

      <AdminNote>{t('admin.team.privacyNote')}</AdminNote>

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

      {canManage ? <GrantForm /> : null}

      <TeamTable members={members} canManage={canManage} />
    </>
  );
}
