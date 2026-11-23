'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { SearchIcon, PlusIcon } from './icons';
import { CUSTOMER_SEARCH_INPUT_ID, Kbd } from './keyboard-shortcuts';

type JumpResult = {
  id: string;
  displayName: string;
  customerCode: string;
  mobileLast4: string | null;
  district: string | null;
};

/**
 * Type a name, a mobile or a customer code and go straight to the person standing at the counter.
 *
 * Hits `/api/customers/search`, which runs the `search_customers` RPC under the caller's RLS and
 * returns only the last four digits of the mobile — never the full number (§19.3). The dashboard's
 * own recent list is the eight newest records, which is no use when the walk-in came in last week.
 */
export function CustomerJumpSearch({ canCreateCustomer }: { canCreateCustomer: boolean }) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JumpResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(trimmed)}&limit=6`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : Promise.reject(response)))
        .then((body: { data: { customers: JumpResult[] } }) => setResults(body.data.customers))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Clicking anywhere else closes the panel: it floats over the stat cards, and an operator who
  // has moved on should not have to clear the box to reach them.
  useEffect(() => {
    if (results === null) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setResults(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [results]);

  return (
    <div ref={containerRef} className="relative">
      <label className="sr-only" htmlFor={CUSTOMER_SEARCH_INPUT_ID}>
        {t('dashboard.jumpSearchLabel')}
      </label>
      <div className="relative">
        <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <SearchIcon />
        </span>
        <input
          id={CUSTOMER_SEARCH_INPUT_ID}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setResults(null);
          }}
          placeholder={t('dashboard.jumpSearchPlaceholder')}
          autoComplete="off"
          className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner />
          </span>
        ) : query === '' ? (
          // The `/` shortcut, shown where the operator's eye already is.
          <span
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
          >
            <Kbd>/</Kbd>
          </span>
        ) : null}
      </div>

      {results !== null ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-500">{t('dashboard.jumpSearchEmpty')}</p>
              {canCreateCustomer ? (
                <Link
                  href="/customers/new"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t('dashboard.jumpSearchCreate')}
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((result) => (
                <li key={result.id}>
                  <Link
                    href={`/customers/${result.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {result.displayName}
                      </span>
                      <span className="block truncate font-mono text-xs text-slate-500">
                        {/* Last four only — the search API never sends more (§19.3). Mobile +
                            name identify a customer; the internal code is not shown. */}
                        {[result.mobileLast4 ? `••••${result.mobileLast4}` : null, result.district]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-slate-400">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
