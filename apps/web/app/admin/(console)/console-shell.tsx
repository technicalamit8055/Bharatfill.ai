'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Command,
  CornerDownLeft,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import type { ConsolePortal } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import {
  ConsoleThemeRoot,
  ConsoleThemeSwitch,
  ConsoleThemeToggle,
} from '@/components/admin/console-theme';
import type { ConsoleTheme } from '@/lib/admin/console-theme';
import { consoleSignOutAction, lockConsoleAction } from '../login/actions';
import { CONSOLE_NAV, CONSOLE_QUICK_ACTIONS, isNavActive, type ConsoleNavItem } from './nav-config';
import { AdminAvatar, AdminBadge } from './ui';

/**
 * The console chrome: a collapsible sidebar, a top bar with breadcrumbs, a command palette and
 * the account menu.
 *
 * Every navigational element is filtered by the same permission list the server resolved, and
 * every page re-checks on the server. What this component hides is presentation only.
 */

export type ConsoleUser = {
  email: string | null;
  roleLabel: string;
  portal: ConsolePortal;
  /** Access came from ADMIN_EMAILS rather than a roster row. */
  viaBootstrap: boolean;
  consoleExpiresAt: string;
};

type Props = {
  user: ConsoleUser;
  permissions: string[];
  queueCount: number;
  hasDashboard: boolean;
  appEnv: string;
  /** From the theme cookie, so the first render is already in the right colours. */
  initialTheme: ConsoleTheme;
  children: React.ReactNode;
};

const COLLAPSE_KEY = 'bf-console-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // A blocked storage just means the preference does not survive a reload.
  }
}

export function ConsoleShell({
  user,
  permissions,
  queueCount,
  hasDashboard,
  appEnv,
  initialTheme,
  children,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const allowed = useMemo(() => new Set(permissions), [permissions]);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => setCollapsed(readCollapsed()), []);
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      writeCollapsed(!value);
      return !value;
    });
  };

  const groups = useMemo(
    () =>
      CONSOLE_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.permission)),
      })).filter((group) => group.items.length > 0),
    [allowed],
  );

  const badgeFor = (item: ConsoleNavItem) => (item.href === '/admin/queue' ? queueCount : 0);

  return (
    <ConsoleThemeRoot
      initialTheme={initialTheme}
      className="min-h-dvh bg-slate-950 text-slate-200 antialiased"
    >
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-800/80 bg-console-chrome transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        <SidebarContent
          groups={groups}
          pathname={pathname}
          collapsed={collapsed}
          badgeFor={badgeFor}
          user={user}
          appEnv={appEnv}
        />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 border-t border-slate-800/80 px-5 py-3 text-xs text-slate-500 transition-colors hover:text-slate-200"
          aria-label={collapsed ? t('admin.shell.expandSidebar') : t('admin.shell.collapseSidebar')}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {collapsed ? null : <span>{t('admin.shell.collapseSidebar')}</span>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            aria-label={t('common.close')}
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-console-chrome">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent
              groups={groups}
              pathname={pathname}
              collapsed={false}
              badgeFor={badgeFor}
              user={user}
              appEnv={appEnv}
            />
          </aside>
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[68px]' : 'lg:pl-64',
        )}
      >
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-console-chrome/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
              aria-label={t('admin.shell.openMenu')}
            >
              <Menu className="h-5 w-5" />
            </button>

            <Breadcrumbs pathname={pathname} />

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 py-1.5 pl-2.5 pr-1.5 text-xs text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-300 sm:flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="w-40 text-left">{t('admin.shell.searchPlaceholder')}</span>
                <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-sans text-[10px] text-slate-400">
                  <Command className="h-2.5 w-2.5" />K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 sm:hidden"
                aria-label={t('admin.shell.searchPlaceholder')}
              >
                <Search className="h-5 w-5" />
              </button>

              <ConsoleThemeToggle />
              <AccountMenu user={user} hasDashboard={hasDashboard} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {paletteOpen ? (
        <CommandPalette groups={groups} allowed={allowed} onClose={() => setPaletteOpen(false)} />
      ) : null}
    </ConsoleThemeRoot>
  );
}

// ---------------------------------------------------------------------------

function EnvironmentBadge({ appEnv }: { appEnv: string }) {
  const t = useTranslations();
  const tone = appEnv === 'production' ? 'danger' : appEnv === 'staging' ? 'warning' : 'neutral';
  return (
    <AdminBadge tone={tone} dot>
      {t(`admin.shell.env.${appEnv}`)}
    </AdminBadge>
  );
}

function SidebarContent({
  groups,
  pathname,
  collapsed,
  badgeFor,
  user,
  appEnv,
}: {
  groups: { labelKey: string; items: ConsoleNavItem[] }[];
  pathname: string;
  collapsed: boolean;
  badgeFor: (item: ConsoleNavItem) => number;
  user: ConsoleUser;
  appEnv: string;
}) {
  const t = useTranslations();

  return (
    <>
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-800/80',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}
      >
        <Link
          href="/admin"
          className="flex min-w-0 items-center gap-2.5"
          aria-label={t('admin.title')}
        >
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-lg',
              user.portal === 'super_admin'
                ? 'bg-gradient-to-br from-amber-400 to-rose-500 shadow-rose-950/40'
                : 'bg-gradient-to-br from-sky-400 to-indigo-500 shadow-indigo-950/40',
            )}
          >
            B
          </span>
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-50">
                {t('admin.shell.brand')}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {user.portal === 'super_admin'
                  ? t('admin.shell.superConsole')
                  : t('admin.shell.teamConsole')}
              </span>
            </span>
          )}
        </Link>
      </div>

      {collapsed ? null : (
        <div className="flex flex-wrap items-center gap-1.5 px-5 pt-4">
          <EnvironmentBadge appEnv={appEnv} />
          {user.viaBootstrap ? (
            <AdminBadge tone="warning">{t('admin.viaBootstrap')}</AdminBadge>
          ) : null}
        </div>
      )}

      <nav
        aria-label={t('admin.shell.navLabel')}
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
      >
        {groups.map((group) => (
          <div key={group.labelKey} className="space-y-0.5">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-slate-800" aria-hidden />
            ) : (
              <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                {t(group.labelKey)}
              </p>
            )}
            {group.items.map((item) => {
              const active = isNavActive(item.href, pathname);
              const badge = badgeFor(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    collapsed && 'justify-center',
                    active
                      ? 'bg-slate-800/80 font-medium text-slate-50'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100',
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sky-400"
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      active ? 'text-sky-300' : 'text-slate-500 group-hover:text-slate-300',
                    )}
                  />
                  {collapsed ? null : <span className="flex-1 truncate">{t(item.labelKey)}</span>}
                  {badge > 0 ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-amber-300',
                        collapsed && 'absolute -right-0.5 -top-0.5 px-1 text-[9px]',
                      )}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {collapsed ? null : (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
          <span>{t('admin.shell.privacyFooter')}</span>
        </div>
      )}
    </>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const t = useTranslations();

  const crumbs = useMemo(() => {
    const segments = pathname
      .replace(/^\/admin\/?/, '')
      .split('/')
      .filter(Boolean);
    const items: { label: string; href: string }[] = [
      { label: t('admin.nav.overview'), href: '/admin' },
    ];
    let href = '/admin';
    segments.forEach((segment, index) => {
      href += `/${segment}`;
      const section =
        index === 0
          ? CONSOLE_NAV.flatMap((group) => group.items).find((item) => item.segment === segment)
          : undefined;
      const label = section
        ? t(section.labelKey)
        : segment === 'new'
          ? t('admin.shell.new')
          : t('admin.shell.details');
      items.push({ label, href });
    });
    return items;
  }, [pathname, t]);

  return (
    <nav aria-label={t('admin.shell.breadcrumbs')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li
              key={crumb.href}
              className={cn('flex min-w-0 items-center gap-1.5', !last && 'hidden sm:flex')}
            >
              {index > 0 ? (
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-700" />
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-slate-100">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-slate-500 transition-colors hover:text-slate-200"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AccountMenu({ user, hasDashboard }: { user: ConsoleUser; hasDashboard: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = user.email ?? t('admin.shell.staff');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('admin.shell.accountMenu')}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
      >
        <AdminAvatar label={label} />
        <span className="hidden text-left md:block">
          <span className="block max-w-[12rem] truncate text-xs font-medium text-slate-200">
            {label}
          </span>
          <span className="block text-[11px] text-slate-500">{user.roleLabel}</span>
        </span>
      </button>

      {open ? (
        // The session expiry is formatted here, in the browser's own time zone, and only once the
        // menu is open — so the server render never has to guess the viewer's clock.
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-800 bg-console-popover shadow-2xl shadow-console-shadow/40"
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-100">{label}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <AdminBadge tone={user.portal === 'super_admin' ? 'warning' : 'info'}>
                {user.roleLabel}
              </AdminBadge>
              <span className="text-[11px] text-slate-500">
                {user.portal === 'super_admin'
                  ? t('admin.shell.superConsole')
                  : t('admin.shell.teamConsole')}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {t('admin.shell.sessionEnds', {
                time: new Date(user.consoleExpiresAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              })}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
            <span className="text-xs text-slate-400">{t('admin.theme.label')}</span>
            <ConsoleThemeSwitch />
          </div>

          <div className="p-1.5">
            {hasDashboard ? (
              <Link
                href="/dashboard"
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              >
                <LayoutDashboard className="h-4 w-4 text-slate-500" />
                <span className="flex-1">{t('admin.backToDashboard')}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
              </Link>
            ) : null}
            <form action={lockConsoleAction}>
              <input type="hidden" name="portal" value={user.portal} />
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              >
                <Lock className="h-4 w-4 text-slate-500" />
                <span className="flex-1">{t('admin.shell.lock')}</span>
              </button>
            </form>
            <form action={consoleSignOutAction}>
              <input type="hidden" name="portal" value={user.portal} />
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                <span className="flex-1">{t('common.signOut')}</span>
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PaletteEntry = { key: string; label: string; hint: string; href: string; keywords: string };

function CommandPalette({
  groups,
  allowed,
  onClose,
}: {
  groups: { labelKey: string; items: ConsoleNavItem[] }[];
  allowed: Set<string>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => inputRef.current?.focus(), []);

  const entries = useMemo<PaletteEntry[]>(() => {
    const pages: PaletteEntry[] = groups.flatMap((group) =>
      group.items.map((item) => ({
        key: `page:${item.href}`,
        label: t(item.labelKey),
        hint: t(group.labelKey),
        href: item.href,
        keywords: item.keywords ?? '',
      })),
    );
    const actions: PaletteEntry[] = CONSOLE_QUICK_ACTIONS.filter((action) =>
      allowed.has(action.permission),
    ).map((action) => ({
      key: `action:${action.href}`,
      label: t(action.labelKey),
      hint: t('admin.shell.quickAction'),
      href: action.href,
      keywords: '',
    }));

    const needle = query.trim().toLowerCase();
    const all = [...pages, ...actions];
    const matched = needle
      ? all.filter((entry) =>
          `${entry.label} ${entry.hint} ${entry.keywords}`.toLowerCase().includes(needle),
        )
      : all;

    // Typing a name offers a centre search, the palette's one free-text destination. Names only —
    // the tenant list has no other search, by design.
    if (needle && allowed.has('platform.tenants.view')) {
      matched.push({
        key: 'search:tenants',
        label: t('admin.shell.searchCentres', { query: query.trim() }),
        hint: t('admin.nav.tenants'),
        href: `/admin/tenants?q=${encodeURIComponent(query.trim())}`,
        keywords: '',
      });
    }
    return matched;
  }, [groups, allowed, query, t]);

  useEffect(() => setCursor(0), [query]);

  const go = useCallback(
    (entry: PaletteEntry | undefined) => {
      if (!entry) return;
      onClose();
      router.push(entry.href);
    },
    [onClose, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, Math.max(entries.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(entries[cursor]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.shell.commandPalette')}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-700/80 bg-console-popover shadow-2xl shadow-console-shadow/50">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('admin.shell.paletteHint')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={entries[cursor] ? `${listId}-${cursor}` : undefined}
            className="h-12 w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            Esc
          </kbd>
        </div>
        <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              {t('admin.shell.paletteEmpty')}
            </li>
          ) : (
            entries.map((entry, index) => (
              <li
                key={entry.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(entry)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                  index === cursor ? 'bg-slate-800 text-slate-50' : 'text-slate-300',
                )}
              >
                <span className="flex-1 truncate">{entry.label}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{entry.hint}</span>
                {index === cursor ? (
                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
