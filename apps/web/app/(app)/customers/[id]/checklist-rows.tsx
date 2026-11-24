'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, cn, type Tone } from '@assistigo/ui';
import type { DocumentType } from '@assistigo/core';
import type { ChecklistItemState } from '@assistigo/form-engine';
import { useTranslations } from '@/lib/i18n/client';
import { OUTLINE_BUTTON } from './detail-card';
import { UploadDocumentPanel } from './upload-document-panel';

export type ChecklistRowView = {
  key: string;
  label: string;
  state: ChecklistItemState;
  stateLabel: string;
  help: string | null;
  /** The portal's size rule, e.g. "Photograph (CGL / CHSL) · 20 KB to 50 KB". */
  hint: string | null;
  optional: boolean;
  optionalLabel: string;
  action:
    | { kind: 'link'; href: string; label: string }
    | { kind: 'upload'; documentType: DocumentType | null; label: string }
    | null;
};

const STATE_TONE: Record<ChecklistItemState, Tone> = {
  ready: 'success',
  needs_preparing: 'warning',
  missing: 'danger',
  check_manually: 'neutral',
};

/**
 * The checklist rows. "Upload" opens the customer-page upload panel right under its row, with
 * the document type already chosen, so the operator never leaves the customer. Once it is saved,
 * the panel's `router.refresh()` re-renders the server card and the row turns ready.
 */
export function ChecklistRows({
  customerId,
  rows,
  canReview,
  uploadingLabel,
}: {
  customerId: string;
  rows: ChecklistRowView[];
  canReview: boolean;
  uploadingLabel: string;
}) {
  const t = useTranslations();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {rows.map((row) => (
        <li key={row.key} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {row.label}
                {row.optional ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({row.optionalLabel})
                  </span>
                ) : null}
              </p>
              {row.hint ? <p className="mt-0.5 text-xs text-slate-500">{row.hint}</p> : null}
              {row.help ? <p className="mt-0.5 text-xs text-slate-500">{row.help}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={STATE_TONE[row.state]}>{row.stateLabel}</Badge>
              {row.action?.kind === 'link' ? (
                <Link href={row.action.href} className={cn(OUTLINE_BUTTON, 'h-8 px-3 text-xs')}>
                  {row.action.label}
                </Link>
              ) : row.action?.kind === 'upload' ? (
                <Button
                  size="sm"
                  variant={openKey === row.key ? 'ghost' : 'secondary'}
                  aria-expanded={openKey === row.key}
                  onClick={() => setOpenKey(openKey === row.key ? null : row.key)}
                >
                  {openKey === row.key ? t('common.cancel') : row.action.label}
                </Button>
              ) : null}
            </div>
          </div>

          {openKey === row.key && row.action?.kind === 'upload' ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-4">
              <p className="mb-3 text-sm font-medium text-slate-700">
                {uploadingLabel.replace('{label}', row.label)}
              </p>
              <UploadDocumentPanel
                customerId={customerId}
                canReview={canReview}
                defaultDocumentType={row.action.documentType}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
