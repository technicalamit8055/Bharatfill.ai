'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Input, Spinner } from '@assistigo/ui';
import { formatMobile } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';

/**
 * Where a set of staged walk-in files should land (§9.1, §11).
 *
 * Three destinations, in the order an operator actually reaches for them:
 *
 *   1. **New customer** — the first-time walk-in. The default, and one click.
 *   2. **Existing customer** — the returning citizen, found by name, mobile or code.
 *   3. **Another centre** — a citizen registered somewhere else. Their documents belong in their
 *      own file, so this saves into their home centre rather than copying them into this one.
 *
 * The third tab is the one with a rule attached. A platform-wide lookup returns a *masked* card
 * and nothing more (see `RoamingCustomerCard`), and writing to that citizen needs live consent —
 * an OTP they gave, still unexpired. This component never tries to obtain that consent itself:
 * it shows whether access is live and sends the operator to the citizen's card to request it if
 * not. Consent is a conversation with the person at the counter, not a button on a picker.
 */

export type PickedCustomer =
  | { target: 'local'; customerId: string | null; displayName: string }
  | { target: 'roaming'; customerId: string; displayName: string };

type LocalCustomer = {
  id: string;
  displayName: string;
  customerCode: string | null;
  mobile: string | null;
  district: string | null;
};

type RoamingCard = {
  customerId: string;
  displayName: string;
  mobileLast4: string | null;
  district: string | null;
  state: string | null;
  accessState?: string;
};

type Tab = 'new' | 'existing' | 'roaming';

const SEARCH_DEBOUNCE_MS = 300;
const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;

export function DropCustomerPicker({
  fileCount,
  canPickRoaming,
  busy,
  onCancel,
  onConfirm,
}: {
  fileCount: number;
  /** `customer.roaming_link` — the roaming tab is hidden entirely without it. */
  canPickRoaming: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (picked: PickedCustomer) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('new');
  const [selected, setSelected] = useState<PickedCustomer | null>(null);

  const tabs = useMemo<Tab[]>(
    () => (canPickRoaming ? ['new', 'existing', 'roaming'] : ['new', 'existing']),
    [canPickRoaming],
  );

  function pickTab(next: Tab) {
    setTab(next);
    // A selection made on one tab must not be submitted from another: the destination and the
    // customer are one decision, and carrying half of it across is how a file lands in the
    // wrong centre.
    setSelected(next === 'new' ? { target: 'local', customerId: null, displayName: '' } : null);
  }

  useEffect(() => {
    setSelected({ target: 'local', customerId: null, displayName: '' });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('documentDrop.picker.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{t('documentDrop.picker.title')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('documentDrop.picker.subtitle', { count: fileCount })}
          </p>
        </header>

        <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
          {tabs.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => pickTab(value)}
              className={
                tab === value
                  ? 'border-b-2 border-brand-600 px-3 pb-2 text-xs font-medium text-brand-700'
                  : 'border-b-2 border-transparent px-3 pb-2 text-xs font-medium text-slate-500 hover:text-slate-800'
              }
            >
              {t(
                value === 'new'
                  ? 'documentDrop.picker.tabNew'
                  : value === 'existing'
                    ? 'documentDrop.picker.tabExisting'
                    : 'documentDrop.picker.tabRoaming',
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {tab === 'new' ? (
            <p className="text-xs text-slate-500">{t('documentDrop.picker.newHint')}</p>
          ) : tab === 'existing' ? (
            <LocalSearch selected={selected} onSelect={setSelected} />
          ) : (
            <RoamingSearch selected={selected} onSelect={setSelected} />
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            {t('documentDrop.picker.cancel')}
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={selected === null || busy}
            onClick={() => {
              if (selected) onConfirm(selected);
            }}
          >
            {t('documentDrop.picker.confirm')}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Search within this organization — the ordinary returning customer. */
function LocalSearch({
  selected,
  onSelect,
}: {
  selected: PickedCustomer | null;
  onSelect: (picked: PickedCustomer) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalCustomer[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/customers/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          );
          if (!response.ok) return;
          const json = (await response.json()) as { data: { customers: LocalCustomer[] } };
          if (!cancelled) setResults(json.data?.customers ?? []);
        } catch {
          if (!cancelled) setResults([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('documentDrop.picker.searchPlaceholder')}
        aria-label={t('documentDrop.picker.searchLabel')}
      />

      {searching ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : results === null ? null : results.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">{t('documentDrop.picker.noResults')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {results.map((customer) => {
            const isSelected = selected?.target === 'local' && selected.customerId === customer.id;
            return (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      target: 'local',
                      customerId: customer.id,
                      displayName: customer.displayName,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-3 px-1 py-2 text-left ${
                    isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {customer.displayName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {[
                        formatMobile(customer.mobile) ?? customer.mobile,
                        customer.district,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {isSelected ? <Badge tone="success">✓</Badge> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Search across every centre, by the exact mobile number the citizen just gave.
 *
 * Exact ten digits, because that is all the platform-wide RPC accepts (migration 0024): a prefix
 * or name search here would be a directory of every citizen the product has ever served.
 */
function RoamingSearch({
  selected,
  onSelect,
}: {
  selected: PickedCustomer | null;
  onSelect: (picked: PickedCustomer) => void;
}) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState('');
  const [results, setResults] = useState<RoamingCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const accessRef = useRef(access);
  accessRef.current = access;

  /**
   * Whether this operator may actually write to the citizen right now.
   *
   * The search result cannot answer it: a masked card is returned to anyone who knows the
   * number, and access is a separate, per-user, time-boxed grant. So each card is checked
   * against the roaming access view, and the save button stays shut until that says yes.
   */
  const checkAccess = useCallback(async (customerId: string) => {
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming`);
      if (!response.ok) return;
      const json = (await response.json()) as { data: { state?: string; session?: unknown } };
      const live = json.data?.state === 'roaming_active' && Boolean(json.data?.session);
      setAccess((current) => ({ ...current, [customerId]: live }));
    } catch {
      // Left unknown, which reads as "no access" — the safe direction.
    }
  }, []);

  async function search() {
    const digits = mobile.replace(/\D+/g, '');
    if (!MOBILE_PATTERN.test(digits)) return;

    setSearching(true);
    try {
      const response = await fetch(`/api/customers/roaming/search?mobile=${digits}`);
      if (!response.ok) {
        setResults([]);
        return;
      }
      const json = (await response.json()) as { data: { customers: RoamingCard[] } };
      const customers = json.data?.customers ?? [];
      setResults(customers);
      await Promise.all(customers.map((card) => checkAccess(card.customerId)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{t('documentDrop.picker.roamingHint')}</p>

      <div className="flex gap-2">
        <Input
          value={mobile}
          inputMode="numeric"
          maxLength={10}
          onChange={(event) => setMobile(event.target.value.replace(/\D+/g, '').slice(0, 10))}
          placeholder={t('documentDrop.picker.roamingPlaceholder')}
          aria-label={t('documentDrop.picker.roamingLabel')}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!MOBILE_PATTERN.test(mobile) || searching}
          onClick={() => void search()}
        >
          {t('common.search')}
        </Button>
      </div>

      {searching ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : results === null ? null : results.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">{t('documentDrop.picker.roamingNoResults')}</p>
      ) : (
        <ul className="space-y-2">
          {results.map((card) => {
            const hasAccess = access[card.customerId] === true;
            const isSelected =
              selected?.target === 'roaming' && selected.customerId === card.customerId;

            return (
              <li
                key={card.customerId}
                className={`rounded-lg border p-3 ${
                  isSelected ? 'border-brand-300 bg-brand-50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {card.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[card.mobileLast4, card.district, card.state].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge tone={hasAccess ? 'success' : 'warning'}>
                    {t(
                      hasAccess
                        ? 'documentDrop.picker.roamingActive'
                        : 'documentDrop.picker.roamingLocked',
                    )}
                  </Badge>
                </div>

                {hasAccess ? (
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'secondary'}
                    className="mt-2"
                    onClick={() =>
                      onSelect({
                        target: 'roaming',
                        customerId: card.customerId,
                        displayName: card.displayName,
                      })
                    }
                  >
                    {isSelected ? '✓' : t('common.apply')}
                  </Button>
                ) : (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500">
                      {t('documentDrop.picker.roamingLockedHint')}
                    </p>
                    {/* Consent is asked for on the citizen's own card, where the purpose and the
                        duration are shown before an OTP is sent (§19.2). */}
                    <a
                      href={`/customers/${card.customerId}`}
                      className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                    >
                      {t('documentDrop.picker.roamingOpenCard')}
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {results !== null && results.length > 0 && Object.values(access).every((v) => !v) ? (
        <Alert tone="info">{t('documentDrop.picker.roamingLockedHint')}</Alert>
      ) : null}
    </div>
  );
}
