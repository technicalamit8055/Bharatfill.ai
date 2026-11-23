'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { greetingKey, istHour } from '@/lib/dashboard/metrics';
import { CustomerJumpSearch } from './customer-jump-search';
import { DocumentDropModal } from './document-drop-modal';
import { useExtensionInstalled } from './use-extension-installed';
import { DashboardShortcuts } from './keyboard-shortcuts';
import { QrIcon } from './icons';

/**
 * IST rather than the browser's zone, for both formatters below: every centre this serves is in
 * India, and an operator whose laptop clock is set wrong should still see the time the portals
 * run on. Digits stay Latin in Hindi too — an operator reads a clock, they do not parse it.
 */
const IST_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function istDateFormatter(locale: 'en' | 'hi'): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The dashboard's page header: the centre, the date and time the portals run on, whether the
 * extension is connected, and the two ways to reach the person at the counter (search, walk-in
 * drop).
 *
 * A title row on the page background rather than a banner: an operator opens this screen
 * dozens of times a day, and the numbers below are what they came for. The greeting is the one
 * personal touch, and it follows the IST clock, so a dashboard left open past noon stops saying
 * "good morning".
 *
 * A client component because it carries a running clock, the extension probe and the keyboard
 * shortcuts.
 */
export function DashboardHero({
  operatorFirstName,
  initialGreeting,
  organizationName,
  place,
  canSearchCustomers,
  canCreateCustomer,
  canOpenDocumentDrop,
  simulatorEnabled,
}: {
  /** The signed-in operator's first name, or null when only an email is on file. */
  operatorFirstName: string | null;
  /**
   * The greeting the server rendered, used until the clock mounts so the first client render
   * matches the server's byte for byte.
   */
  initialGreeting: string;
  organizationName: string;
  /** District/state line, already resolved server-side. Empty when the centre has not set one. */
  place: string | null;
  canSearchCustomers: boolean;
  canCreateCustomer: boolean;
  /** `document.upload` — opening a drop session is bringing documents into the organization. */
  canOpenDocumentDrop: boolean;
  /** False in production, where the simulator route returns 404 (§32.1). */
  simulatorEnabled: boolean;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  const extensionOnline = useExtensionInstalled();

  useEffect(() => {
    // Starts null and fills in after mount: rendering a clock during SSR would hydrate with a
    // mismatched minute and log a React error on every page load.
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // Rebuilt only when the language changes: an Intl formatter is not cheap, and this component
  // re-renders every fifteen seconds.
  const dateFormat = useMemo(() => istDateFormatter(locale), [locale]);

  const greeting = now ? t(greetingKey(istHour(now))) : initialGreeting;
  const title = operatorFirstName
    ? t('dashboard.greetingWithName', { greeting, name: operatorFirstName })
    : greeting;

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{organizationName}</span>
          {place ? (
            <>
              <Separator />
              <span>{place}</span>
            </>
          ) : null}
          <Separator />
          {/* Blank until the clock mounts, so no wrong date or time is ever shown. */}
          <span>{now ? dateFormat.format(now) : '—'}</span>
          <Separator />
          <span className="tabular-nums">
            {now ? IST_TIME.format(now) : '––:––'} {t('dashboard.istLabel')}
          </span>
          <Separator />
          <ExtensionStatus
            online={extensionOnline}
            label={`${t('dashboard.extensionStatus')}: ${t(
              extensionOnline ? 'dashboard.extensionConnected' : 'dashboard.extensionNotConnected',
            )}`}
          />
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {canSearchCustomers ? (
          <div className="w-full sm:w-80">
            <CustomerJumpSearch canCreateCustomer={canCreateCustomer} />
          </div>
        ) : canCreateCustomer ? (
          <Link href="/customers/new" className={SECONDARY_BUTTON}>
            {t('customers.new')}
          </Link>
        ) : null}

        {/*
         * The walk-in drop sits beside the search: it is the first action of a walk-in, and the
         * two to three minutes per customer it removes are why it earns header placement (§9.1).
         */}
        {canOpenDocumentDrop ? (
          <DocumentDropModal
            simulatorEnabled={simulatorEnabled}
            trigger={
              <span className={SECONDARY_BUTTON}>
                <QrIcon className="h-4 w-4 text-slate-500" />
                {t('documentDrop.openButton')}
              </span>
            }
          />
        ) : null}

        <DashboardShortcuts
          canSearchCustomers={canSearchCustomers}
          canCreateCustomer={canCreateCustomer}
          canOpenDocumentDrop={canOpenDocumentDrop}
        />
      </div>
    </header>
  );
}

const SECONDARY_BUTTON =
  'inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50';

function Separator() {
  return (
    <span aria-hidden className="text-slate-300">
      ·
    </span>
  );
}

/**
 * Extension connectivity. Amber rather than red when offline: the extension not being installed
 * yet is a setup step, not a fault, and the checklist below already offers the fix.
 */
function ExtensionStatus({ online, label }: { online: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {label}
    </span>
  );
}
