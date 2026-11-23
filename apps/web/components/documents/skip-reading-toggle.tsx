'use client';

import { isStoreOnlyDocumentType } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';

/**
 * Whether an upload is saved without being read (§12.4), from the type picked and the operator's
 * "Just save — don't read" tick.
 *
 *   storeOnly   send `{ storeOnly: true }` to `/process`: no OCR, no AI, no reading quota.
 *   locked      a photo or signature — always kept unread, so the tick is shown on and fixed.
 *   needsType   kept unread but still on "Detect automatically": detecting a type is a read, so
 *               the form asks for the type first (the server refuses it too).
 */
export function storeOnlyState(documentType: string, skipReading: boolean) {
  const locked = isStoreOnlyDocumentType(documentType);
  const storeOnly = locked || skipReading;
  return { storeOnly, locked, needsType: storeOnly && documentType === '' };
}

/**
 * The "Just save — don't read" tick on both upload forms. For a passport photo, a signature, or
 * any file the operator only needs to keep (an old receipt, a copy for the record).
 */
export function SkipReadingToggle({
  id,
  documentType,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  documentType: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const { locked, needsType } = storeOnlyState(documentType, checked);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-slate-800">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={locked || checked}
          disabled={disabled === true || locked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <span className="font-medium">{t('documents.storeOnly.toggle')}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {t(locked ? 'documents.storeOnly.hint' : 'documents.storeOnly.toggleHint')}
          </span>
        </span>
      </label>
      {needsType ? (
        <p className="mt-1.5 pl-7 text-xs font-medium text-amber-700">
          {t('documents.storeOnly.needsType')}
        </p>
      ) : null}
    </div>
  );
}
