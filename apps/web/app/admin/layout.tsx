import Link from 'next/link';
import { PLATFORM_ROLE_LABELS } from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { signOutAction } from '../(auth)/actions';
import { AdminNav } from './admin-nav';
import { AdminBadge } from './ui';

export const metadata = {
  title: { default: 'Admin', template: '%s · Bharatfill Admin' },
  // Internal surface. Even behind a 404 for non-staff, it has no business in an index.
  robots: { index: false, follow: false },
};

/**
 * The Super Admin panel shell.
 *
 * `requirePlatformSession()` runs here, so every page under `/admin` is gated before it renders —
 * but each page gates itself again on its own permission, because a layout that happens to run
 * first is a convenience, not a guarantee (a route could be reached in a way that skips it, and
 * "the layout checked" is not a claim worth betting the platform catalogue on).
 *
 * Rendered dark and visually unlike the operator dashboard on purpose: an employee holding both
 * should never be unsure which surface they are editing in.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformSession();
  const { t, locale } = await getTranslations();

  // The inbox count drives the sidebar badge. Read here rather than per page so it is present on
  // every screen — a queue nobody is reminded of is a queue that grows.
  const { count } = await session.supabase
    .from('scraped_schemes_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="text-base font-semibold text-slate-100">
              {t('admin.title')}
            </Link>
            <AdminBadge tone="info">
              {localised(PLATFORM_ROLE_LABELS[session.role], locale)}
            </AdminBadge>
            {session.via === 'bootstrap' ? (
              // Worth surfacing: access came from ADMIN_EMAILS rather than the roster, which is a
              // bootstrap state a deployment should eventually leave.
              <AdminBadge tone="warning">{t('admin.viaBootstrap')}</AdminBadge>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-slate-400 transition-colors hover:text-slate-100">
              {t('admin.backToDashboard')}
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >
                {t('common.signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-4 py-5">
        <aside className="hidden w-56 shrink-0 lg:block">
          <AdminNav permissions={[...session.permissions]} queueCount={count ?? 0} />
        </aside>
        <main className="min-w-0 flex-1 space-y-6 pb-16">{children}</main>
      </div>

      <div className="border-t border-slate-800 px-4 py-3 lg:hidden">
        <AdminNav permissions={[...session.permissions]} queueCount={count ?? 0} />
      </div>
    </div>
  );
}
