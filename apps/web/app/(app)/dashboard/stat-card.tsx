import Link from 'next/link';
import type { ReactNode } from 'react';
import { sparklineHeights } from '@/lib/dashboard/metrics';
import { TrendDownIcon, TrendUpIcon } from './icons';

export type StatTone = 'brand' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';

const TONE_STYLES: Record<
  StatTone,
  { icon: string; bar: string; spark: string; glow: string; ring: string }
> = {
  brand: {
    icon: 'bg-brand-50 text-brand-700 ring-brand-100',
    bar: 'from-brand-400 to-brand-600',
    spark: 'text-brand-400',
    glow: 'rgba(29, 84, 240, 0.12)',
    ring: 'group-hover:border-brand-200',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    bar: 'from-sky-400 to-sky-600',
    spark: 'text-sky-400',
    glow: 'rgba(2, 132, 199, 0.12)',
    ring: 'group-hover:border-sky-200',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    bar: 'from-emerald-400 to-emerald-600',
    spark: 'text-emerald-400',
    glow: 'rgba(5, 150, 105, 0.12)',
    ring: 'group-hover:border-emerald-200',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    bar: 'from-violet-400 to-violet-600',
    spark: 'text-violet-400',
    glow: 'rgba(124, 58, 237, 0.12)',
    ring: 'group-hover:border-violet-200',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    bar: 'from-amber-400 to-amber-600',
    spark: 'text-amber-400',
    glow: 'rgba(217, 119, 6, 0.14)',
    ring: 'group-hover:border-amber-200',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-700 ring-rose-100',
    bar: 'from-rose-400 to-rose-600',
    spark: 'text-rose-400',
    glow: 'rgba(225, 29, 72, 0.12)',
    ring: 'group-hover:border-rose-200',
  },
};

export type StatTrend = {
  /** Rendered next to the arrow, e.g. "+40% vs 7-day average". Already localised. */
  label: string;
  direction: 'up' | 'down' | 'flat';
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  href,
  series,
  seriesLabel,
  trend,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: StatTone;
  href?: string;
  /** Seven real daily counts, oldest first. Omitted when the metric has no daily history. */
  series?: readonly number[];
  /** Accessible description of the sparkline, e.g. "Last 7 days". */
  seriesLabel?: string;
  trend?: StatTrend | null;
  style?: React.CSSProperties;
}) {
  const toneStyle = TONE_STYLES[tone];

  const content = (
    <>
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${toneStyle.bar} opacity-0 transition-opacity group-hover:opacity-100`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${toneStyle.icon}`}
        >
          {icon}
        </span>
      </div>

      <p className="relative mt-2.5 text-[28px] font-semibold leading-none tabular-nums text-slate-900">
        {value}
      </p>

      {trend ? (
        <p
          className={`relative mt-2 inline-flex items-center gap-1 text-xs font-medium ${
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
        <p className="relative mt-2 text-xs text-slate-500">{hint}</p>
      ) : null}

      {series && series.length > 0 ? (
        <Sparkline series={series} label={seriesLabel} className={toneStyle.spark} />
      ) : null}
    </>
  );

  const className = `group stat-card-glow relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm command-tile animate-fade-in-up ${toneStyle.ring}`;
  const cssVars = { ...style, ['--stat-glow' as string]: toneStyle.glow } as React.CSSProperties;

  if (href) {
    return (
      <Link href={href} className={className} style={cssVars}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={cssVars}>
      {content}
    </div>
  );
}

/**
 * Seven bars, one per day, scaled against the busiest day in the window.
 *
 * Decorative to a screen reader — the number above it is the fact, and reading out seven
 * normalised heights would be noise. The window it covers is named in `aria-label` so the
 * shape is still explained to anyone who asks what it is.
 */
function Sparkline({
  series,
  label,
  className,
}: {
  series: readonly number[];
  label?: string;
  className: string;
}) {
  const heights = sparklineHeights(series);
  return (
    <div
      className={`relative mt-3 flex h-8 items-end gap-1 ${className}`}
      role="img"
      aria-label={label}
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className="sparkline-bar"
          style={{
            height: `${height}%`,
            // The most recent day is the one being read; earlier days recede.
            opacity: index === heights.length - 1 ? 1 : 0.3 + (index / heights.length) * 0.35,
            animationDelay: `${index * 45}ms`,
          }}
        />
      ))}
    </div>
  );
}
