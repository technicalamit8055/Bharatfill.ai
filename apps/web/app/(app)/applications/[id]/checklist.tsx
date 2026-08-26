'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Select, Table, TBody, TD, TH, THead, TR, TextField } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import type { ApplicationDocumentStatus } from '@assistigo/core';
import type { ApplicationDocumentRow } from '@/lib/supabase/database.types';

const STATUS_TONE: Record<ApplicationDocumentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  required: 'neutral',
  attached: 'success',
  missing: 'warning',
  rejected: 'danger',
};

const DOCUMENT_STATUSES: ApplicationDocumentStatus[] = ['required', 'attached', 'missing', 'rejected'];

function StatusCell({
  applicationId,
  document,
}: {
  applicationId: string;
  document: ApplicationDocumentRow;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function updateStatus(status: ApplicationDocumentStatus) {
    setPending(true);
    try {
      await fetch(`/api/applications/${applicationId}/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select
      value={document.status}
      disabled={pending}
      onChange={(event) => void updateStatus(event.target.value as ApplicationDocumentStatus)}
      className="h-8 w-auto py-0 text-xs"
    >
      {DOCUMENT_STATUSES.map((status) => (
        <option key={status} value={status}>
          {t(`applications.documentStatus.${status}`)}
        </option>
      ))}
    </Select>
  );
}

export function Checklist({
  applicationId,
  documents,
  canUpdate,
}: {
  applicationId: string;
  documents: ApplicationDocumentRow[];
  canUpdate: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requirementKey = String(form.get('requirementKey') ?? '').trim();
    const requirementLabel = String(form.get('requirementLabel') ?? '').trim();
    if (!requirementKey) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requirementKey,
          requirementLabel: requirementLabel || undefined,
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { messageKey: string };
        } | null;
        setError(json?.error?.messageKey ?? 'errors.internal');
        return;
      }
      setAdding(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title={t('applications.detail.checklist')}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/document-tools" className="text-sm text-brand-700 hover:underline">
            {t('applications.detail.openInDocumentTools')}
          </Link>
          {canUpdate && !adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              {t('applications.detail.addRequirement')}
            </Button>
          ) : null}
        </div>
      }
    >
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}

      {adding ? (
        <form onSubmit={addRequirement} className="mb-4 flex flex-wrap items-end gap-2">
          <TextField name="requirementKey" required label={t('applications.detail.requirementKey')} />
          <TextField name="requirementLabel" label={t('applications.detail.requirementLabel')} />
          <Button type="submit" size="sm" loading={pending}>
            {t('common.save')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-sm text-slate-500">{t('applications.detail.checklistEmpty')}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('applications.detail.requirementLabel')}</TH>
              <TH>{t('settings.status')}</TH>
            </TR>
          </THead>
          <TBody>
            {documents.map((document) => (
              <TR key={document.id}>
                <TD>
                  <p className="text-slate-800">{document.requirement_label ?? document.requirement_key}</p>
                  <p className="font-mono text-xs text-slate-400">{document.requirement_key}</p>
                </TD>
                <TD>
                  {canUpdate ? (
                    <StatusCell applicationId={applicationId} document={document} />
                  ) : (
                    <Badge tone={STATUS_TONE[document.status]}>
                      {t(`applications.documentStatus.${document.status}`)}
                    </Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
