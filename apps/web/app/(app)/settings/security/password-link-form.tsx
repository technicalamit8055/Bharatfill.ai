'use client';

import { useActionState } from 'react';
import { Alert, Button } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { sendPasswordLinkAction, type PasswordLinkState } from './actions';

export function PasswordLinkForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PasswordLinkState, FormData>(
    sendPasswordLinkAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="danger">{t(state.error)}</Alert> : null}
      {state.notice ? <Alert tone="success">{t(state.notice)}</Alert> : null}
      <Button type="submit" loading={pending} disabled={Boolean(state.notice)}>
        {t('settings.securityPage.sendLink')}
      </Button>
    </form>
  );
}
