import Link from 'next/link';
import type { ReactNode } from 'react';
import { sparklineHeights } from '@/lib/dashboard/metrics';
import { TrendDownIcon, TrendUpIcon } from './icons';

export type StatTrend = {
  /** Rendered next to the arrow, e.g. "+40% vs 7-day average". Already localised. */
  label: string;
  direction: 'up' | 'down' | 'flat';
};

/**
 * One dashboard number: label, value, then a trend or a hint, and a seven-day sparkline where the
 * metric has a daily history.
 *
 * Every card looks the same on purpose. Colour is kept for meaning: `attention` turns the value
 * amber when the number is work waiting for the operator, and the trend line is green or red only
 * because it says which way the day is going.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  attention = false,
  href,
  series,
  seriesLabel,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** A small glyph naming the metric. Every card wears the same chip; only `attention` recolours it. */
  icon?: ReactNode;
  /** The value is something waiting on the operator (e.g. reviews pending). */
  attention?: boolean;
  href?: string;
  /** Seven real daily counts, oldest first. Omitted when the metric has no daily history. */
  series?: readonly number[];
  /** Accessible description of the sparkline, e.g. "Last 7 days". */
  seriesLabel?: string;
  trend?: StatTrend | null;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-600">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${
              attention ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'
            }`}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p
        className={`mt-1.5 text-2xl font-semibold leading-none tabular-nums ${
          attention ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>

      {trend ? (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            trend.direction === 'up'
              ? 'text-emerald-700'
              : trend.direction === 'down'
                ? 'text-rose-700'
                : 'text-slate-500'
          }`}
        >
          {trend.direction === 'up' ? (
            <TrendUpIcon className="h-3.5 w-3.5" />
          ) : trend.direction === 'down' ? (
            <TrendDownIcon className="h-3.5 w-3.5" />
          ) : null}
          {trend.label}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs text-slate-500">{hint}</p>
      ) : null}

      {series && series.length > 0 ? <Sparkline series={series} label={seriesLabel} /> : null}
    </>
  );

  const className =
    'flex flex-col rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-colors';

  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-slate-300 hover:bg-slate-50/60`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

/**
 * Seven bars, one per day, scaled against the busiest day in the window.
 *
 * Decorative to a screen reader — the number above it is the fact, and reading out seven
 * normalised heights would be noise. The window it covers is named in `aria-label` so the
 * shape is still explained to anyone who asks what it is.
 */
function Sparkline({ series, label }: { series: readonly number[]; label?: string }) {
  const heights = sparklineHeights(series);
  return (
    // `mt-auto` pins the bars to the card's foot, so they line up across a row of cards whether
    // or not a card has a hint line above them.
    <div className="mt-auto flex h-9 items-end gap-1 pt-3" role="img" aria-label={label}>
      {heights.map((height, index) => (
        <span
          key={index}
          // The most recent day is the one being read; earlier days recede to grey.
          className={`sparkline-bar ${index === heights.length - 1 ? 'text-brand-600' : 'text-slate-200'}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}
