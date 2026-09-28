'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { FILL_SESSION_STATUSES } from '@/lib/fill-sessions/schema';
import {
  DATE_RANGES,
  fillSessionsHref,
  hasListFilters,
  type DateRange,
  type FillSessionListParams,
  type FillSessionStatusFilter,
} from '@/lib/fill-sessions/list-view';
import { CalendarIcon, DropdownIcon, FilterIcon, SearchIcon } from './icons';

const CONTROL =
  'h-12 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

const BUTTON =
  'inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors';

/** Same cap as the URL parser, so a pasted wall of text can never bounce between the two. */
const MAX_QUERY_LENGTH = 200;

/**
 * Search, status, clear, and the date window. All of it lives in the URL: the page reads the
 * filters on the server, and this toolbar only writes them.
 */
export function FillSessionsFilters({ params }: { params: FillSessionListParams }) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState(params.q);
  // The last search this box sent. A different `q` arriving from the URL came from elsewhere
  // (Clear filters, the back button) and replaces the text; our own echo must not, or it would
  // overwrite whatever was typed while the navigation was in flight.
  const sent = useRef(params.q);

  useEffect(() => {
    if (params.q === sent.current) return;
    sent.current = params.q;
    setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    const next = query.trim();
    if (next === params.q) return;
    const timer = setTimeout(() => {
      sent.current = next;
      router.replace(fillSessionsHref(params, { q: next, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, params, router]);

  const filtered = hasListFilters(params);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1 lg:max-w-xl">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('fillSessions.searchPlaceholder')}
          aria-label={t('common.search')}
          className={`${CONTROL} w-full pl-12 pr-4 placeholder:text-slate-400`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:flex-1">
        <div className="relative">
          <select
            aria-label={t('fillSessions.filters.status')}
            value={params.status}
            onChange={(event) =>
              router.push(
                fillSessionsHref(params, {
                  status: event.target.value as FillSessionStatusFilter | '',
                  page: 1,
                }),
              )
            }
            className={`${CONTROL} w-44 appearance-none pl-4 pr-10 font-medium`}
          >
            <option value="">{t('fillSessions.filters.status')}</option>
            {FILL_SESSION_STATUSES.map((option) => (
              <option key={option} value={option}>
                {t(`fillSessions.status.${option}`)}
              </option>
            ))}
          </select>
          <DropdownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>

        {filtered ? (
          <Link
            href={fillSessionsHref(params, { q: '', status: '', page: 1 })}
            className={`${BUTTON} text-slate-700 hover:bg-slate-50`}
          >
            <FilterIcon className="h-4 w-4" />
            {t('fillSessions.filters.clear')}
          </Link>
        ) : (
          <button type="button" disabled className={`${BUTTON} cursor-not-allowed text-slate-400`}>
            <FilterIcon className="h-4 w-4" />
            {t('fillSessions.filters.clear')}
          </button>
        )}

        <div className="relative lg:ml-auto">
          <CalendarIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <select
            aria-label={t('fillSessions.filters.range')}
            value={params.range}
            onChange={(event) =>
              router.push(
                fillSessionsHref(params, { range: event.target.value as DateRange, page: 1 }),
              )
            }
            className={`${CONTROL} w-52 appearance-none pl-12 pr-10 font-medium`}
          >
            {DATE_RANGES.map((range) => (
              <option key={range} value={range}>
                {t(`fillSessions.range.${range}`)}
              </option>
            ))}
          </select>
          <DropdownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
    </div>
  );
}
