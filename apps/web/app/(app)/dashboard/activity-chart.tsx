'use client';

import { useId, useMemo, useState } from 'react';
import { Card } from '@assistigo/ui';
import { useI18n } from '@/lib/i18n/client';

export type ActivityMetric = 'fills' | 'fields' | 'customers' | 'documents';

const METRIC_ORDER: readonly ActivityMetric[] = ['fills', 'fields', 'customers', 'documents'];

/**
 * "This week": one column per IST day for the metric the operator picks.
 *
 * Built only from the seven-day series the page already loads for the stat cards, so it adds no
 * query and no personal data — every value is a count of things that happened on a day.
 *
 * Chart rules (dataviz skill): a single series in one brand hue, so no legend; columns capped at
 * 24px with a 4px rounded top and a square baseline; hairline gridlines on clean ticks; only
 * today's value is printed on its column, every other value is in the hover/focus tooltip and in
 * the screen-reader table below the plot.
 */
export function ActivityChart({
  dayKeys,
  series,
}: {
  /** IST calendar days as `YYYY-MM-DD`, oldest first; the last one is today. */
  dayKeys: readonly string[];
  /** One seven-day series per metric. A metric the viewer may not see is simply absent. */
  series: Partial<Record<ActivityMetric, readonly number[]>>;
}) {
  const { t, locale } = useI18n();
  const available = METRIC_ORDER.filter((metric) => series[metric] !== undefined);
  const [metric, setMetric] = useState<ActivityMetric>(available[0] ?? 'fills');
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  const values = series[metric] ?? [];
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = values.reduce((best, value) => (value > best ? value : best), 0);
  const busiestIndex = max > 0 ? values.indexOf(max) : -1;
  const { top, ticks } = niceScale(max);
  const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

  const { weekday, fullDate } = useMemo(() => {
    const tag = locale === 'hi' ? 'hi-IN' : 'en-IN';
    // The keys are calendar dates already resolved to IST, so they are read back as UTC dates:
    // formatting them in the browser's own zone could shift a day for an operator abroad.
    return {
      weekday: new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' }),
      fullDate: new Intl.DateTimeFormat(tag, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    };
  }, [locale]);

  const dayDate = (key: string) => new Date(`${key}T00:00:00Z`);
  const lastIndex = dayKeys.length - 1;
  const metricLabel = t(`dashboard.activity.metrics.${metric}`);

  if (available.length === 0) return null;

  return (
    <Card
      title={t('dashboard.activity.title')}
      description={t('dashboard.activity.hint')}
      actions={
        available.length > 1 ? (
          <div
            role="tablist"
            aria-label={t('dashboard.activity.metricPicker')}
            className="inline-flex flex-wrap rounded-md bg-slate-100 p-0.5"
          >
            {available.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={option === metric}
                aria-controls={tableId}
                onClick={() => {
                  setMetric(option);
                  setActive(null);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  option === metric
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(`dashboard.activity.metrics.${option}`)}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      <dl className="mb-5 grid grid-cols-3 gap-4 sm:max-w-md">
        <Summary label={t('dashboard.activity.total')} value={number.format(total)} />
        <Summary
          label={t('dashboard.activity.dailyAverage')}
          value={number.format(values.length > 0 ? total / values.length : 0)}
        />
        <Summary
          label={t('dashboard.activity.busiest')}
          value={
            busiestIndex >= 0 && dayKeys[busiestIndex]
              ? busiestIndex === lastIndex
                ? t('dashboard.activity.today')
                : weekday.format(dayDate(dayKeys[busiestIndex]))
              : '—'
          }
        />
      </dl>

      <div className="flex gap-2">
        {/* Y axis: clean ticks, right-aligned so the digits line up. */}
        <div
          aria-hidden
          className="relative h-44 w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-400"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {number.format(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden
                className={`absolute inset-x-0 h-px ${tick === 0 ? 'bg-slate-300' : 'bg-slate-100'}`}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}

            {max === 0 ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                {t('dashboard.activity.empty')}
              </p>
            ) : null}

            <div className="absolute inset-0 flex">
              {values.map((value, index) => {
                const key = dayKeys[index] ?? '';
                const height = top > 0 ? (value / top) * 100 : 0;
                const isActive = active === index;
                const isToday = index === lastIndex;
                return (
                  <button
                    key={key || index}
                    type="button"
                    // The whole day's slot is the hit target, not just the painted column.
                    className="group relative flex h-full flex-1 cursor-default items-end justify-center rounded-sm outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500"
                    onPointerEnter={() => setActive(index)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    aria-label={`${fullDate.format(dayDate(key))}: ${number.format(value)} ${metricLabel}`}
                    tabIndex={0}
                  >
                    <span
                      className={`relative w-full max-w-6 rounded-t transition-[height,background-color] duration-300 motion-reduce:transition-none ${
                        isActive ? 'bg-brand-700' : 'bg-brand-500'
                      }`}
                      style={{ height: value > 0 ? `max(${height}%, 3px)` : '0px' }}
                    >
                      {isToday && !isActive && value > 0 ? (
                        <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold text-slate-700">
                          {number.format(value)}
                        </span>
                      ) : null}
                    </span>

                    {isActive ? (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-left shadow-lg"
                        style={{ bottom: `calc(${height}% + 10px)`, left: '50%' }}
                      >
                        <span className="block text-sm font-semibold tabular-nums text-slate-900">
                          {number.format(value)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {metricLabel} · {fullDate.format(dayDate(key))}
                        </span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div aria-hidden className="mt-2 flex">
            {dayKeys.map((key, index) => (
              <span
                key={key}
                className={`flex-1 text-center text-xs ${
                  index === lastIndex ? 'font-medium text-slate-900' : 'text-slate-500'
                }`}
              >
                {index === lastIndex ? t('dashboard.activity.today') : weekday.format(dayDate(key))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The same numbers without hovering, for screen readers. */}
      <table id={tableId} className="sr-only">
        <caption>{t('dashboard.activity.tableCaption', { metric: metricLabel })}</caption>
        <tbody>
          {values.map((value, index) => (
            <tr key={dayKeys[index] ?? index}>
              <th scope="row">{dayKeys[index] ? fullDate.format(dayDate(dayKeys[index])) : ''}</th>
              <td>{number.format(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold leading-none text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * A y-axis top and evenly spaced ticks on a 1/2/5 step, at most five lines. Counts are whole
 * numbers, so the step never drops below 1.
 */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 4, ticks: [0, 2, 4] };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const factor = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  const step = Math.max(1, factor * magnitude);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return { top, ticks };
}
