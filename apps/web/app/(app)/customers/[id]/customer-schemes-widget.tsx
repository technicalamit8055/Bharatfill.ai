'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, EmptyState, type Tone } from '@assistigo/ui';
import { formatInr } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import type { SchemeMatchView, SchemeReportView } from '@/lib/schemes/view';
import { whatsappLink } from '@/lib/schemes/view';

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
  const upcoming = match.lifecycleStatus === 'upcoming';
  // An upcoming scheme sends the pre-collect list; an open one sends the pitch to apply now.
  const wa = mobile ? whatsappLink(mobile, match.outreachMessage[locale]) : null;

  return (
    <li className="rounded-lg border border-slate-200 p-3 transition-colors hover:border-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{match.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{match.shortDescription}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <LifecycleBadge match={match} t={t} />
          <Badge tone="success">{match.benefitHighlight}</Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{match.portalName}</span>
        <span aria-hidden>·</span>
        <span>{t('schemes.feeLabel', { amount: formatInr(match.estimatedFee) ?? '—' })}</span>
        {match.appliedRelaxationYears > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="text-emerald-700">
              {t('schemes.relaxationApplied', { years: match.appliedRelaxationYears })}
            </span>
          </>
        ) : null}
      </div>

      {match.documentChecklist.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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

      {match.missingRequirements.length > 0 ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {t('schemes.unlockWith', {
            items: match.missingRequirements.map((requirement) => requirement.label).join(', '),
          })}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
        ) : (
          <span className="text-xs text-slate-400">{t('schemes.noMobile')}</span>
        )}
        <Link
          href={`/schemes/${match.slug}?customer=${customerId}`}
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          {t('schemes.viewDetails')}
        </Link>
      </div>
    </li>
  );
}

export function CustomerSchemesWidget({
  customerId,
  mobile,
  report,
}: {
  customerId: string;
  /** Used only to build a `wa.me` link the operator clicks; never sent to our servers. */
  mobile: string | null;
  report: SchemeReportView;
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
      <Card title={t('schemes.widgetTitle')}>
        <EmptyState title={t('schemes.noneEligible')} description={t('schemes.noneEligibleHelp')} />
      </Card>
    );
  }

  const TAB_LABELS: Record<TabKey, string> = {
    active: t('schemes.tabActive', { count: report.activeOpportunities.length }),
    upcoming: t('schemes.tabUpcoming', { count: report.upcomingOpportunities.length }),
    actionable: t('schemes.tabActionable', { count: report.actionableMissingDocs.length }),
  };

  const TAB_EMPTY: Record<TabKey, string> = {
    active: t('schemes.tabActiveEmpty'),
    upcoming: t('schemes.tabUpcomingEmpty'),
    actionable: t('schemes.tabActionableEmpty'),
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {t('schemes.opportunityCount', { count: opportunityCount })}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('schemes.feePotential', {
              amount: formatInr(report.totalPotentialFee) ?? '—',
            })}
          </p>
        </div>
        <Link href="/schemes" className="text-xs text-brand-700 underline-offset-2 hover:underline">
          {t('schemes.browseAll')}
        </Link>
      </div>

      {pitchText ? (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-800">
              {t('schemes.pitchLabel')}
            </span>
            <div className="flex items-center gap-1">
              {(['hi', 'en'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPitchLocale(option)}
                  aria-pressed={pitchLocale === option}
                  className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                    pitchLocale === option
                      ? 'bg-brand-600 text-white'
                      : 'text-brand-800 hover:bg-brand-100'
                  }`}
                >
                  {option === 'hi' ? 'हिंदी' : 'EN'}
                </button>
              ))}
            </div>
          </div>
          <p lang={pitchLocale} className="mt-1.5 text-sm leading-relaxed text-slate-800">
            “{pitchText}”
          </p>
          <button
            type="button"
            onClick={copyPitch}
            className="mt-2 text-xs text-brand-700 underline-offset-2 hover:underline"
          >
            {copied ? t('schemes.pitchCopied') : t('schemes.copyPitch')}
          </button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label={t('schemes.widgetTitle')}
        className="mt-4 flex flex-wrap gap-1 border-b border-slate-200"
      >
        {tabs.map(({ key }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === key
                ? 'border-brand-600 font-medium text-brand-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{TAB_EMPTY[tab]}</p>
      ) : (
        <ul className="mt-3 space-y-2">
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

      <p className="mt-3 text-xs text-slate-400">{t('schemes.verifyNotice')}</p>
    </Card>
  );
}
