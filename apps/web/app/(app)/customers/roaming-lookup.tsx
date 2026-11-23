'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Input } from '@assistigo/ui';
import type { RoamingCustomerCard } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { RoamingIcon } from './icons';

async function readErrorKey(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as {
    error?: { messageKey: string };
  } | null;
  return json?.error?.messageKey ?? 'errors.internal';
}

/**
 * "Customer registered at another cyber cafe?" — the counter lookup across every centre on the
 * platform (§7.3.2, migration 0024), always open above the customer list, in plain words for a
 * CSC / cyber cafe operator.
 *
 * A match is never the whole record: `RoamingCustomerCard` is the masked card. "Ask for
 * permission" links the customer to this centre (so their page can open, locked) and goes to
 * their page, where the operator sends the request. Once the customer says yes on their phone,
 * or reads out the code, they sit in this centre's list for good (0044); every later visit
 * needs a fresh yes.
 */
export function RoamingLookup() {
  const t = useTranslations();
  const router = useRouter();

  const [mobile, setMobile] = useState('');
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [results, setResults] = useState<RoamingCustomerCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch(
        `/api/customers/roaming/search?mobile=${encodeURIComponent(mobile.trim())}`,
      );
      if (!response.ok) {
        setError(await readErrorKey(response));
        return;
      }
      const body = (await response.json()) as { data: { customers: RoamingCustomerCard[] } };
      setResults(body.data.customers);
    } catch {
      setError('errors.internal');
    } finally {
      setSearching(false);
    }
  }

  async function askPermission(customerId: string) {
    setLinkingId(customerId);
    setError(null);
    try {
      const response = await fetch('/api/customers/roaming/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (!response.ok) {
        setError(await readErrorKey(response));
        setLinkingId(null);
        return;
      }
      router.push(`/customers/${customerId}`);
    } catch {
      setError('errors.internal');
      setLinkingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
          <RoamingIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{t('customers.lookup.title')}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t('customers.lookup.intro')}</p>
        </div>
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => void search(event)}
      >
        <Input
          value={mobile}
          onChange={(event) => setMobile(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder={t('customers.lookup.placeholder')}
          aria-label={t('customers.lookup.placeholder')}
          maxLength={10}
          minLength={10}
          required
          className="sm:max-w-xs"
        />
        <Button type="submit" loading={searching} disabled={mobile.length !== 10}>
          {t('customers.lookup.find')}
        </Button>
      </form>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {t(error)}
        </Alert>
      ) : null}

      {results !== null ? (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{t('customers.lookup.noMatch')}</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {results.map((customer) => (
                <li
                  key={customer.customerId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="truncate">{customer.displayName}</span>
                      <Badge tone={customer.fromApp ? 'neutral' : 'info'}>
                        {customer.fromApp
                          ? `📱 ${t('customers.lookup.fromApp')}`
                          : `🌐 ${t('customers.lookup.otherCafe')}`}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[
                        customer.mobileLast4 ? `•••••• ${customer.mobileLast4}` : null,
                        customer.state,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {customer.isLinked ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/customers/${customer.customerId}`)}
                    >
                      {t('customers.lookup.open')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      loading={linkingId === customer.customerId}
                      onClick={() => void askPermission(customer.customerId)}
                    >
                      {t('customers.lookup.askPermission')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{t('customers.lookup.howItWorks')}</p>
          </>
        )
      ) : null}
    </section>
  );
}
