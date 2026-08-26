'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Textarea } from '@assistigo/ui';
import {
  allowedTransitions,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONE,
  type ApplicationStatus,
} from '@assistigo/core';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { localised } from '@/lib/i18n';

export function StatusActions({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ApplicationStatus;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const router = useRouter();
  const [target, setTarget] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = allowedTransitions(status);
  if (options.length === 0) return null;

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target, note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { messageKey: string };
        } | null;
        setError(json?.error?.messageKey ?? 'errors.internal');
        setPending(false);
        return;
      }
      setTarget(null);
      setNote('');
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        {options.map((next) => (
          <Button
            key={next}
            size="sm"
            variant={APPLICATION_STATUS_TONE[next] === 'danger' ? 'danger' : 'secondary'}
            onClick={() => setTarget(next)}
          >
            {t('applications.detail.markAs', { status: localised(APPLICATION_STATUS_LABELS[next], locale) })}
          </Button>
        ))}
      </div>
      {target ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <Field label={t('applications.detail.statusNote')}>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('applications.detail.statusNotePlaceholder')}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => void confirm()}>
              {t('applications.detail.markAs', {
                status: localised(APPLICATION_STATUS_LABELS[target], locale),
              })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
