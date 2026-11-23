import type { ReactNode } from 'react';
import { LoadingRegion, Skeleton, SkeletonText, cn } from '@assistigo/ui';
import { getTranslations } from '@/lib/i18n/server';

/*
 * Page-shaped loading placeholders for the operator dashboard, used by the routes' `loading.tsx`
 * files. Next.js shows a route's `loading.tsx` the moment a link is clicked, while the server
 * page is still fetching, so the operator sees the outline of the next screen at once instead of
 * a frozen old one. Each shape mirrors its real page closely enough that nothing jumps when the
 * content arrives. Nothing here reads data — placeholders only.
 */

const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

/** Wraps a route's skeleton with the single translated "Loading…" announcement. */
export async function RouteLoading({ children }: { children: ReactNode }) {
  const { t } = await getTranslations();
  return (
    <LoadingRegion label={t('common.loading')} className="space-y-6">
      {children}
    </LoadingRegion>
  );
}

/** Plain page title, subtitle and a primary action on the right. */
export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      {action ? <Skeleton className="h-10 w-36 rounded-lg" /> : null}
    </div>
  );
}

/** The tinted banner that opens the customers, forms, schemes and tools pages. */
export function HeroSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <section
      className={cn(
        'flex flex-col justify-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-[#eef5fe] to-[#f4f9ff] px-6 py-8 sm:px-8',
        tall ? 'min-h-[200px]' : 'min-h-[150px]',
      )}
    >
      <Skeleton className="h-8 w-64 max-w-full bg-brand-100/80" />
      <Skeleton className="h-4 w-96 max-w-full bg-brand-100/80" />
    </section>
  );
}

const STAT_COLUMNS = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 xl:grid-cols-5',
} as const;

/** A row of stat tiles: a small label, a figure, and an icon chip. */
export function StatGridSkeleton({ count = 4 }: { count?: keyof typeof STAT_COLUMNS }) {
  return (
    <div className={cn('grid gap-4', STAT_COLUMNS[count])}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn(CARD, 'flex items-start justify-between gap-3 p-4')}>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** A list in a card: a toolbar, a header row, and `rows` rows of `columns` cells. */
export function TableSkeleton({
  rows = 8,
  columns = 5,
  toolbar = true,
}: {
  rows?: number;
  columns?: number;
  toolbar?: boolean;
}) {
  return (
    <div className={cn(CARD, 'p-4 sm:p-5')}>
      {toolbar ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-100">
        <div className="flex gap-6 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex items-center gap-6 border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          >
            <div className="flex flex-1 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            {Array.from({ length: columns - 1 }, (_, cell) => (
              <Skeleton
                key={cell}
                className={cn(
                  'h-3.5 flex-1',
                  cell === columns - 2 && 'max-w-[2.25rem] h-9 rounded-lg',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One tile of a card grid: an icon square beside a title bar and a description bar. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(CARD, 'flex min-h-[132px] items-start gap-4 p-5', className)}>
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2.5 pt-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

/** A grid of `CardSkeleton`s, for the form library, schemes and document tools. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

/** A card with a title bar and a few label/value pairs — the body of most detail pages. */
export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn(CARD, className)}>
      <div className="border-b border-slate-100 px-5 py-4">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-4 px-5 py-5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-6">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-40 max-w-[50%]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A record's page: breadcrumb, an identity card, tabs, then a main column and a side column. */
export function DetailSkeleton({ tabs = true }: { tabs?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      <div className={cn(CARD, 'flex flex-wrap items-center justify-between gap-4 px-5 py-4')}>
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      {tabs ? (
        <div className="flex gap-6 border-b border-slate-200 pb-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-20" />
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PanelSkeleton rows={5} />
          <PanelSkeleton rows={3} />
        </div>
        <PanelSkeleton rows={4} />
      </div>
    </>
  );
}

/** A form in a card: label-over-field pairs in two columns and a footer with the actions. */
export function FormSkeleton({ fields = 8 }: { fields?: number }) {
  return (
    <div className={CARD}>
      <div className="border-b border-slate-100 px-5 py-4">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}

/** Stacked list items inside a card, e.g. a dashboard feed. */
export function ListSkeleton({ items = 4, title = true }: { items?: number; title?: boolean }) {
  return (
    <div className={CARD}>
      {title ? (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-16" />
        </div>
      ) : null}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: items }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <SkeletonText lines={2} className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A document tool: the editor canvas on the left, its controls on the right. */
export function ToolSkeleton() {
  return (
    <>
      <HeaderSkeleton action={false} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={cn(CARD, 'p-5 lg:col-span-2')}>
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
        <div className={cn(CARD, 'space-y-5 p-5')}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </>
  );
}
