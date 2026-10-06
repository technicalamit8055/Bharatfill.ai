'use client';

import { useActionState, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Alert, Button } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { revokeOtherSessionsAction, revokeSessionAction, type SessionsState } from './actions';

function Outcome({ state }: { state: SessionsState }) {
  const t = useTranslations();
  if (state.error) {
    return (
      <Alert tone="danger" className="px-2 py-1 text-xs">
        {t(state.error)}
      </Alert>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="text-xs text-slate-500">
        {t(state.notice)}
      </p>
    );
  }
  return null;
}

/** Signs one other session out. `label` names the device for screen readers. */
export function RevokeSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<SessionsState, FormData>(
    revokeSessionAction,
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <Outcome state={state} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="secondary" size="sm" loading={pending} aria-label={label}>
        <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('settings.sessions.revoke')}
      </Button>
    </form>
  );
}

/**
 * "Sign out everywhere else". Asks once before acting, because it also disconnects every
 * extension paired from those browsers and cannot be undone from here.
 */
export function RevokeOthersButton({ count }: { count: number }) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<SessionsState, FormData>(
    revokeOtherSessionsAction,
    {},
  );

  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        <Outcome state={state} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => setConfirming(true)}
        >
          {t('settings.sessions.revokeOthers')}
        </Button>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setConfirming(false);
        action(formData);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs text-slate-600">
        {t('settings.sessions.revokeOthersConfirm', { count })}
      </span>
      <Button type="submit" variant="danger" size="sm" loading={pending}>
        {t('settings.sessions.revokeOthersYes')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t('common.cancel')}
      </Button>
    </form>
  );
}
