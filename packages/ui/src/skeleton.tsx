import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Where a skeleton is drawn. `light` is the operator dashboard (white cards on a pale page).
 * `console` is the staff console, which is written dark-first and mirrors itself for its light
 * theme (tailwind.config.ts) — so its placeholder uses the dark-first slate steps and flips with
 * the rest of the console.
 */
export type SkeletonTone = 'light' | 'console';

const BLOCK_TONES: Record<SkeletonTone, string> = {
  light: 'bg-slate-200/70 before:via-white/70',
  console: 'bg-slate-800/70 before:via-slate-700/50',
};

/**
 * A placeholder block with a soft sweep, shown where content is still loading. Purely
 * decorative: wrap a page or card of these in `LoadingRegion`, which carries the one
 * "Loading" announcement for screen readers. The sweep is dropped for reduced motion.
 */
export function Skeleton({
  className,
  tone = 'light',
}: {
  className?: string;
  tone?: SkeletonTone;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative isolate overflow-hidden rounded-md',
        'before:absolute before:inset-0 before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:to-transparent',
        'motion-reduce:before:hidden',
        BLOCK_TONES[tone],
        className,
      )}
    />
  );
}

/** A few lines of placeholder text; the last line is shorter, as a paragraph's usually is. */
export function SkeletonText({
  lines = 2,
  className,
  tone,
}: {
  lines?: number;
  className?: string;
  tone?: SkeletonTone;
}) {
  return (
    <div aria-hidden className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          tone={tone}
          className={cn('h-3', index === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

/**
 * The accessible frame around a set of skeletons: one polite "Loading" status for assistive
 * technology, `aria-busy` while it is on screen, and the placeholders themselves hidden.
 */
export function LoadingRegion({
  label,
  children,
  className,
}: {
  /** Translated "Loading…" text, read out once. */
  label: string;
  children: ReactNode;
  /** Layout for the placeholders themselves (e.g. `space-y-6`). */
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}
