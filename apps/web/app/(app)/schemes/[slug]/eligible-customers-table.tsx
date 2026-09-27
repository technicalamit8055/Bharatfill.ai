'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  Copy,
  EllipsisVertical,
  Eye,
  FilePlus2,
  Info,
  MessageCircle,
  Plus,
  Search,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { EmptyState, cn } from '@assistigo/ui';
import type { SchemeMatchStatus } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { whatsappLink } from '@/lib/schemes/view';
import { CustomerAvatar } from '../../customers/customer-avatar';

export type EligibleCustomerView = {
  id: string;
  customerCode: string;
  fullName: string;
  mobile: string | null;
  status: SchemeMatchStatus;
  ageAtCutoff: number | null;
  missing: string[];
  pitch: { en: string; hi: string };
};

const OUTLINE_BUTTON =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50';

const PRIMARY_BUTTON =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const ICON_BUTTON =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

/** Copy to the clipboard, and report success so the button can say "Copied" for a moment. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard permission can be refused; the table itself is still selectable.
    return false;
  }
}

/**
 * The centre's own customers who match this scheme.
 *
 * Outreach is one click *per customer*, on purpose. There is no "message everyone" button here:
 * bulk unsolicited messaging is the operator's legal exposure under DPDP consent rules, not
 * something the product should make frictionless, and an operator who knows the person is the
 * right check on whether the pitch is welcome. Copying the list is offered instead, so the
 * operator decides who to contact.
 *
 * The search only narrows rows the server already sent — it makes no request, so it cannot widen
 * what this page reveals.
 */
export function EligibleCustomersPanel({
  customers,
  canCreateCustomer,
  canStartApplication,
  notice,
  footnote,
}: {
  customers: EligibleCustomerView[];
  canCreateCustomer: boolean;
  canStartApplication: boolean;
  /** Shown above the table (the "opens in N days" pre-collect hint). */
  notice?: ReactNode;
  /** Shown under the table (the scan-limit warning). */
  footnote?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (customer) =>
        customer.fullName.toLocaleLowerCase().includes(needle) ||
        customer.customerCode.toLocaleLowerCase().includes(needle),
    );
  }, [customers, query]);

  const copyList = async () => {
    // Copies what is on screen, so a search narrows the list the operator takes away.
    const lines = visible.map((customer) =>
      [customer.fullName, customer.customerCode, customer.mobile ?? ''].filter(Boolean).join('\t'),
    );
    if (await copyText(lines.join('\n'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
          >
            <UsersRound size={24} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('schemes.eligibleCustomers')}
            </h2>
            <p className="text-sm text-slate-500">
              {t('schemes.eligibleCustomersHelp', { count: customers.length })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {customers.length > 0 ? (
            <>
              <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none">
                <span className="sr-only">{t('schemes.detail.searchLabel')}</span>
                <Search
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('schemes.detail.searchPlaceholder')}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <button
                type="button"
                onClick={() => void copyList()}
                disabled={visible.length === 0}
                className={OUTLINE_BUTTON}
              >
                <Copy size={17} strokeWidth={1.8} aria-hidden />
                <span aria-live="polite">
                  {copied ? t('schemes.listCopied') : t('schemes.copyList')}
                </span>
              </button>
            </>
          ) : null}
          {canCreateCustomer ? (
            <Link href="/customers/new" className={PRIMARY_BUTTON}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              {t('schemes.detail.addCustomer')}
            </Link>
          ) : null}
        </div>
      </div>

      {notice ? <div className="mt-4">{notice}</div> : null}

      {customers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={t('schemes.noEligibleCustomers')}
            description={t('schemes.noEligibleCustomersHelp')}
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t('customers.name')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('customers.code')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('schemes.customerAge')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('settings.status')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('schemes.outreach')}
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  {t('customers.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    {t('schemes.detail.noSearchResults', { query: query.trim() })}
                  </td>
                </tr>
              ) : (
                visible.map((customer) => {
                  const pitch = customer.pitch[locale];
                  const wa = customer.mobile ? whatsappLink(customer.mobile, pitch) : null;
                  return (
                    <tr key={customer.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-3 font-medium text-slate-900 hover:underline"
                        >
                          <CustomerAvatar id={customer.id} name={customer.fullName} />
                          {customer.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">{customer.customerCode}</td>
                      <td className="px-4 py-3.5 text-slate-600">{customer.ageAtCutoff ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <StatusCell customer={customer} t={t} />
                      </td>
                      <td className="px-4 py-3.5">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/60 py-1 pl-1 pr-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                          >
                            <span
                              aria-hidden
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"
                            >
                              <MessageCircle size={15} strokeWidth={2.2} />
                            </span>
                            {t('schemes.whatsappPitch')}
                          </a>
                        ) : (
                          <span className="text-sm text-slate-400">{t('schemes.noMobile')}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/customers/${customer.id}`}
                            aria-label={t('schemes.detail.viewCustomer', {
                              name: customer.fullName,
                            })}
                            title={t('common.view')}
                            className={cn(ICON_BUTTON, 'text-brand-600')}
                          >
                            <Eye size={17} strokeWidth={1.8} aria-hidden />
                          </Link>
                          <RowMenu
                            label={t('schemes.detail.moreActions', { name: customer.fullName })}
                            applicationHref={
                              canStartApplication
                                ? `/applications/new?customerId=${encodeURIComponent(customer.id)}`
                                : null
                            }
                            pitch={pitch}
                            t={t}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {footnote ? <div className="mt-3">{footnote}</div> : null}

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Info size={17} strokeWidth={1.8} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
        {t('schemes.verifyNotice')}
      </p>
    </section>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function StatusCell({ customer, t }: { customer: EligibleCustomerView; t: Translate }) {
  if (customer.status === 'eligible') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CircleCheck size={14} strokeWidth={2} aria-hidden />
        {t('schemes.statusEligible')}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <TriangleAlert size={14} strokeWidth={2} aria-hidden />
        {t('schemes.statusActionable')}
      </span>
      {customer.missing.length > 0 ? (
        <p className="text-xs text-slate-500">{customer.missing.join(', ')}</p>
      ) : null}
    </div>
  );
}

/**
 * The ⋮ menu on a row. Positioned `fixed` from the button's rectangle because the table scrolls
 * sideways on a narrow screen, and an absolutely placed menu would be clipped by that scroller.
 * Closes on a pick, an outside click, Escape, or any scroll or resize that would strand it.
 */
function RowMenu({
  label,
  applicationHref,
  pitch,
  t,
}: {
  label: string;
  applicationHref: string | null;
  pitch: string;
  t: Translate;
}) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        button.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (open || !button.current) {
      setPosition(null);
      return;
    }
    const rect = button.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  const copyPitch = async () => {
    if (await copyText(pitch)) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setPosition(null);
      }, 1200);
    }
  };

  const item =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none';

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={ICON_BUTTON}
      >
        <EllipsisVertical size={17} strokeWidth={1.8} aria-hidden />
      </button>
      {position ? (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          style={{ top: position.top, right: position.right }}
          className="fixed z-30 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {applicationHref ? (
            <Link
              href={applicationHref}
              role="menuitem"
              onClick={() => setPosition(null)}
              className={item}
            >
              <FilePlus2 size={16} strokeWidth={1.8} aria-hidden className="text-slate-500" />
              {t('schemes.detail.startApplication')}
            </Link>
          ) : null}
          <button type="button" role="menuitem" onClick={() => void copyPitch()} className={item}>
            <Copy size={16} strokeWidth={1.8} aria-hidden className="text-slate-500" />
            {copied ? t('schemes.pitchCopied') : t('schemes.copyPitch')}
          </button>
        </div>
      ) : null}
    </>
  );
}
