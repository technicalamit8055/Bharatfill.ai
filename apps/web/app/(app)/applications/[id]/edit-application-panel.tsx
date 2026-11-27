'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Select, TextField, Textarea } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { APPLICATION_CATEGORIES } from '@/lib/applications/schema';
import type { ApplicationRow } from '@/lib/supabase/database.types';

export function EditApplicationPanel({ application }: { application: ApplicationRow }) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => {
      const value = String(form.get(key) ?? '').trim();
      return value === '' ? null : value;
    };

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? '').trim(),
          category: String(form.get('category') ?? application.category),
          portalName: optional('portalName'),
          formName: optional('formName'),
          portalUrl: optional('portalUrl'),
          portalReferenceNumber: optional('portalReferenceNumber'),
          deadlineAt: optional('deadlineAt'),
          notes: optional('notes'),
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { messageKey: string };
        } | null;
        setError(json?.error?.messageKey ?? 'errors.internal');
        setPending(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          {t('applications.detail.edit')}
        </Button>
      </div>
    );
  }

  return (
    <Card title={t('applications.detail.edit')}>
      <form className="space-y-4" onSubmit={submit}>
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}
        <TextField
          name="title"
          required
          label={t('applications.form.titleLabel')}
          defaultValue={application.title}
        />
        <Field label={t('applications.form.category')}>
          <Select name="category" defaultValue={application.category}>
            {APPLICATION_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {t(`applications.categories.${option}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="portalName"
            label={t('applications.form.portalName')}
            defaultValue={application.portal_name ?? ''}
          />
          <TextField
            name="formName"
            label={t('applications.form.formName')}
            defaultValue={application.form_name ?? ''}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="portalUrl"
            type="url"
            label={t('applications.form.portalUrl')}
            defaultValue={application.portal_url ?? ''}
          />
          <TextField
            name="portalReferenceNumber"
            label={t('applications.detail.referenceNumber')}
            defaultValue={application.portal_reference_number ?? ''}
          />
        </div>
        {/* Fees and payments live in the bill card, where the khata keeps them consistent. */}
        <TextField
          name="deadlineAt"
          type="date"
          label={t('applications.form.deadline')}
          defaultValue={application.deadline_at?.slice(0, 10) ?? ''}
        />
        <Field label={t('applications.form.notes')}>
          <Textarea name="notes" defaultValue={application.notes ?? ''} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={pending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
