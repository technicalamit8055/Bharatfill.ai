import type { ReactNode } from 'react';
import { ChangeDownIcon, ChangeUpIcon } from './icons';

export type FillSessionStatTone = 'brand' | 'violet' | 'emerald' | 'orange';

const ICON_TONES: Record<FillSessionStatTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-500',
};

const BAR_TONES: Record<FillSessionStatTone, { past: string; latest: string }> = {
  brand: { past: 'bg-brand-300', latest: 'bg-brand-600' },
  violet: { past: 'bg-violet-300', latest: 'bg-violet-600' },
  emerald: { past: 'bg-emerald-300', latest: 'bg-emerald-600' },
  orange: { past: 'bg-orange-300', latest: 'bg-orange-500' },
};

/**
 * One summary tile above the audit log: icon, label, number, the change against the previous
 * period, and a visual on the right — bars, or the accuracy ring.
 */
export function FillSessionStatCard({
  label,
  value,
  icon,
  tone,
  change,
  aside,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone: FillSessionStatTone;
  change?: { percent: number; label: string; title: string } | null;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-fade-in-up">
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${ICON_TONES[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-3xl font-bold leading-none tabular-nums text-slate-900">{value}</p>
          {change ? (
            <span
              title={change.title}
              className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                change.percent < 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {change.percent < 0 ? (
                <ChangeDownIcon className="h-3.5 w-3.5" />
              ) : (
                <ChangeUpIcon className="h-3.5 w-3.5" />
              )}
              {change.label}
              <span className="sr-only"> ({change.title})</span>
            </span>
          ) : null}
        </div>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/** Rising bars, the last one darker: the latest slice of the window. */
export function StatBars({
  heights,
  tone,
  label,
}: {
  heights: readonly number[];
  tone: FillSessionStatTone;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="flex h-11 items-end gap-1">
      {heights.map((height, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-full ${
            index === heights.length - 1 ? BAR_TONES[tone].latest : BAR_TONES[tone].past
          }`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Progress ring for review accuracy. `percent: null` draws the empty track only. */
export function AccuracyRing({ percent, label }: { percent: number | null; label: string }) {
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <svg role="img" aria-label={label} viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
      <circle
        cx="24"
        cy="24"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="5"
        className="stroke-emerald-100"
      />
      {clamped > 0 ? (
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - clamped / 100)}
          className="stroke-emerald-500"
        />
      ) : null}
    </svg>
  );
}
