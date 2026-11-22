'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Button, type Tone } from '@assistigo/ui';
import { formatInr } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import type { SchemeMatchView, SchemeReportView } from '@/lib/schemes/view';
import { whatsappLink } from '@/lib/schemes/view';
import {
  CopiedIcon,
  CopyIcon,
  EmptyListIcon,
  ForwardIcon,
  OpportunitiesIcon,
  PitchIcon,
} from '../icons';

/**
 * The upsell widget an operator sees the moment a walk-in customer's profile opens.
 *
 * A client component only because the tabs, the pitch language toggle and the copy button are
 * interactive — the matching itself already happened on the server, and this receives a plain
 * serialisable view model. It deliberately holds no raw customer record: just the name, the
 * mobile the operator needs to open WhatsApp on their own device, and the match results.
 *
 * The three tabs are the three conversations an operator can actually have: sell it now, collect
 * the papers before the rush, or issue the certificate that unlocks the rest.
 */

type Translate = (key: string, values?: Record<string, string | number>) => string;
type TabKey = 'active' | 'upcoming' | 'actionable';

/**
 * The one badge on the row that expires.
 *
 * An `active` scheme with no tracked end date deliberately says "check the notification" rather
 * than "open now": the built-in catalogue ships no dates, and a confident green badge would be
 * the app asserting a window nobody has verified.
 */
function LifecycleBadge({ match, t }: { match: SchemeMatchView; t: Translate }) {
  const closingLabel = (days: number): string =>
    days === 0
      ? t('schemes.closesToday')
      : t(days === 1 ? 'schemes.closesInDay' : 'schemes.closesInDays', { days });

  switch (match.lifecycleStatus) {
    case 'closing_soon': {
      const days = match.daysRemaining ?? 0;
      const tone: Tone = days <= 3 ? 'danger' : 'warning';
      return <Badge tone={tone}>{closingLabel(days)}</Badge>;
    }
    case 'upcoming': {
      const days = match.daysUntilOpen ?? 0;
      return (
        <Badge tone="info">
          {t(days === 1 ? 'schemes.opensInDay' : 'schemes.opensInDays', { days })}
        </Badge>
      );
    }
    case 'evergreen':
      return <Badge tone="neutral">{t('schemes.openAllYear')}</Badge>;
    case 'active':
      return match.daysRemaining === null ? (
        <Badge tone="neutral">{t('schemes.windowUnconfirmed')}</Badge>
      ) : (
        <Badge tone="info">{closingLabel(match.daysRemaining)}</Badge>
      );
    default:
      return null;
  }
}

function CheckIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-emerald-600"
      aria-hidden
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-amber-500"
      aria-hidden
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function SchemeRow({
  match,
  customerId,
  mobile,
  locale,
  t,
}: {
  match: SchemeMatchView;
  customerId: string;
  mobile: string | null;
  locale: 'en' | 'hi';
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);
  const upcoming = match.lifecycleStatus === 'upcoming';
  // An upcoming scheme sends the pre-collect list; an open one sends the pitch to apply now.
  const wa = mobile ? whatsappLink(mobile, match.outreachMessage[locale]) : null;
  const missingDocs = match.documentChecklist.filter((item) => item.state !== 'ready').length;
  const detailsId = `scheme-details-${match.slug}`;

  // Compact by default: what an operator decides on (name, benefit, window, fee, what is
  // missing) and the buttons stay visible; the description and the full checklist fold away.
  return (
    <li className="rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{match.title}</h3>
        <Badge tone="success" className="shrink-0">
          {match.benefitHighlight}
        </Badge>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <LifecycleBadge match={match} t={t} />
        <span>{t('schemes.feeLabel', { amount: formatInr(match.estimatedFee) ?? '—' })}</span>
        {missingDocs > 0 ? (
          <span className="text-amber-700">
            {t('schemes.docsMissingShort', { count: missingDocs })}
          </span>
        ) : null}
      </div>

      {match.missingRequirements.length > 0 ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {t('schemes.unlockWith', {
            items: match.missingRequirements.map((requirement) => requirement.label).join(', '),
          })}
        </p>
      ) : null}

      {expanded ? (
        <div id={detailsId} className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          <p className="text-xs text-slate-600">{match.shortDescription}</p>
          <p className="text-xs text-slate-500">
            {match.portalName}
            {match.appliedRelaxationYears > 0 ? (
              <span className="text-emerald-700">
                {' · '}
                {t('schemes.relaxationApplied', { years: match.appliedRelaxationYears })}
              </span>
            ) : null}
          </p>
          {match.documentChecklist.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {match.documentChecklist.map((item) => (
                <li
                  key={item.key}
                  className={`flex items-center gap-1 text-xs ${
                    item.state === 'ready' ? 'text-slate-600' : 'text-amber-700'
                  }`}
                >
                  <CheckIcon ok={item.state === 'ready'} />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`/schemes/${match.slug}?customer=${customerId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            {t('schemes.viewDetails')}
            <ForwardIcon className="h-3 w-3" />
          </Link>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {/* Nothing here submits anything. "Apply now" opens the government form for the operator
            to fill and submit by hand (master spec §14.6), and an unopened window has no form to
            open yet — so it offers the document run instead. */}
        {upcoming ? null : (
          <Link href={match.applyHref}>
            <Button size="sm" variant={match.status === 'eligible' ? 'primary' : 'secondary'}>
              {t('schemes.applyNow')}
            </Button>
          </Link>
        )}
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant={upcoming ? 'primary' : 'ghost'}>
              {t(upcoming ? 'schemes.preCollectDocuments' : 'schemes.whatsappPitch')}
            </Button>
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {expanded ? t('schemes.showLess') : t('schemes.showMore')}
        </button>
      </div>
    </li>
  );
}

export function CustomerSchemesWidget({
  customerId,
  mobile,
  report,
  headerAction,
}: {
  customerId: string;
  /** Used only to build a `wa.me` link the operator clicks; never sent to our servers. */
  mobile: string | null;
  report: SchemeReportView;
  /** Rendered at the right of the heading — the drawer's close button. */
  headerAction?: ReactNode;
}) {
  const { t, locale } = useI18n();

  const tabs = useMemo(
    () =>
      [
        { key: 'active' as const, rows: report.activeOpportunities },
        { key: 'upcoming' as const, rows: report.upcomingOpportunities },
        { key: 'actionable' as const, rows: report.actionableMissingDocs },
      ] satisfies { key: TabKey; rows: SchemeMatchView[] }[],
    [report],
  );

  // Open on the first tab that has something in it, so the operator never lands on "nothing here".
  const [tab, setTab] = useState<TabKey>(
    () => tabs.find((entry) => entry.rows.length > 0)?.key ?? 'active',
  );
  const [pitchLocale, setPitchLocale] = useState<'en' | 'hi'>(locale);
  const [copied, setCopied] = useState(false);

  const rows = tabs.find((entry) => entry.key === tab)?.rows ?? [];
  const opportunityCount = tabs.reduce((sum, entry) => sum + entry.rows.length, 0);

  const pitchText = useMemo(
    () => report.topPitchScript?.[pitchLocale] ?? null,
    [report.topPitchScript, pitchLocale],
  );

  const copyPitch = async () => {
    if (!pitchText) return;
    try {
      await navigator.clipboard.writeText(pitchText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A blocked clipboard is not worth an error banner — the operator can select the text.
    }
  };

  if (opportunityCount === 0) {
    return (
      <WidgetShell>
        <WidgetHeading
          title={t('schemes.widgetTitle')}
          browseLabel={t('schemes.browseAll')}
          action={headerAction}
        />
        <TabEmpty title={t('schemes.noneEligible')} description={t('schemes.noneEligibleHelp')} />
      </WidgetShell>
    );
  }

  const TAB_LABELS: Record<TabKey, string> = {
    active: t('schemes.tabActive', { count: report.activeOpportunities.length }),
    upcoming: t('schemes.tabUpcoming', { count: report.upcomingOpportunities.length }),
    actionable: t('schemes.tabActionable', { count: report.actionableMissingDocs.length }),
  };

  const TAB_SHORT: Record<TabKey, string> = {
    active: t('schemes.tabActiveShort'),
    upcoming: t('schemes.tabUpcomingShort'),
    actionable: t('schemes.tabActionableShort'),
  };

  const TAB_EMPTY: Record<TabKey, { title: string; description?: string }> = {
    active: { title: t('schemes.tabActiveEmpty'), description: t('schemes.tabActiveEmptyHelp') },
    upcoming: { title: t('schemes.tabUpcomingEmpty') },
    actionable: { title: t('schemes.tabActionableEmpty') },
  };

  return (
    <WidgetShell>
      <WidgetHeading
        action={headerAction}
        browseLabel={t('schemes.browseAll')}
        title={t('schemes.opportunityCount', { count: opportunityCount })}
        subtitle={t('schemes.feePotential', {
          amount: formatInr(report.totalPotentialFee) ?? '—',
        })}
      />

      {pitchText ? (
        <div className="mt-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 via-sky-50 to-sky-100/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
              <PitchIcon className="h-4 w-4" />
              {t('schemes.pitchLabel')}
            </span>
            <div
              role="group"
              aria-label={t('schemes.pitchLanguage')}
              className="flex items-center gap-1"
            >
              {(['hi', 'en'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPitchLocale(option)}
                  aria-pressed={pitchLocale === option}
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                    pitchLocale === option
                      ? 'bg-brand-600 text-white'
                      : 'text-brand-700 hover:bg-white/70'
                  }`}
                >
                  {option === 'hi' ? 'हिंदी' : 'EN'}
                </button>
              ))}
            </div>
          </div>
          <p lang={pitchLocale} className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
            “{pitchText}”
          </p>
          <button
            type="button"
            onClick={copyPitch}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            {copied ? <CopiedIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {copied ? t('schemes.pitchCopied') : t('schemes.copyPitch')}
          </button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label={t('schemes.widgetTitle')}
        className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {tabs.map(({ key, rows: tabRows }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            title={TAB_LABELS[key]}
            onClick={() => setTab(key)}
            className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              tab === key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="truncate">{TAB_SHORT[key]}</span>
            <span
              className={`rounded-full px-1.5 leading-5 ${
                tab === key ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-slate-500'
              }`}
            >
              {tabRows.length}
            </span>
          </button>
        ))}
      </div>

      {/* The only part that scrolls: in the sidebar the heading, pitch and tabs stay put while
          the list moves under them. */}
      <div className="-mx-5 mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-1">
        {rows.length === 0 ? (
          <TabEmpty title={TAB_EMPTY[tab].title} description={TAB_EMPTY[tab].description} />
        ) : (
          <ul className="space-y-2">
            {rows.map((match) => (
              <SchemeRow
                key={match.slug}
                match={match}
                customerId={customerId}
                mobile={mobile}
                locale={pitchLocale}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>

      {mobile ? null : <p className="mt-2 text-xs text-slate-400">{t('schemes.noMobile')}</p>}
      <p className="mt-2 text-xs text-slate-400">{t('schemes.verifyNotice')}</p>
    </WidgetShell>
  );
}

function WidgetShell({ children }: { children: ReactNode }) {
  return <section className="flex h-full min-h-0 flex-1 flex-col p-5">{children}</section>;
}

function WidgetHeading({
  title,
  subtitle,
  browseLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  browseLabel: string;
  action?: ReactNode;
}) {
  return (
    <div className="-mx-5 -mt-5 flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <OpportunitiesIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/schemes"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          {browseLabel}
          <ForwardIcon className="h-3.5 w-3.5" />
        </Link>
        {action}
      </div>
    </div>
  );
}

function TabEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <EmptyListIcon className="h-10 w-10 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}
