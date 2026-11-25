import { MailPlus, UsersRound } from 'lucide-react';
import { Badge, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { ORG_ROLE_LABELS, formatIndianDate, type OrgRole } from '@assistigo/core';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  OrganizationInvitationRow,
  OrganizationMemberRow,
} from '@/lib/supabase/database.types';
import { InviteForm } from './invite-form';
import { MemberRowActions } from './member-row-actions';

export const metadata = { title: 'Members' };

export default async function MembersPage() {
  const session = await requirePagePermission('member.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const [membersResult, invitesResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', session.organization.id)
      .order('created_at', { ascending: true }),
    session.permissions.has('member.invite')
      ? supabase
          .from('organization_invitations')
          .select('*')
          .eq('organization_id', session.organization.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const members = (membersResult.data ?? []) as OrganizationMemberRow[];
  const invitations = (invitesResult.data ?? []) as OrganizationInvitationRow[];

  const canManage = session.permissions.has('member.change_role');

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        section="members"
        title={t('settings.membersTitle')}
        subtitle={t('settings.membersSubtitle')}
      />

      {session.permissions.has('member.invite') ? <InviteForm actorRole={session.role} /> : null}

      <SettingsCard
        icon={<UsersRound className="h-5 w-5" aria-hidden />}
        title={t('settings.members')}
      >
        <Table>
          <THead>
            <TR>
              <TH>{t('settings.member')}</TH>
              <TH>{t('settings.role')}</TH>
              <TH>{t('settings.status')}</TH>
              <TH>{t('settings.joined')}</TH>
              {canManage ? <TH className="text-right">{t('common.edit')}</TH> : null}
            </TR>
          </THead>
          <TBody>
            {members.map((member) => (
              <TR key={member.id}>
                <TD>
                  <span className="font-mono text-xs text-slate-600">
                    {member.user_id.slice(0, 8)}
                  </span>
                  {member.user_id === session.userId ? (
                    <Badge tone="info" className="ml-2">
                      {t('settings.youBadge')}
                    </Badge>
                  ) : null}
                </TD>
                <TD>
                  <span title={t(`roles.descriptions.${member.role}`)}>
                    {localised(ORG_ROLE_LABELS[member.role as OrgRole], locale)}
                  </span>
                </TD>
                <TD>
                  <Badge tone={member.status === 'active' ? 'success' : 'warning'}>
                    {t(`settings.memberStatus.${member.status}`)}
                  </Badge>
                </TD>
                <TD className="text-slate-500">
                  {formatIndianDate(member.created_at.slice(0, 10)) ?? '—'}
                </TD>
                {canManage ? (
                  <TD className="text-right">
                    <MemberRowActions
                      memberId={member.id}
                      currentRole={member.role as OrgRole}
                      actorRole={session.role}
                      isSelf={member.user_id === session.userId}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </SettingsCard>

      {invitations.length > 0 ? (
        <SettingsCard
          icon={<MailPlus className="h-5 w-5" aria-hidden />}
          title={t('settings.pendingInvites')}
        >
          <Table>
            <THead>
              <TR>
                <TH>{t('settings.inviteEmail')}</TH>
                <TH>{t('settings.role')}</TH>
                <TH>{t('settings.expires')}</TH>
              </TR>
            </THead>
            <TBody>
              {invitations.map((invitation) => (
                <TR key={invitation.id}>
                  <TD>{invitation.email}</TD>
                  <TD>{localised(ORG_ROLE_LABELS[invitation.role as OrgRole], locale)}</TD>
                  <TD className="text-slate-500">
                    {formatIndianDate(invitation.expires_at.slice(0, 10)) ?? '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </SettingsCard>
      ) : null}
    </div>
  );
}
