import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { ORG_ROLE_LABELS } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { isPlatformStaff } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-shell/app-sidebar';
import { MobileNav } from '@/components/app-shell/mobile-nav';
import { SIDEBAR_MODE_COOKIE, parseSidebarMode } from '@/lib/app-shell/sidebar-mode';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { UserMenu } from '@/components/app-shell/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const canViewDocuments = session.permissions.has('document.view');
  const sidebarMode = parseSidebarMode((await cookies()).get(SIDEBAR_MODE_COOKIE)?.value);

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
    /*
     * An app shell: the window never scrolls. The header and the sidebar are fixed parts of
     * the frame, and `<main>` is the only scroll container, so the nav can never be dragged
     * along with a long page (nor a long page with the nav). Page code that needs the scroll
     * position must listen in the capture phase or target `#app-main`, not `window`.
     *
     * Both this and `<main>` are `relative` on purpose: `overflow` only clips an absolutely
     * positioned descendant whose containing block is inside it. Without that, every
     * `sr-only` label deep in a long list escaped `<main>`, stretched the document and gave the
     * window its own scrollbar again. Print drops the frame so a page prints in full.
     */
    <div className="relative flex h-dvh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* `relative` so `z-20` applies: the account menu's dropdown must paint over the page. */}
      <header className="relative z-20 h-[72px] shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav permissions={[...session.permissions]} />
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
          </div>

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

      <div className="flex min-h-0 flex-1">
        {/*
         * Full height and flush to the left edge; expanded, an icon rail, or a rail that opens on
         * hover, as the operator chooses (read from a cookie above so the first paint is already
         * the right width). Below `lg` it is replaced by the header's
         * menu button and drawer (`MobileNav`) — operators work on desktops (spec §5.1), but a
         * small or display-scaled screen must still be usable.
         */}
        <AppSidebar permissions={[...session.permissions]} initialMode={sidebarMode} />

        {/*
         * `scroll-pt-5` matches the inner padding, so a scroll-to-top on navigation (and any
         * `scrollIntoView`) lands on the true top of the page rather than 20px into it.
         */}
        <main
          id="app-main"
          className="relative min-w-0 flex-1 scroll-pt-5 overflow-y-auto overscroll-contain print:static print:overflow-visible"
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
