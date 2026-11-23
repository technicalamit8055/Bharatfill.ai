import { Card } from '@assistigo/ui';
import type { Translator } from '@/lib/i18n';
import {
  durationParts,
  estimatedKeystrokesSaved,
  estimatedSecondsSaved,
  sparklineHeights,
} from '@/lib/dashboard/metrics';

/**
 * What the month's autofilling bought back.
 *
 * Every figure here is derived from one measured input — fields filled this month — and both
 * multipliers are documented placeholders in `lib/dashboard/metrics.ts`. The card says
 * "estimated" in its own title and again in the footnote, because master spec §8.6 forbids
 * presenting a modelled number as a measurement.
 *
 * There is no progress ring or target: nobody set one, and drawing progress against an invented
 * goal would be the same overclaim in a nicer shape. The sparkline scales against the busiest day
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

  const duration =
    hours > 0
      ? t('dashboard.durationHoursMinutes', { hours, minutes })
      : t('dashboard.durationMinutes', { minutes });

  const number = new Intl.NumberFormat('en-IN');

  return (
    <Card title={t('dashboard.productivityTitle')} description={t('dashboard.productivityHint')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Figure label={t('dashboard.timeSaved')} value={duration} />
        <Figure label={t('dashboard.keystrokesSaved')} value={number.format(keystrokes)} />
        <Figure
          label={t('dashboard.fieldsThisMonth')}
          value={number.format(fieldsFilledThisMonth)}
        />
        <Figure label={t('dashboard.fieldsToday')} value={number.format(today)} />
      </dl>

      {fieldsSeries.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div
            className="flex h-8 items-end gap-1"
            role="img"
            aria-label={t('dashboard.lastSevenDays')}
          >
            {sparklineHeights(fieldsSeries).map((height, index) => (
              <span
                key={index}
                className={`sparkline-bar ${index === fieldsSeries.length - 1 ? 'text-brand-600' : 'text-slate-200'}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{t('dashboard.lastSevenDays')}</p>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-snug text-slate-500">{t('dashboard.estimateFootnote')}</p>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold leading-none tabular-nums text-slate-900">
        {value}
      </dd>
    </div>
  );
}
