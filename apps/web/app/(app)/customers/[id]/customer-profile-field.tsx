'use client';

import { useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { CopiedIcon, CopyIcon, HiddenIcon } from '../icons';

export function CustomerProfileField({
  customerId,
  fieldKey,
  label,
  value,
  hasEncryptedValue,
  sensitive,
  canReveal,
  copyable = false,
  className,
}: {
  customerId: string;
  /** `null` for a read-only entry that is not a profile field (the customer code). */
  fieldKey: string | null;
  label: string;
  value: string | null;
  hasEncryptedValue: boolean;
  sensitive: boolean;
  canReveal: boolean;
  /**
   * Offer a copy button. Only ever set for non-sensitive values — copying a masked field would
   * put either the mask or, after a reveal, the raw value on the clipboard.
   */
  copyable?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    if (!fieldKey) return;
    setPending(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fieldKey }),
      });
      if (!response.ok) return;
      const json = (await response.json()) as { data: { value: string | null } };
      setRevealed(json.data.value ?? t('common.none'));
    } finally {
      setPending(false);
    }
  }

  // An encrypted field with no masked preview available still needs a way to reveal it.
  const displayValue = revealed ?? value ?? (hasEncryptedValue ? t('common.masked') : null);
  const showCopy = copyable && !sensitive && value !== null;

  async function copy() {
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A blocked clipboard is not worth an error — the value is on screen to select.
    }
  }

  return (
    <div className={className}>
      <dt className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {label}
        {sensitive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            <HiddenIcon className="h-3 w-3" />
            {t('common.masked')}
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
        <span className="break-words">{displayValue ?? t('common.none')}</span>
        {showCopy ? (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={copied ? t('common.copied') : t('customers.profile.copyValue', { label })}
            title={copied ? t('common.copied') : t('common.copy')}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100"
          >
            {copied ? <CopiedIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {sensitive && canReveal && fieldKey && revealed === null ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void reveal()}
            className="inline-flex h-6 shrink-0 items-center rounded-md bg-brand-50 px-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-60"
          >
            {pending ? t('common.loading') : t('common.reveal')}
          </button>
        ) : null}
      </dd>
    </div>
  );
}
