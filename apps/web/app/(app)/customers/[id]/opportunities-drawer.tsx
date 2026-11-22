'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import type { SchemeReportView } from '@/lib/schemes/view';
import { OpportunitiesIcon } from '../icons';
import { CustomerSchemesWidget } from './customer-schemes-widget';

/**
 * The scheme opportunities, kept off the page and opened on demand.
 *
 * A customer can match dozens of schemes. Inline, that list pushed the profile out of reach; as a
 * permanent sidebar it squeezed the profile. So the header carries a small button with the count
 * and fee potential — the number an operator needs at a glance — and the full list slides in from
 * the right over the page, closing with ✕, Escape, or a click on the dimmed page behind it.
 */
export function OpportunitiesDrawer({
  customerId,
  mobile,
  report,
  feePotential,
}: {
  customerId: string;
  /** Used only to build a `wa.me` link the operator clicks; never sent to our servers. */
  mobile: string | null;
  report: SchemeReportView;
  /** `report.totalPotentialFee`, already formatted on the server. */
  feePotential: string | null;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // Mounted only after hydration: the portal target is `document.body`.
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const count =
    report.activeOpportunities.length +
    report.upcomingOpportunities.length +
    report.actionableMissingDocs.length;

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // The page behind should not scroll while the drawer is in front of it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold shadow-sm transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          count > 0
            ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <OpportunitiesIcon className="h-4 w-4" />
        {count > 0
          ? t('customers.profile.opportunitiesButton', { count })
          : t('customers.profile.opportunitiesNone')}
        {count > 0 && feePotential ? (
          <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
            {t('customers.profile.opportunitiesUpTo', { amount: feePotential })}
          </span>
        ) : null}
      </button>

      {mounted
        ? createPortal(
            <div
              className={cn('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}
              aria-hidden={!open}
            >
              <div
                onClick={close}
                className={cn(
                  'absolute inset-0 bg-slate-900/40 transition-opacity duration-200',
                  open ? 'opacity-100' : 'opacity-0',
                )}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t('customers.profile.tabs.opportunities')}
                // `inert` while closed keeps the off-screen buttons out of the tab order.
                inert={!open}
                className={cn(
                  'absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-200 ease-out',
                  open ? 'translate-x-0' : 'translate-x-full',
                )}
              >
                <CustomerSchemesWidget
                  customerId={customerId}
                  mobile={mobile}
                  report={report}
                  headerAction={
                    <button
                      ref={closeRef}
                      type="button"
                      onClick={close}
                      aria-label={t('common.close')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  }
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
