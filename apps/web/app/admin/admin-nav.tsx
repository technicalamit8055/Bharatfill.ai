'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@assistigo/ui';
import type { PlatformPermission } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';

/**
 * The admin sidebar.
 *
 * Items are hidden when the role lacks the permission, and every corresponding page gates itself
 * again on the server — hiding a link is presentation, not authorization
 * (docs/DEVELOPMENT_RULES.md §4). The permission named here and the one the page requires are
 * deliberately the same constant, so a role that can see a link can always open it.
 */

type AdminNavItem = {
  href: string;
  labelKey: string;
  permission: PlatformPermission;
  /** Rendered when the section has something waiting, e.g. the review inbox. */
  badge?: number;
};

const OVERVIEW: Omit<AdminNavItem, 'badge'>[] = [
  { href: '/admin', labelKey: 'admin.nav.overview', permission: 'platform.analytics.view' },
  { href: '/admin/tenants', labelKey: 'admin.nav.tenants', permission: 'platform.tenants.view' },
];

const CATALOGUE: Omit<AdminNavItem, 'badge'>[] = [
  { href: '/admin/schemes', labelKey: 'admin.nav.schemes', permission: 'platform.schemes.view' },
  {
    href: '/admin/deadlines',
    labelKey: 'admin.nav.deadlines',
    permission: 'platform.deadlines.edit',
  },
  { href: '/admin/forms', labelKey: 'admin.nav.forms', permission: 'platform.forms.view' },
];

const PIPELINE: Omit<AdminNavItem, 'badge'>[] = [
  { href: '/admin/scrapers', labelKey: 'admin.nav.scrapers', permission: 'platform.scrapers.view' },
  { href: '/admin/queue', labelKey: 'admin.nav.queue', permission: 'platform.queue.view' },
];

const SYSTEM: Omit<AdminNavItem, 'badge'>[] = [
  { href: '/admin/team', labelKey: 'admin.nav.team', permission: 'platform.team.view' },
  { href: '/admin/channels', labelKey: 'admin.nav.channels', permission: 'platform.team.manage' },
];

function NavLink({
  item,
  active,
  badge,
}: {
  item: Omit<AdminNavItem, 'badge'>;
  active: boolean;
  badge?: number;
}) {
  const t = useTranslations();
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'border-sky-400 bg-sky-500/10 font-medium text-sky-200'
          : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
      )}
    >
      <span className="truncate">{t(item.labelKey)}</span>
      {badge && badge > 0 ? (
        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 text-xs font-semibold tabular-nums text-amber-300">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

function Group({
  labelKey,
  items,
  allowed,
  pathname,
  queueCount,
}: {
  labelKey: string;
  items: Omit<AdminNavItem, 'badge'>[];
  allowed: Set<string>;
  pathname: string;
  queueCount: number;
}) {
  const t = useTranslations();
  const visible = items.filter((item) => allowed.has(item.permission));
  if (visible.length === 0) return null;

  // `/admin` would otherwise match every child route.
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        {t(labelKey)}
      </p>
      {visible.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(item.href)}
          badge={item.href === '/admin/queue' ? queueCount : undefined}
        />
      ))}
    </div>
  );
}

export function AdminNav({
  permissions,
  queueCount,
}: {
  permissions: string[];
  queueCount: number;
}) {
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const shared = { allowed, pathname, queueCount };

  return (
    <nav aria-label="Admin" className="space-y-5">
      <Group labelKey="admin.nav.groupOverview" items={OVERVIEW} {...shared} />
      <Group labelKey="admin.nav.groupCatalogue" items={CATALOGUE} {...shared} />
      <Group labelKey="admin.nav.groupPipeline" items={PIPELINE} {...shared} />
      <Group labelKey="admin.nav.groupSystem" items={SYSTEM} {...shared} />
    </nav>
  );
}
