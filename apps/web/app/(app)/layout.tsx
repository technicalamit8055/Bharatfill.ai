import Image from 'next/image';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { ORG_ROLE_LABELS } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { isPlatformStaff } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/app-shell/sidebar';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { UserMenu } from '@/components/app-shell/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const canViewDocuments = session.permissions.has('document.view');

  const [staff, reviewsResult] = await Promise.all([
    // Discoverability only. The link is not the gate — /admin re-checks the roster and 404s
    // for anybody who is not staff.
    isPlatformStaff(),
    /*
     * The bell's only signal: extractions an operator must check before they fill. A head-only
     * count — no rows, no field values — so it is cheap enough to run on every page, and
     * gated on the same permission as the documents list it links to.
     */
    canViewDocuments
      ? supabase
          .from('document_extractions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', session.organization.id)
          .eq('status', 'review_required')
      : Promise.resolve({ count: null }),
  ]);

  const reviewsPending = reviewsResult.count ?? 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        * A fixed 72px header rather than one sized by its contents: the sidebar rail below
        * sticks to the bottom of it, and an offset derived from the logo's height would drift
        * the moment the logo changed.
        */}
      <header className="sticky top-0 z-20 h-[72px] border-b border-slate-200 bg-white">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
          {/*
            * The PNG ships with wide transparent margins (its artwork is 1705×504 inside a
            * 1915×821 canvas), so it is drawn into a box of the artwork's own proportions with
            * `object-cover`. That trims the empty margin rather than shrinking the wordmark and
            * its Hindi tagline down to an unreadable size.
            */}
          <Link
            href="/dashboard"
            aria-label={t('app.name')}
            className="relative block h-[52px] w-[176px] shrink-0"
          >
            <Image
              src="/Bharatfill-logo.png"
              alt={t('app.name')}
              fill
              sizes="176px"
              className="object-cover"
              priority
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <LocaleSwitcher />

            {canViewDocuments ? (
              <Link
                href="/documents"
                aria-label={
                  reviewsPending > 0
                    ? t('header.reviewsWaiting', { count: reviewsPending })
                    : t('header.notifications')
                }
                title={
                  reviewsPending > 0
                    ? t('header.reviewsWaiting', { count: reviewsPending })
                    : t('header.nothingWaiting')
                }
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                <Bell size={18} strokeWidth={1.8} aria-hidden />
                {reviewsPending > 0 ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"
                  />
                ) : null}
              </Link>
            ) : null}

            <UserMenu
              displayName={session.displayName}
              email={session.email}
              roleLabel={localised(ORG_ROLE_LABELS[session.role], locale)}
              organizationName={session.organization.name}
              isStaff={staff}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-4 py-5">
        {/*
          * Sticky and self-scrolling: the rail carries the Digital India panel and the support
          * card at its foot, and on a short laptop screen those must stay reachable without
          * scrolling the whole dashboard past them.
          */}
        <aside className="sticky top-[72px] hidden max-h-[calc(100dvh-72px)] w-52 shrink-0 overflow-y-auto pb-4 lg:block">
          <Sidebar permissions={[...session.permissions]} showFooter />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Operators work on desktops (spec §5.1), but a small screen must still be usable. */}
      <div className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
        <Sidebar permissions={[...session.permissions]} />
      </div>
    </div>
  );
}
