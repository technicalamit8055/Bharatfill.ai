'use client';

import { useState } from 'react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { AddDetailsIcon } from '../icons';
import { DetailCard } from './detail-card';
import { PasteTextPanel } from './paste-text-panel';
import { UploadDocumentPanel } from './upload-document-panel';

type Mode = 'paste' | 'upload';

const TAB_BASE = '-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors';
const TAB_ACTIVE = 'border-brand-600 font-semibold text-brand-700';
const TAB_INACTIVE = 'border-transparent text-slate-500 hover:text-slate-700';

/**
 * One card for everything that starts a customer's profile from something other than typing into
 * the field forms (§9.3, §7.3.4): pasted text, or an uploaded document. Both are ways to reach
 * the same destination — proposed profile fields a human must accept before anything is saved —
 * so they live behind one set of tabs instead of two separate cards an operator has to discover.
 *
 * Both reviews happen inline, right here. A document upload still queues the same background
 * `ocr.extract` job the standalone Documents flow uses, but the panel polls for the result and
 * shows the same accept/edit/reject table as soon as it lands, instead of sending the operator to
 * the document's own page. That page (and the Documents list below) still work as a fallback.
 */
export function AddProfileInfo({
  customerId,
  canPaste,
  canUpload,
  canReview,
}: {
  customerId: string;
  canPaste: boolean;
  canUpload: boolean;
  canReview: boolean;
}) {
  const t = useTranslations();
  const [mode, setMode] = useState<Mode>(canPaste ? 'paste' : 'upload');

  if (!canPaste && !canUpload) return null;

  const showTabs = canPaste && canUpload;

  return (
    <DetailCard
      id="add-details"
      icon={AddDetailsIcon}
      tone="rose"
      title={t('customers.paste.title')}
    >
      {showTabs ? (
        <div
          role="tablist"
          aria-label={t('customers.paste.title')}
          className="mb-4 flex gap-2 border-b border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            onClick={() => setMode('paste')}
            className={cn(TAB_BASE, mode === 'paste' ? TAB_ACTIVE : TAB_INACTIVE)}
          >
            {t('customers.paste.tabPaste')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => setMode('upload')}
            className={cn(TAB_BASE, mode === 'upload' ? TAB_ACTIVE : TAB_INACTIVE)}
          >
            {t('documents.upload')}
          </button>
        </div>
      ) : null}

      {mode === 'paste' && canPaste ? <PasteTextPanel customerId={customerId} /> : null}
      {mode === 'upload' && canUpload ? (
        <UploadDocumentPanel customerId={customerId} canReview={canReview} />
      ) : null}
    </DetailCard>
  );
}
