'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Select } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

export type SchemeQuery = {
  q: string;
  category: string;
  state: string;
  education: string;
  lifecycle: string;
};

export function buildSchemesHref(query: SchemeQuery): string {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  if (query.category) search.set('category', query.category);
  if (query.state) search.set('state', query.state);
  if (query.education) search.set('education', query.education);
  // 'all' is the default view, so it stays out of the URL.
  if (query.lifecycle && query.lifecycle !== 'all') search.set('lifecycle', query.lifecycle);
  const qs = search.toString();
  return qs ? `/schemes?${qs}` : '/schemes';
}

/**
 * The hub's filter bar.
 *
 * Lifecycle is a row of links rather than another dropdown: it is the question an operator asks
 * first ("what can I sell today, and what do I prepare for?"), and links keep it shareable,
 * prefetched and usable before the page's JavaScript has loaded.
 */
export function SchemesFilters({
  query,
  categories,
  states,
  educationLevels,
  lifecycleTabs,
}: {
  query: SchemeQuery;
  categories: { value: string; label: string }[];
  states: { value: string; label: string }[];
  educationLevels: { value: string; label: string }[];
  lifecycleTabs: { value: string; label: string }[];
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

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t('schemes.windowLabel')} className="flex flex-wrap gap-1">
        {lifecycleTabs.map((tab) => {
          const selected = query.lifecycle === tab.value;
          return (
            <Link
              key={tab.value}
              role="tab"
              aria-selected={selected}
              href={buildSchemesHref({ ...query, lifecycle: tab.value })}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? 'bg-brand-600 font-medium text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('schemes.searchPlaceholder')}
          aria-label={t('common.search')}
          className="w-72"
        />
        <Select
          aria-label={t('schemes.category')}
          className="w-auto"
          value={query.category}
          onChange={(event) =>
            router.push(buildSchemesHref({ ...query, category: event.target.value }))
          }
        >
          <option value="">{t('schemes.categoryAll')}</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('schemes.state')}
          className="w-auto"
          value={query.state}
          onChange={(event) =>
            router.push(buildSchemesHref({ ...query, state: event.target.value }))
          }
        >
          <option value="">{t('schemes.stateAll')}</option>
          {states.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('schemes.education')}
          className="w-auto"
          value={query.education}
          onChange={(event) =>
            router.push(buildSchemesHref({ ...query, education: event.target.value }))
          }
        >
          <option value="">{t('schemes.educationAll')}</option>
          {educationLevels.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
