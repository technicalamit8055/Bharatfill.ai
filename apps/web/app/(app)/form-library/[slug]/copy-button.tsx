'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

/**
 * Copies adapter configuration — URL patterns, `customer.*` field keys. Never used for a
 * customer's values: this page shows none.
 */
export function CopyButton({
  value,
  label,
  showText = false,
  className,
}: {
  value: string;
  /** The accessible name, e.g. "Copy customer.full_name". */
  label: string;
  /** "Copy" beside the icon, rather than the icon alone. */
  showText?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A blocked clipboard is not worth an error — the value is on screen to select.
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? t('common.copied') : label}
      title={copied ? t('common.copied') : label}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        showText ? 'h-9 px-3 text-sm font-medium' : 'h-8 w-8',
        className,
      )}
    >
      <Icon size={16} strokeWidth={2} aria-hidden className={copied ? 'text-emerald-600' : undefined} />
      {showText ? <span aria-hidden>{copied ? t('common.copied') : t('common.copy')}</span> : null}
    </button>
  );
}
