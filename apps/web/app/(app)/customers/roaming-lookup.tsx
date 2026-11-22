'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Input } from '@assistigo/ui';
import type { RoamingCustomerCard } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { VaultAccessPanel } from './vault-access-panel';

async function readErrorKey(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as {
    error?: { messageKey: string };
  } | null;
  return json?.error?.messageKey ?? 'errors.internal';
}

/**
 * "Aapka registered mobile number kya hai?" — the counter lookup across every centre on the
 * platform (§7.3.2, migration 0024). A match here is never the whole record: `RoamingCustomerCard`
 * is the masked pre-auth card, and linking a result only bookmarks it — full access still needs
 * the citizen's own consent, on the customer's own page.
 */
export function RoamingLookup() {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState('');
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [results, setResults] = useState<RoamingCustomerCard[] | null>(null);
  // The number the shown results are for: the app box asks about this one, not the live input.
  const [searchedMobile, setSearchedMobile] = useState('');
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
      setSearchedMobile(mobile.replace(/\D/g, '').slice(-10));
    } catch {
      setError('errors.internal');
    } finally {
      setSearching(false);
    }
  }

  async function link(customerId: string) {
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

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        🌐 {t('customers.roaming.lookupButton')}
      </Button>
    );
  }

  return (
    <Card
      title={t('customers.roaming.lookupTitle')}
      actions={
        <button
          type="button"
          aria-label={t('common.cancel')}
          className="text-slate-400 hover:text-slate-700"
          onClick={() => {
            setOpen(false);
            setResults(null);
            setError(null);
            setMobile('');
            setSearchedMobile('');
          }}
        >
          ✕
        </button>
      }
    >
      <form className="flex items-end gap-2" onSubmit={(event) => void search(event)}>
        <div className="flex-1">
          <Input
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            inputMode="numeric"
            placeholder={t('customers.roaming.mobilePlaceholder')}
            aria-label={t('customers.mobile')}
            maxLength={10}
            required
          />
        </div>
        <Button type="submit" loading={searching}>
          {t('common.search')}
        </Button>
      </form>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {t(error)}
        </Alert>
      ) : null}

      {results !== null ? (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('customers.roaming.noMatch')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {results.map((customer) => (
              <li
                key={customer.customerId}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {customer.displayName}
                    <Badge tone="info" className="ml-2">
                      🌐 {t('customers.roaming.badge')}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {customer.mobileLast4 ? `•••••• ${customer.mobileLast4}` : ''}
                    {customer.state ? ` · ${customer.state}` : ''}
                  </p>
                </div>
                {customer.isLinked ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/customers/${customer.customerId}`)}
                  >
                    {t('customers.roaming.viewLinked')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    loading={linkingId === customer.customerId}
                    onClick={() => void link(customer.customerId)}
                  >
                    {t('customers.roaming.linkToCounter')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* Same box for every number: never says whether this person uses the app (§4.1). */}
      {results !== null && searchedMobile.length === 10 ? (
        <VaultAccessPanel mobile={searchedMobile} />
      ) : null}
    </Card>
  );
}
