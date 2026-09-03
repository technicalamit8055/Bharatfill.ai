import { Card } from '@assistigo/ui';
import type { Translator } from '@/lib/i18n';
import {
  durationParts,
  estimatedKeystrokesSaved,
  estimatedSecondsSaved,
  sparklineHeights,
} from '@/lib/dashboard/metrics';
import { ClockIcon, KeyboardIcon, SparkIcon } from './icons';

const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

/**
 * What the month's autofilling bought back.
 *
 * Every figure here is derived from one measured input — fields filled this month — and both
 * multipliers are documented placeholders in `lib/dashboard/metrics.ts`. The card says
 * "estimated" in its own title and again in the footnote, because master spec §8.6 forbids
 * presenting a modelled number as a measurement.
 *
 * The ring is deliberately *not* a target: nobody set one, and drawing progress against an
 * invented goal would be the same overclaim in a nicer shape. It fills against the busiest day
 * in the seven-day window, which is a real number the operator can recognise.
 */
export function ProductivityWidget({
  fieldsFilledThisMonth,
  fieldsSeries,
  t,
}: {
  fieldsFilledThisMonth: number;
  /** Fields filled per IST day over the last seven days, oldest first. */
  fieldsSeries: readonly number[];
  t: Translator;
}) {
  const { hours, minutes } = durationParts(estimatedSecondsSaved(fieldsFilledThisMonth));
  const keystrokes = estimatedKeystrokesSaved(fieldsFilledThisMonth);

  const today = fieldsSeries[fieldsSeries.length - 1] ?? 0;
  const peak = fieldsSeries.reduce((max, value) => (value > max ? value : max), 0);
  const ringFraction = peak > 0 ? Math.min(1, today / peak) : 0;

  const duration =
    hours > 0
      ? t('dashboard.durationHoursMinutes', { hours, minutes })
      : t('dashboard.durationMinutes', { minutes });

  return (
    <Card
      className="animate-fade-in-up"
      title={t('dashboard.productivityTitle')}
      description={t('dashboard.productivityHint')}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              className="stroke-slate-100"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              stroke="url(#productivity-ring)"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringFraction)}
              className="transition-[stroke-dashoffset] duration-700"
            />
            <defs>
              <linearGradient id="productivity-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums leading-none text-slate-900">
              {today}
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.fieldsToday')}
            </span>
          </span>
        </div>

        <dl className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
              <ClockIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dd className="text-lg font-semibold leading-none tabular-nums text-slate-900">
                {duration}
              </dd>
              <dt className="mt-0.5 text-xs text-slate-500">{t('dashboard.timeSaved')}</dt>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
              <KeyboardIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dd className="text-lg font-semibold leading-none tabular-nums text-slate-900">
                {new Intl.NumberFormat('en-IN').format(keystrokes)}
              </dd>
              <dt className="mt-0.5 text-xs text-slate-500">{t('dashboard.keystrokesSaved')}</dt>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100">
              <SparkIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dd className="text-lg font-semibold leading-none tabular-nums text-slate-900">
                {new Intl.NumberFormat('en-IN').format(fieldsFilledThisMonth)}
              </dd>
              <dt className="mt-0.5 text-xs text-slate-500">{t('dashboard.fieldsThisMonth')}</dt>
            </div>
          </div>
        </dl>
      </div>

      {fieldsSeries.length > 0 ? (
        <div className="mt-4">
          <div
            className="flex h-10 items-end gap-1 text-emerald-400"
            role="img"
            aria-label={t('dashboard.lastSevenDays')}
          >
            {sparklineHeights(fieldsSeries).map((height, index) => (
              <span
                key={index}
                className="sparkline-bar"
                style={{
                  height: `${height}%`,
                  opacity: index === fieldsSeries.length - 1 ? 1 : 0.35,
                  animationDelay: `${index * 45}ms`,
                }}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{t('dashboard.lastSevenDays')}</p>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-snug text-slate-400">
        {t('dashboard.estimateFootnote')}
      </p>
    </Card>
  );
}
