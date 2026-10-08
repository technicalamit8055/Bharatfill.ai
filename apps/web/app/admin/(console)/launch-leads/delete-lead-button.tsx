'use client';

import { useActionState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { AdminButton } from '../ui';
import { deleteLaunchLeadAction, type LaunchLeadActionState } from './actions';

/** Removes one lead, after a confirm: there is no undo, and the number is not kept anywhere else. */
export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<LaunchLeadActionState, FormData>(
    deleteLaunchLeadAction,
    {},
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t('admin.launchLeads.confirmDelete'))) event.preventDefault();
      }}
      className="flex items-center justify-end gap-2"
    >
      {state.error ? <span className="text-xs text-rose-400">{t(state.error)}</span> : null}
      <input type="hidden" name="id" value={leadId} />
      <AdminButton type="submit" variant="ghost" disabled={pending}>
        {t('admin.launchLeads.delete')}
      </AdminButton>
    </form>
  );
}
