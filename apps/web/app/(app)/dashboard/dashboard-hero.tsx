'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { greetingKey, istHour } from '@/lib/dashboard/metrics';
import { CustomerJumpSearch } from './customer-jump-search';
import { DocumentDropModal } from './document-drop-modal';
import { useExtensionInstalled } from './use-extension-installed';
import { CalendarIcon, ExtensionIcon, QrIcon } from './icons';

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
 * The hero command banner: who you are, what time the portals think it is, and the one box that
 * gets you to the person at the counter.
 *
 * A client component because it carries a running clock, which is also why the greeting is
 * re-derived from that clock — a dashboard left open past noon should stop saying "good morning"
 * rather than hold the greeting it was rendered with.
 */
export function DashboardHero({
  organizationName,
  place,
  initialGreeting,
  canSearchCustomers,
  canCreateCustomer,
  canOpenDocumentDrop,
  simulatorEnabled,
}: {
  organizationName: string;
  /** District/state line, already resolved server-side. Empty when the centre has not set one. */
  place: string | null;
  /**
   * The greeting the server rendered. Used until the clock mounts so the first client render
   * matches the server byte for byte — deriving it from the browser's clock instead would
   * mismatch on any page load that straddles noon or five o'clock.
   */
  initialGreeting: string;
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

  return (
    <section className="mesh-gradient-brand relative overflow-hidden rounded-2xl px-5 py-6 text-white shadow-lg shadow-brand-900/15 animate-fade-in-up sm:px-8 sm:py-7">
      {/*
        * The India Gate / tricolour artwork, anchored to the right edge behind the greeting.
        * Decorative only — empty alt, `aria-hidden` and `pointer-events-none` keep it out of
        * the reading order and out of the way of the search box that overlaps it.
        *
        * Hidden below `md`: at phone width the banner is barely wider than the text, and the
        * artwork would sit underneath it rather than beside it. The gradient carries the panel
        * on its own there.
        */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-3/4 select-none md:block"
      >
        <Image
          src="/dashboard/web-banner-hero.png"
          alt=""
          fill
          priority
          sizes="75vw"
          /*
           * `object-bottom` as well as right: the source is a 16:9 landscape sitting in a much
           * wider, shorter box, so a centred crop would cut the skyline off at the waist. The
           * horizon belongs at the foot of the banner.
           */
          className="object-cover object-right-bottom"
        />
        {/*
          * Feathers the artwork's left edge into the gradient so it reads as part of the panel
          * rather than a photo pasted on top, and keeps the headline legible where the two meet.
          */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-700 via-brand-700/55 to-transparent" />
      </div>

      <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-100">{greeting}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('dashboard.title')}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-brand-100">
            {t('dashboard.heroSubtitle', { org: organizationName })}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="glass-pill">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-live-pulse"
              />
              {/* Blank until the clock mounts, so no wrong time is ever shown. */}
              <span className="tabular-nums">{now ? IST_TIME.format(now) : '––:––'}</span>
              <span className="text-white/70">{t('dashboard.istLabel')}</span>
            </span>

            <span className="glass-pill">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{now ? dateFormat.format(now) : '—'}</span>
            </span>

            {place ? <span className="glass-pill">{place}</span> : null}

            <ExtensionBadge
              online={extensionOnline}
              label={t(
                extensionOnline ? 'dashboard.assistantOnline' : 'dashboard.assistantOffline',
              )}
            />
          </div>

          {/*
           * The walk-in drop, given its own row rather than a slot in the status pills above.
           * Those are read-outs; this is the first action of a walk-in, and the two to three
           * minutes per customer it removes are the reason it earns hero placement (§9.1).
           */}
          {canOpenDocumentDrop ? (
            <div className="mt-4">
              <DocumentDropModal
                simulatorEnabled={simulatorEnabled}
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/30">
                    <QrIcon className="h-4 w-4" />
                    {t('documentDrop.openButton')}
                  </span>
                }
              />
            </div>
          ) : null}
        </div>

        {canSearchCustomers ? (
          <div className="w-full max-w-md shrink-0">
            <CustomerJumpSearch canCreateCustomer={canCreateCustomer} />
          </div>
        ) : canCreateCustomer ? (
          <Link
            href="/customers/new"
            className="glass-pill shrink-0 px-4 py-2 text-sm transition-colors hover:bg-white/25"
          >
            {t('customers.new')}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Extension connectivity. Amber rather than red when offline: the extension not being installed
 * yet is a setup step, not a fault, and the checklist below already offers the fix.
 */
function ExtensionBadge({ online, label }: { online: boolean; label: string }) {
  return (
    <span
      className={`glass-pill ${online ? 'border-emerald-300/40 bg-emerald-400/20' : 'border-amber-200/40 bg-amber-300/20'}`}
    >
      <ExtensionIcon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
