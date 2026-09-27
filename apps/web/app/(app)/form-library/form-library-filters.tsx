'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LayoutGrid, List, Search } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import type { FormLibraryQuery } from '@/lib/forms/present';

export function buildFormLibraryHref(query: FormLibraryQuery): string {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  if (query.region) search.set('region', query.region);
  if (query.status) search.set('status', query.status);
  if (query.category) search.set('category', query.category);
  // The default view stays out of the URL, so the plain /form-library link is the default page.
  if (query.view === 'list') search.set('view', 'list');
  const qs = search.toString();
  return qs ? `/form-library?${qs}` : '/form-library';
}

type Option = { value: string; label: string };

/** A native `<select>` dressed to match the toolbar, for the same reasons as on the schemes hub. */
function ToolbarSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-[9rem] flex-1 sm:flex-none sm:basis-44">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-9 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}

/**
 * Search, filters and the layout toggle. Every choice lives in the URL, so a filtered library
 * is a link an operator can share; this component holds no state but the search text.
 */
export function FormLibraryFilters({
  query,
  regions,
  statuses,
  categories,
}: {
  query: FormLibraryQuery;
  regions: Option[];
  statuses: Option[];
  categories: Option[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [text, setText] = useState(query.q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== query.q) router.push(buildFormLibraryHref({ ...query, q: text }));
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const go = (patch: Partial<FormLibraryQuery>) =>
    router.push(buildFormLibraryHref({ ...query, ...patch }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative min-w-[16rem] flex-[1_1_20rem]">
        <span className="sr-only">{t('common.search')}</span>
        <Search
          size={20}
          strokeWidth={1.8}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-600"
        />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`${t('formLibrary.searchPlaceholder')}…`}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <ToolbarSelect
        label={t('formLibrary.region')}
        value={query.region}
        allLabel={t('formLibrary.regionAll')}
        options={regions}
        onChange={(region) => go({ region })}
      />
      <ToolbarSelect
        label={t('formLibrary.statusLabel')}
        value={query.status}
        allLabel={t('formLibrary.statusLabel')}
        options={statuses}
        onChange={(status) => go({ status })}
      />
      <ToolbarSelect
        label={t('formLibrary.category')}
        value={query.category}
        allLabel={t('formLibrary.categoryAll')}
        options={categories}
        onChange={(category) => go({ category })}
      />

      <div
        role="group"
        aria-label={t('formLibrary.viewLabel')}
        className="flex h-12 items-center gap-1 sm:ml-auto"
      >
        {(
          [
            ['grid', LayoutGrid],
            ['list', List],
          ] as const
        ).map(([view, Icon]) => {
          const selected = query.view === view;
          return (
            <Link
              key={view}
              href={buildFormLibraryHref({ ...query, view })}
              aria-label={t(`formLibrary.view.${view}`)}
              aria-current={selected ? 'true' : undefined}
              title={t(`formLibrary.view.${view}`)}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                selected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon size={20} strokeWidth={1.8} aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
