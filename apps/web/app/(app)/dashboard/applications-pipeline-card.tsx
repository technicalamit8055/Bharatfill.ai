import Link from 'next/link';
import { Badge, Card, EmptyState, type Tone } from '@assistigo/ui';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONE,
  formatIndianDate,
  formatInr,
  OPEN_STATUSES,
  type ApplicationStatus,
} from '@assistigo/core';
import { localised, type Locale, type Translator } from '@/lib/i18n';
import { ArrowRightIcon } from './icons';

export type PipelineApplicationView = {
  id: string;
  title: string;
  status: ApplicationStatus;
  portalName: string | null;
  customerName: string | null;
  deadlineOn: string | null;
  amountCharged: number | null;
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | null;
};

const PAYMENT_TONE: Record<string, Tone> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'neutral',
};

/**
 * The applications in flight, newest first.
 *
 * Status and fee state sit on the same row on purpose: the two questions a customer asks when
 * they walk back in are "is it submitted?" and "did I pay?", and an operator who has to open the
 * application to answer either has lost the walk-in's patience.
 */
export function ApplicationsPipelineCard({
  applications,
  stageCounts,
  canCreate,
  locale,
  t,
}: {
  applications: PipelineApplicationView[];
  /** Every open application in the organization by status, not just the five listed. */
  stageCounts: Partial<Record<ApplicationStatus, number>>;
  canCreate: boolean;
  locale: Locale;
  t: Translator;
}) {
  return (
    <Card
      title={t('dashboard.pipelineTitle')}
      description={t('dashboard.pipelineHint')}
      actions={
        <Link
          href="/applications?filter=open"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          {t('dashboard.viewAll')}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <StageBar counts={stageCounts} locale={locale} t={t} />

      {applications.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyApplications')}
          description={canCreate ? t('dashboard.emptyApplicationsHint') : undefined}
        />
      ) : (
        <ul className="-my-1 divide-y divide-slate-100">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/applications/${application.id}`}
                className="group -mx-5 flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {application.title}
                    </span>
                    <Badge tone={APPLICATION_STATUS_TONE[application.status]}>
                      {localised(APPLICATION_STATUS_LABELS[application.status], locale)}
                    </Badge>
                    {application.paymentStatus ? (
                      <Badge tone={PAYMENT_TONE[application.paymentStatus] ?? 'neutral'}>
                        {t(`applications.payment.${application.paymentStatus}`)}
                        {application.amountCharged !== null
                          ? ` · ${formatInr(application.amountCharged) ?? ''}`
                          : ''}
                      </Badge>
                    ) : null}
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {application.customerName ? <span>{application.customerName}</span> : null}
                    {application.portalName ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{application.portalName}</span>
                      </>
                    ) : null}
                    {application.deadlineOn ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-amber-700">
                          {t('dashboard.pipelineDeadline', {
                            date:
                              formatIndianDate(application.deadlineOn) ?? application.deadlineOn,
                          })}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
                >
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Ordered stages, so a sequential scale (dataviz skill): one hue getting darker as an
 * application moves towards the portal. Every stage is also named, with its count, in the legend.
 */
// Six evenly spaced OKLCH steps of the brand hue (L 0.68 → 0.30). The Tailwind brand scale has
// no six steps far enough apart; these pass the skill's ordinal check (monotone, every gap
// >= 0.06 L, lightest step 2.9:1 on white).
const STAGE_FILL: Record<string, string> = {
  draft: 'bg-[#5c94ff]',
  pending_documents: 'bg-[#487de2]',
  ready_to_fill: 'bg-[#3566c5]',
  filled: 'bg-[#2250a9]',
  submitted: 'bg-[#0f3a8d]',
  pending_followup: 'bg-[#002472]',
};

/**
 * Where the open work is sitting: one bar split by stage, widths proportional to counts.
 *
 * A thin segmented bar carries no text of its own; the legend under it names each stage with its
 * count, and each segment's tooltip repeats both, so nothing depends on telling blues apart.
 */
function StageBar({
  counts,
  locale,
  t,
}: {
  counts: Partial<Record<ApplicationStatus, number>>;
  locale: Locale;
  t: Translator;
}) {
  const stages = OPEN_STATUSES.map((status) => ({
    status,
    count: counts[status] ?? 0,
    label: localised(APPLICATION_STATUS_LABELS[status], locale),
  }));
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  if (total === 0) return null;

  return (
    <div className="mb-4 border-b border-slate-100 pb-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-slate-600">{t('dashboard.pipelineStages')}</p>
        <p className="text-xs text-slate-500">
          {t('dashboard.pipelineStagesTotal', { count: total })}
        </p>
      </div>

      <div
        role="img"
        aria-label={stages
          .filter((stage) => stage.count > 0)
          .map((stage) => `${stage.label}: ${stage.count}`)
          .join(', ')}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {stages
          .filter((stage) => stage.count > 0)
          .map((stage) => (
            <span
              key={stage.status}
              title={`${stage.label}: ${stage.count}`}
              className={`${STAGE_FILL[stage.status] ?? 'bg-brand-500'} transition-opacity hover:opacity-80`}
              style={{ width: `${(stage.count / total) * 100}%` }}
            />
          ))}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {stages.map((stage) => (
          <li key={stage.status} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-sm ${STAGE_FILL[stage.status] ?? 'bg-brand-500'}`}
            />
            {stage.label}
            <span className="font-semibold tabular-nums text-slate-900">{stage.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
