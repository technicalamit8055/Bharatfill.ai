'use client';

import { useMemo, useState } from 'react';
import { Card } from '@assistigo/ui';
import { useI18n } from '@/lib/i18n/client';

/**
 * Sequential scale (dataviz skill): one hue, light to dark, with an empty hour in neutral grey so
 * "nothing happened" never reads as a pale value. Four steps keep each level tellable apart.
 */
// Validated with the skill's ordinal check: monotone lightness, visible step gaps, and the
// lightest step clears the white card at 2:1.
const LEVELS = ['bg-slate-100', 'bg-brand-400', 'bg-brand-500', 'bg-brand-700', 'bg-brand-900'];

/** The working day every centre shows; an earlier or later fill widens it, never narrows it. */
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 20;

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}

/**
 * When the counter is busiest: fill sessions per IST hour over the last seven days.
 *
 * Built from the fill-session timestamps the page already loads for the weekly chart — counts per
 * hour, nothing about who. Useful at the counter for knowing when to expect the queue, and for a
 * centre owner deciding when a second operator is worth it.
 *
 * Each cell carries its own hover tooltip; the screen-reader table holds every value, so the
 * tooltip enhances and never gates.
 */
export function PeakHoursHeatmap({
  dayKeys,
  grid,
}: {
  /** IST days as `YYYY-MM-DD`, oldest first; the last one is today. */
  dayKeys: readonly string[];
  /** `grid[day][hour]`, hours 0–23 IST, rows in `dayKeys` order. */
  grid: readonly (readonly number[])[];
}) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);

  const { firstHour, lastHour, max, total, busiestHour } = useMemo(() => {
    let first = DEFAULT_FIRST_HOUR;
    let last = DEFAULT_LAST_HOUR;
    let peak = 0;
    let sum = 0;
    const byHour = new Array<number>(24).fill(0);
    grid.forEach((hours) =>
      hours.forEach((value, hour) => {
        if (value <= 0) return;
        first = Math.min(first, hour);
        last = Math.max(last, hour);
        peak = Math.max(peak, value);
        sum += value;
        byHour[hour] = (byHour[hour] ?? 0) + value;
      }),
    );
    const topHour = sum > 0 ? byHour.indexOf(Math.max(...byHour)) : -1;
    return { firstHour: first, lastHour: last, max: peak, total: sum, busiestHour: topHour };
  }, [grid]);

  const tag = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const formats = useMemo(
    () => ({
      hour: new Intl.DateTimeFormat(tag, { hour: 'numeric', hour12: true, timeZone: 'UTC' }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' }),
      date: new Intl.DateTimeFormat(tag, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    }),
    [tag],
  );

  const hourLabel = (hour: number) => formats.hour.format(Date.UTC(2000, 0, 1, hour));
  const hourRange = (hour: number) => `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
  const dayDate = (key: string) => new Date(`${key}T00:00:00Z`);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const lastDay = dayKeys.length - 1;
  const dayLabel = (index: number) =>
    index === lastDay
      ? t('dashboard.activity.today')
      : formats.weekday.format(dayDate(dayKeys[index] ?? ''));

  return (
    <Card
      title={t('dashboard.peakHours.title')}
      description={t('dashboard.peakHours.hint')}
      actions={
        busiestHour >= 0 ? (
          <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">
            {t('dashboard.peakHours.busiest', { range: hourRange(busiestHour) })}
          </span>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="mb-3 text-sm text-slate-500">{t('dashboard.peakHours.empty')}</p>
      ) : null}

      {/* No scroll wrapper: it would clip the tooltips above the top row. The cells flex down
          to phone width instead. */}
      <div>
        <div onPointerLeave={() => setActive(null)}>
          {dayKeys.map((key, day) => (
            <div key={key} className="flex items-center gap-2 py-px">
              <span
                aria-hidden
                className={`w-10 shrink-0 text-xs ${day === lastDay ? 'font-medium text-slate-900' : 'text-slate-500'}`}
              >
                {dayLabel(day)}
              </span>
              <div className="flex flex-1 gap-0.5">
                {hours.map((hour) => {
                  const value = grid[day]?.[hour] ?? 0;
                  const isActive = active?.day === day && active.hour === hour;
                  return (
                    <span
                      key={hour}
                      aria-hidden
                      onPointerEnter={() => setActive({ day, hour })}
                      className={`relative h-6 flex-1 rounded-[3px] transition-shadow ${LEVELS[levelFor(value, max)]} ${
                        isActive ? 'ring-2 ring-slate-900/70 ring-offset-1' : ''
                      }`}
                    >
                      {isActive ? (
                        <span
                          role="tooltip"
                          className={`pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-left shadow-lg ${
                            hour - firstHour > hours.length / 2 ? 'right-0' : 'left-0'
                          }`}
                        >
                          <span className="block text-sm font-semibold tabular-nums text-slate-900">
                            {t(
                              value === 1
                                ? 'dashboard.peakHours.fillsOne'
                                : 'dashboard.peakHours.fills',
                              { count: value },
                            )}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formats.date.format(dayDate(key))} · {hourRange(hour)}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Hour axis: every other hour, so the labels never collide. */}
          <div aria-hidden className="mt-1.5 flex gap-2">
            <span className="w-10 shrink-0" />
            <div className="flex flex-1 gap-0.5">
              {hours.map((hour, index) => (
                <span key={hour} className="flex-1 text-[11px] text-slate-400">
                  {index % 2 === 0 ? hourLabel(hour) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="mt-3 flex items-center justify-end gap-1.5 text-xs text-slate-500"
      >
        {t('dashboard.peakHours.less')}
        {LEVELS.map((level) => (
          <span key={level} className={`h-3 w-3 rounded-[3px] ${level}`} />
        ))}
        {t('dashboard.peakHours.more')}
      </div>

      <table className="sr-only">
        <caption>{t('dashboard.peakHours.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('dashboard.peakHours.dayColumn')}</th>
            {hours.map((hour) => (
              <th key={hour} scope="col">
                {hourRange(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dayKeys.map((key, day) => (
            <tr key={key}>
              <th scope="row">{formats.date.format(dayDate(key))}</th>
              {hours.map((hour) => (
                <td key={hour}>{grid[day]?.[hour] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
