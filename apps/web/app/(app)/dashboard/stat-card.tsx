import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'brand' | 'sky' | 'emerald' | 'violet' | 'amber';

const TONE_STYLES: Record<Tone, { icon: string; bar: string }> = {
  brand: { icon: 'bg-brand-50 text-brand-700', bar: 'from-brand-400 to-brand-600' },
  sky: { icon: 'bg-sky-50 text-sky-700', bar: 'from-sky-400 to-sky-600' },
  emerald: { icon: 'bg-emerald-50 text-emerald-700', bar: 'from-emerald-400 to-emerald-600' },
  violet: { icon: 'bg-violet-50 text-violet-700', bar: 'from-violet-400 to-violet-600' },
  amber: { icon: 'bg-amber-50 text-amber-700', bar: 'from-amber-400 to-amber-600' },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  href,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: Tone;
  href?: string;
  style?: React.CSSProperties;
}) {
  const toneStyle = TONE_STYLES[tone];

  const content = (
    <>
      <div
        className={`absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r ${toneStyle.bar} opacity-0 transition-opacity group-hover:opacity-100`}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneStyle.icon}`}>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </>
  );

  const className =
    'group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-fade-in-up';

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
