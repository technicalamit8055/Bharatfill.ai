'use client';

import { useActionState } from 'react';
import {
  CONSOLE_PORTAL_PATHS,
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  consolePortalFor,
  type PlatformRole,
} from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import {
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminField,
  AdminInput,
  AdminNote,
  AdminSelect,
  AdminTable,
  TD,
  TH,
} from '../ui';
import {
  changeRoleAction,
  grantAdminAction,
  setActiveAction,
  type TeamActionState,
} from './actions';

export type TeamMember = {
  id: string;
  userId: string;
  email: string;
  role: PlatformRole;
  isActive: boolean;
  createdAt: string;
};

export function GrantForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    grantAdminAction,
    {},
  );

  return (
    <AdminCard
      className="scroll-mt-20"
      title={t('admin.team.grantTitle')}
      description={t('admin.team.grantSubtitle')}
    >
      <span id="grant" />
      {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
      {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <AdminField label={t('admin.team.email')} className="min-w-[260px] flex-1">
          <AdminInput name="email" type="email" required placeholder="name@bharatfill.in" />
        </AdminField>

        <AdminField label={t('admin.team.role')} className="min-w-[200px]">
          <AdminSelect name="role" defaultValue="support_admin">
            {PLATFORM_ROLES.map((role) => (
              <option key={role} value={role}>
                {PLATFORM_ROLE_LABELS[role].en}
              </option>
            ))}
          </AdminSelect>
        </AdminField>

        <AdminButton type="submit" variant="primary" disabled={pending}>
          {pending ? t('common.saving') : t('admin.team.grant')}
        </AdminButton>
      </form>

      <p className="mt-3 text-xs text-slate-600">{t('admin.team.grantNote')}</p>
    </AdminCard>
  );
}

function MemberRow({ member, canManage }: { member: TeamMember; canManage: boolean }) {
  const t = useTranslations();
  const [roleState, roleAction, rolePending] = useActionState<TeamActionState, FormData>(
    changeRoleAction,
    {},
  );
  const [activeState, activeAction, activePending] = useActionState<TeamActionState, FormData>(
    setActiveAction,
    {},
  );

  const error = roleState.error || activeState.error;

  return (
    <tr className="transition-colors hover:bg-slate-900/60">
      <TD>
        <div className="flex items-center gap-3">
          <AdminAvatar label={member.email} />
          <div className="min-w-0">
            <div className="truncate text-slate-100">{member.email}</div>
            <div className="font-mono text-xs text-slate-600">{member.userId.slice(0, 8)}…</div>
          </div>
        </div>
      </TD>
      <TD>
        {canManage ? (
          <form action={roleAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={member.id} />
            <AdminSelect
              name="role"
              defaultValue={member.role}
              disabled={rolePending}
              className="w-44"
            >
              {PLATFORM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PLATFORM_ROLE_LABELS[role].en}
                </option>
              ))}
            </AdminSelect>
            <AdminButton type="submit" variant="ghost" disabled={rolePending}>
              {t('common.save')}
            </AdminButton>
          </form>
        ) : (
          PLATFORM_ROLE_LABELS[member.role].en
        )}
      </TD>
      <TD>
        <span className="font-mono text-xs text-slate-400">
          {CONSOLE_PORTAL_PATHS[consolePortalFor(member.role)]}
        </span>
      </TD>
      <TD>
        {member.isActive ? (
          <AdminBadge tone="success" dot>
            {t('admin.team.active')}
          </AdminBadge>
        ) : (
          <AdminBadge tone="neutral" dot>
            {t('admin.team.revokedBadge')}
          </AdminBadge>
        )}
        {error ? <div className="mt-1 text-xs text-rose-400">{t(error)}</div> : null}
      </TD>
      <TD className="text-xs text-slate-500">{member.createdAt}</TD>
      <TD className="text-right">
        {canManage ? (
          <form action={activeAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="active" value={member.isActive ? 'false' : 'true'} />
            <AdminButton
              type="submit"
              variant={member.isActive ? 'ghost' : 'secondary'}
              disabled={activePending}
            >
              {member.isActive ? t('admin.team.revoke') : t('admin.team.reactivate')}
            </AdminButton>
          </form>
        ) : null}
      </TD>
    </tr>
  );
}

export function TeamTable({
  members,
  canManage,
}: {
  members: TeamMember[];
  canManage: boolean;
}) {
  const t = useTranslations();

  return (
    <AdminCard flush title={t('admin.team.rosterTitle')} description={t('admin.team.rosterSubtitle')}>
      <AdminTable
        minWidth={820}
        head={
          <tr>
            <TH>{t('admin.team.email')}</TH>
            <TH>{t('admin.team.role')}</TH>
            <TH>{t('admin.team.signsInAt')}</TH>
            <TH>{t('admin.team.status')}</TH>
            <TH>{t('admin.team.added')}</TH>
            <TH />
          </tr>
        }
        empty={
          members.length === 0 ? (
            <AdminEmpty
              title={t('admin.team.empty')}
              description={t('admin.team.emptyHelp')}
            />
          ) : undefined
        }
      >
        {members.map((member) => (
          <MemberRow key={member.id} member={member} canManage={canManage} />
        ))}
      </AdminTable>
    </AdminCard>
  );
}
