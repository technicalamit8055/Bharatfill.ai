import Image from 'next/image';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@assistigo/ui';
import { EmptyListIcon } from '../icons';

/**
 * The building blocks every card on the customer profile shares: a white panel headed by a
 * tinted icon bubble, a title, and optional actions on the right.
 *
 * No hooks, so the server-rendered cards (documents, applications, fill sessions) and the
 * client ones (profile sections, add details) wear the same shell.
 */

/**
 * The query flag the header's "Edit customer" link sets to open the profile form. Lives here, not
 * in the client `profile-sections.tsx`, because a server component importing a constant from a
 * `'use client'` module receives a client reference rather than the string.
 */
export const PROFILE_EDIT_PARAM = 'edit';

/** The element the profile cards sit in, for the header link to scroll to. */
export const PROFILE_ANCHOR = 'profile';

/**
 * The customer page's tabs. Here rather than in the client `customer-tabs.tsx` for the same
 * reason as `PROFILE_EDIT_PARAM`: the server page reads them to pick the initial tab.
 */
export const CUSTOMER_TABS = [
  'profile',
  'documents',
  'applications',
  'logins',
  'activity',
] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

/** The query parameter that remembers the open tab. */
export const TAB_PARAM = 'tab';

export function isCustomerTab(value: string | null | undefined): value is CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? '');
}

export type DetailTone =
  'brand' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'orange' | 'slate';

const BUBBLE_TONES: Record<DetailTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  sky: 'bg-sky-50 text-sky-600',
  orange: 'bg-orange-50 text-orange-600',
  slate: 'bg-slate-100 text-slate-600',
};

/** The bordered white button most card headers carry ("Edit details"). */
export const OUTLINE_BUTTON =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50';

/** The solid call to action a card header carries ("Upload document", "New application"). */
export const PRIMARY_BUTTON =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

/** A square icon-only button, as in the documents table's row actions. */
export const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-600 shadow-sm transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50';

export function DetailCard({
  icon: Icon,
  tone,
  title,
  actions,
  children,
  id,
  className,
  bodyClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: DetailTone;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              BUBBLE_TONES[tone],
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * The compact empty state used inside a profile card: a small illustration beside two lines of
 * text, rather than the tall dashed box the list pages use — a profile with nothing in half its
 * cards should not be mostly whitespace.
 */
export function DetailEmpty({
  title,
  description,
  illustrated = false,
}: {
  title: string;
  description?: string;
  /** The clipboard artwork instead of the line icon. Decorative: the title says it. */
  illustrated?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4 py-4 text-left">
      {illustrated ? (
        <Image
          src="/dashboard/empty-applications.png"
          alt=""
          aria-hidden
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 object-contain"
        />
      ) : (
        <EmptyListIcon className="h-10 w-10 shrink-0 text-slate-300" />
      )}
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}
