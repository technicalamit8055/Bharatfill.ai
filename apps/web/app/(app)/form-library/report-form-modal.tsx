'use client';

import { useState, type FormEvent } from 'react';
import { Flag } from 'lucide-react';
import { Alert, Button, Card, TextField, Textarea, Field } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

export function ReportFormModal() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const portalUrl = String(form.get('portalUrl') ?? '').trim();
    const formName = String(form.get('formName') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();

    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/form-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageOrigin: portalUrl,
          pageTitle: formName || undefined,
          note: notes || undefined,
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { messageKey: string };
        } | null;
        setError(json?.error?.messageKey ?? 'errors.internal');
        return;
      }
      setDone(true);
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-5 text-sm font-semibold text-brand-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Flag size={18} strokeWidth={2} aria-hidden className="fill-brand-600 text-brand-600" />
        {t('formLibrary.reportUnsupported')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <Card
        title={t('formLibrary.reportModal.title')}
        className="w-full max-w-md"
        actions={
          <button
            type="button"
            aria-label={t('common.cancel')}
            className="text-slate-400 hover:text-slate-700"
            onClick={() => {
              setOpen(false);
              setDone(false);
              setError(null);
            }}
          >
            ✕
          </button>
        }
      >
        {done ? (
          <Alert tone="success">{t('formLibrary.reportModal.submitted')}</Alert>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-slate-600">{t('formLibrary.reportModal.help')}</p>
            {error ? <Alert tone="danger">{t(error)}</Alert> : null}
            <TextField
              name="portalUrl"
              type="url"
              required
              label={t('formLibrary.reportModal.portalUrl')}
            />
            <TextField name="formName" label={t('formLibrary.reportModal.formName')} />
            <Field label={t('formLibrary.reportModal.notes')}>
              <Textarea
                name="notes"
                placeholder={t('formLibrary.reportModal.notesPlaceholder')}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('formLibrary.reportModal.cancel')}
              </Button>
              <Button type="submit" loading={pending}>
                {t('formLibrary.reportModal.submit')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
