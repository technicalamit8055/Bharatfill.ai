'use client';

import { useActionState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { AdminButton } from '../ui';
import { copyBuiltInSchemeAction, type SchemeActionState } from './actions';

/**
 * Turns a built-in into an editable draft row, then opens it. That row is where a logo, a date
 * or a correction for the built-in goes; tenants keep the built-in until the draft is published.
 */
export function CopyBuiltInButton({ slug }: { slug: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<SchemeActionState, FormData>(
    copyBuiltInSchemeAction,
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <AdminButton type="submit" variant="ghost" disabled={pending} className="px-2 py-1 text-xs">
        {pending ? t('common.saving') : t('admin.schemes.copyBuiltIn')}
      </AdminButton>
      {state.error ? <span className="text-xs text-rose-400">{t(state.error)}</span> : null}
    </form>
  );
}
