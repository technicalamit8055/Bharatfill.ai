'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

export function CreateApplicationButton({
  fillSessionId,
  defaultTitle,
}: {
  fillSessionId: string;
  defaultTitle: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/fill-sessions/${fillSessionId}/create-application`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: defaultTitle }),
      });
      const json = (await response.json()) as
        | { data: { application: { id: string } } }
        | { error: { messageKey: string } };
      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }
      router.push(`/applications/${json.data.application.id}`);
    } catch {
      setError('errors.internal');
      setPending(false);
    }
  }

  return (
    <div>
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}
      <Button size="sm" variant="secondary" loading={pending} onClick={() => void create()}>
        {t('fillSessions.detail.convertToApplication')}
      </Button>
    </div>
  );
}
