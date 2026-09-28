import type { ReactNode } from 'react';

/**
 * Icon, title and optional subtitle across the top of a billing card, with an optional control
 * on the right. No hooks, so both the server page and the client plan picker can use it.
 */
export function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 sm:text-sm">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
