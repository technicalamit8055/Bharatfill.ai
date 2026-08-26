'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { FILL_SESSION_STATUSES } from '@/lib/fill-sessions/schema';

function buildQuery(q: string, status: string): string {
  const search = new URLSearchParams();
  if (q) search.set('q', q);
  if (status) search.set('status', status);
  const qs = search.toString();
  return qs ? `/fill-sessions?${qs}` : '/fill-sessions';
}

export function FillSessionsFilters({ status, q }: { status: string; q: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== q) router.push(buildQuery(query, status));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('fillSessions.searchPlaceholder')}
        aria-label={t('common.search')}
        className="w-72"
      />
      <Select
        aria-label={t('settings.status')}
        className="w-auto"
        value={status}
        onChange={(event) => router.push(buildQuery(query, event.target.value))}
      >
        <option value="">{t('settings.status')}</option>
        {FILL_SESSION_STATUSES.map((option) => (
          <option key={option} value={option}>
            {t(`fillSessions.status.${option}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
