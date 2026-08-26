'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

/**
 * The header every tool page shares: a back link, the tool's name, and its one-line purpose.
 *
 * The editor below supplies its own two-column layout (picture on the left, settings on the
 * right) because the settings rail's contents differ enough per tool — a redaction gate here, a
 * sheet preview there — that forcing them through one generic slot API would cost more than it
 * shares. What genuinely repeats across all four tools is this header, so that is what is
 * factored out.
 */
export function ToolPageHeader({
  title,
  description,
  headerActions,
  notice,
}: {
  title: string;
  description: string;
  headerActions?: ReactNode;
  /** Shown above the editor — used for the "check the portal notice" caveat. */
  notice?: ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/document-tools"
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            ← {t('documentTools.title')}
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>
        {headerActions ? (
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        ) : null}
      </div>
      {notice}
    </div>
  );
}

/** A titled group of controls in the rail. */
export function ToolSection({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-lg border border-slate-200 bg-white', className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h2>
          {hint ? <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{hint}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      <div className="space-y-3 px-3 py-3">{children}</div>
    </section>
  );
}

/**
 * The checkerboard backdrop every image tool uses.
 *
 * Not decoration: it is the only way an operator can see that a signature really has a
 * transparent background rather than a white one, which is the difference between a file that
 * overlays cleanly on a form and one that prints a white box over it.
 */
export function StageBackdrop({
  children,
  className,
  transparent = false,
}: {
  children: ReactNode;
  className?: string;
  transparent?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-lg border border-slate-200',
        transparent ? 'bg-white' : 'bg-slate-100',
        className,
      )}
      style={
        transparent
          ? {
              backgroundImage:
                'linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%),' +
                'linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 8px 8px',
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
