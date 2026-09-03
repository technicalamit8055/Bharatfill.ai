import Link from 'next/link';
import { Badge, Card, EmptyState, type Tone } from '@assistigo/ui';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONE,
  formatIndianDate,
  formatInr,
  type ApplicationStatus,
} from '@assistigo/core';
import { localised, type Locale, type Translator } from '@/lib/i18n';
import { ArrowRightIcon, ClipboardIcon } from './icons';

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
  canCreate,
  locale,
  t,
}: {
  applications: PipelineApplicationView[];
  canCreate: boolean;
  locale: Locale;
  t: Translator;
}) {
  return (
    <Card
      className="animate-fade-in-up"
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
      {applications.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyApplications')}
          description={canCreate ? t('dashboard.emptyApplicationsHint') : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/applications/${application.id}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
                  <ClipboardIcon className="h-4 w-4" />
                </span>

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
                  className="mt-1.5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-500"
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
