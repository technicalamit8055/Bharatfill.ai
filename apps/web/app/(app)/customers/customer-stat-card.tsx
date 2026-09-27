import type { ReactNode } from 'react';

export type CustomerStatTone = 'brand' | 'emerald' | 'violet' | 'orange';

const ICON_TONES: Record<CustomerStatTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  orange: 'bg-orange-50 text-orange-500',
};

/**
 * One summary tile above the customer table: icon, label, number, a line of context, and an
 * optional `aside` on the right for the card's own read-out (a growth pill, the monthly bars,
 * the state outline). `footer` sits under the hint for the verified card's progress bar.
 */
export function CustomerStatCard({
  label,
  value,
  hint,
  icon,
  tone,
  aside,
  footer,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone: CustomerStatTone;
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-fade-in-up">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ICON_TONES[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-600">{label}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold leading-none tabular-nums text-slate-900">{value}</p>
          {aside}
        </div>
        {hint ? <p className="mt-2 truncate text-xs text-slate-500">{hint}</p> : null}
        {footer}
      </div>
    </div>
  );
}
