'use client';

import { ChevronDown, Globe } from 'lucide-react';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';

/**
 * In-place language toggle. Operators switch mid-task — often because the customer in front of
 * them reads Hindi — so this never changes the URL or loses where they were.
 *
 * Still a native `<select>` under the globe-and-chevron styling: the browser's own picker is
 * keyboard- and screen-reader-correct for free, and the icons are painted over it rather than
 * replacing it.
 */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="relative flex items-center text-sm">
      <span className="sr-only">{t('common.language')}</span>
      <Globe
        size={16}
        strokeWidth={1.8}
        aria-hidden
        className="pointer-events-none absolute left-3 text-slate-500"
      />
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-10 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-600"
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {LOCALE_LABELS[value]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute right-3 text-slate-500"
      />
    </label>
  );
}
