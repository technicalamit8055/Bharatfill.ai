'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

function buildQuery(q: string, region: string, status: string): string {
  const search = new URLSearchParams();
  if (q) search.set('q', q);
  if (region) search.set('region', region);
  if (status) search.set('status', status);
  const qs = search.toString();
  return qs ? `/form-library?${qs}` : '/form-library';
}

export function FormLibraryFilters({
  q,
  region,
  status,
  regions,
}: {
  q: string;
  region: string;
  status: string;
  regions: string[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== q) router.push(buildQuery(query, region, status));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('formLibrary.searchPlaceholder')}
        aria-label={t('common.search')}
        className="w-72"
      />
      <Select
        aria-label={t('formLibrary.region')}
        className="w-auto"
        value={region}
        onChange={(event) => router.push(buildQuery(query, event.target.value, status))}
      >
        <option value="">{t('formLibrary.regionAll')}</option>
        {regions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t('settings.status')}
        className="w-auto"
        value={status}
        onChange={(event) => router.push(buildQuery(query, region, event.target.value))}
      >
        <option value="">{t('settings.status')}</option>
        <option value="active">{t('formLibrary.status.active')}</option>
        <option value="testing">{t('formLibrary.status.testing')}</option>
        <option value="draft">{t('formLibrary.status.draft')}</option>
      </Select>
    </div>
  );
}
