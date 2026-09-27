'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  ChevronDown,
  InfinityIcon,
  LayoutGrid,
  List,
  Search,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

export type SchemeQuery = {
  q: string;
  category: string;
  state: string;
  education: string;
  lifecycle: string;
  sort: string;
  view: string;
};

export function buildSchemesHref(query: SchemeQuery): string {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  if (query.category) search.set('category', query.category);
  if (query.state) search.set('state', query.state);
  if (query.education) search.set('education', query.education);
  // Defaults stay out of the URL, so the plain /schemes link is the default view.
  if (query.lifecycle && query.lifecycle !== 'all') search.set('lifecycle', query.lifecycle);
  if (query.sort && query.sort !== 'deadline') search.set('sort', query.sort);
  if (query.view && query.view !== 'grid') search.set('view', query.view);
  const qs = search.toString();
  return qs ? `/schemes?${qs}` : '/schemes';
}

const TAB_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  open: Timer,
  upcoming: CalendarDays,
  evergreen: InfinityIcon,
};

const TAB_ICON_TONE: Record<string, string> = {
  all: 'text-brand-600',
  open: 'text-brand-500',
  upcoming: 'text-fuchsia-500',
  evergreen: 'text-brand-700',
};

type Option = { value: string; label: string };

/**
 * A native `<select>` dressed to match the toolbar. Native on purpose: keyboard, screen-reader
 * and mobile pickers all come for free, and the list is short.
 */
function ToolbarSelect({
  label,
  value,
  options,
  allLabel,
  caption,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Option[];
  allLabel?: string;
  /** A small label above the value, as on the sort control. */
  caption?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {caption ? (
        <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] leading-none text-slate-400">
          {caption}
        </span>
      ) : null}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-12 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100',
          caption && 'pt-3.5',
        )}
      >
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
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
 * The hub's filter bar.
 *
 * Lifecycle is a row of links rather than another dropdown: it is the question an operator asks
 * first ("what can I sell today, and what do I prepare for?"), and links keep it shareable,
 * prefetched and usable before the page's JavaScript has loaded. The same goes for the layout
 * toggle. Every choice lives in the URL; this component holds no state but the search text.
 */
export function SchemesFilters({
  query,
  categories,
  states,
  educationLevels,
  lifecycleTabs,
  sortOptions,
}: {
  query: SchemeQuery;
  categories: Option[];
  states: Option[];
  educationLevels: Option[];
  lifecycleTabs: { value: string; label: string; countLabel: string }[];
  sortOptions: Option[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [text, setText] = useState(query.q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== query.q) router.push(buildSchemesHref({ ...query, q: text }));
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const go = (patch: Partial<SchemeQuery>) => router.push(buildSchemesHref({ ...query, ...patch }));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('schemes.windowLabel')} className="flex flex-wrap gap-3">
        {lifecycleTabs.map((tab) => {
          const selected = query.lifecycle === tab.value;
          const Icon = TAB_ICONS[tab.value] ?? LayoutGrid;
          return (
            <Link
              key={tab.value}
              role="tab"
              aria-selected={selected}
              href={buildSchemesHref({ ...query, lifecycle: tab.value })}
              className={cn(
                'flex min-w-[10.5rem] items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                selected
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-brand-200 hover:bg-brand-50/40',
              )}
            >
              <Icon
                size={22}
                strokeWidth={1.8}
                aria-hidden
                className={cn('shrink-0', selected ? 'text-white' : TAB_ICON_TONE[tab.value])}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{tab.label}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-xs tabular-nums',
                    selected ? 'text-brand-100' : 'text-slate-500',
                  )}
                >
                  {tab.countLabel}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[16rem] flex-[2_1_16rem]">
          <span className="sr-only">{t('common.search')}</span>
          <Search
            size={18}
            strokeWidth={1.8}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`${t('schemes.searchPlaceholder')}…`}
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <ToolbarSelect
          label={t('schemes.category')}
          value={query.category}
          allLabel={t('schemes.categoryAll')}
          options={categories}
          onChange={(category) => go({ category })}
          className="min-w-[9rem] flex-1"
        />
        <ToolbarSelect
          label={t('schemes.state')}
          value={query.state}
          allLabel={t('schemes.stateAll')}
          options={states}
          onChange={(state) => go({ state })}
          className="min-w-[9rem] flex-1"
        />
        <ToolbarSelect
          label={t('schemes.education')}
          value={query.education}
          allLabel={t('schemes.educationAll')}
          options={educationLevels}
          onChange={(education) => go({ education })}
          className="min-w-[10rem] flex-1"
        />
        <ToolbarSelect
          label={t('schemes.sortLabel')}
          caption={t('schemes.sortLabel')}
          value={query.sort}
          options={sortOptions}
          onChange={(sort) => go({ sort })}
          className="w-40"
        />

        <div
          role="group"
          aria-label={t('schemes.viewLabel')}
          className="flex h-12 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
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
                href={buildSchemesHref({ ...query, view })}
                aria-label={t(`schemes.view.${view}`)}
                aria-current={selected ? 'true' : undefined}
                title={t(`schemes.view.${view}`)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  selected ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
