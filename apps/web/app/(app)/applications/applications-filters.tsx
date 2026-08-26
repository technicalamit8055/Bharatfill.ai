'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { APPLICATION_CATEGORIES, type ApplicationListFilter } from '@/lib/applications/schema';
import type { ApplicationCategory } from '@/lib/supabase/database.types';

function buildQuery(filter: ApplicationListFilter, category: string, q: string): string {
  const search = new URLSearchParams();
  if (filter !== 'all') search.set('filter', filter);
  if (category) search.set('category', category);
  if (q) search.set('q', q);
  const qs = search.toString();
  return qs ? `/applications?${qs}` : '/applications';
}

export function ApplicationsFilters({
  filter,
  category,
  q,
}: {
  filter: ApplicationListFilter;
  category?: ApplicationCategory;
  q: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== q) router.push(buildQuery(filter, category ?? '', query));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('applications.searchPlaceholder')}
        aria-label={t('common.search')}
        className="w-64"
      />
      <Select
        aria-label={t('applications.category')}
        className="w-auto"
        value={category ?? ''}
        onChange={(event) => router.push(buildQuery(filter, event.target.value, query))}
      >
        <option value="">{t('applications.category')}</option>
        {APPLICATION_CATEGORIES.map((option) => (
          <option key={option} value={option}>
            {t(`applications.categories.${option}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
