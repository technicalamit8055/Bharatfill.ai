'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, LifeBuoy } from 'lucide-react';
import { cn } from '@assistigo/ui';
import type { Permission } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import {
  HomeIcon,
  CustomersIcon,
  DocumentsIcon,
  ToolsIcon,
  ApplicationsIcon,
  KhataIcon,
  LibraryIcon,
  FillSessionsIcon,
  BillingIcon,
  SettingsIcon,
  SchemesIcon,
} from './nav-icons';

type NavItem = {
  href: string;
  labelKey: string;
  icon: (props: { className?: string }) => React.ReactElement;
  /** Hidden when the role lacks this permission. The server gates the page as well. */
  permission?: Permission;
};

const PRIMARY: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.home', icon: HomeIcon },
  {
    href: '/customers',
    labelKey: 'nav.customers',
    icon: CustomersIcon,
    permission: 'customer.view',
  },
  {
    href: '/documents',
    labelKey: 'nav.documents',
    icon: DocumentsIcon,
    permission: 'document.view',
  },
  {
    href: '/document-tools',
    labelKey: 'nav.documentTools',
    icon: ToolsIcon,
    permission: 'documenttool.use',
  },
  {
    href: '/applications',
    labelKey: 'nav.applications',
    icon: ApplicationsIcon,
    permission: 'application.view',
  },
  // The counter's cash book (migration 0050): the first screen of the morning at most centres.
  { href: '/khata', labelKey: 'nav.khata', icon: KhataIcon, permission: 'application.view' },
  // Sits in the primary group: it is the first thing an operator opens when a walk-in has no
  // specific form in mind, which is most walk-ins.
  { href: '/schemes', labelKey: 'nav.schemes', icon: SchemesIcon, permission: 'customer.view' },
];

const SECONDARY: NavItem[] = [
  { href: '/form-library', labelKey: 'nav.formLibrary', icon: LibraryIcon, permission: 'fill.run' },
  {
    href: '/fill-sessions',
    labelKey: 'nav.fillSessions',
    icon: FillSessionsIcon,
    permission: 'fill.run',
  },
  { href: '/billing', labelKey: 'nav.billing', icon: BillingIcon, permission: 'billing.view' },
  { href: '/settings', labelKey: 'nav.settings', icon: SettingsIcon },
];

/*
 * The icon keeps the same left offset in both widths, so when the rail opens the labels slide
 * out beside icons that stay put rather than the whole column jumping.
 */
function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const t = useTranslations();
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex items-center gap-2.5 whitespace-nowrap rounded-md border-l-2 px-2.5 py-2 text-sm transition-colors duration-150',
        active
          ? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
          : 'border-transparent text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <Icon
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600',
        )}
      />
      {/* Still in the accessibility tree when collapsed: the link keeps its name. */}
      <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
    </Link>
  );
}

/**
 * The foot of the rail: the Digital India mark, then the way to reach a human. Pinned to the
 * bottom of the sidebar while the links above it scroll, the way a console's account block is.
 * On the icon rail it shrinks to the support icon alone.
 */
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations();

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-slate-200 px-2 py-2">
        <Link
          href="/settings"
          title={t('nav.supportCta')}
          aria-label={t('nav.supportCta')}
          className="flex items-center rounded-md px-3 py-2 text-brand-600 transition-colors hover:bg-slate-100"
        >
          <LifeBuoy size={17} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="shrink-0 space-y-3 border-t border-slate-200 p-3">
      {/*
       * The artwork already carries the words "Digital India / Empowering Citizens" inside the
       * image, so there is no caption under it — a repeat would read as a printing error.
       *
       * That baked-in text is also why this one is not decorative: it cannot be translated, so
       * the alt string is how a Hindi operator, or anyone on a screen reader, gets the same
       * message. Per-locale artwork would be the better fix if this becomes more than a badge.
       *
       * Dropped on short screens (a 768px laptop minus the browser's own chrome), where it would
       * squeeze the links into a scroll; the support card below it is the part that matters.
       */}
      <div className="flex justify-center [@media(max-height:760px)]:hidden">
        <Image
          src="/dashboard/sidebar-digital-india.png"
          alt={`${t('nav.digitalIndiaTitle')} — ${t('nav.digitalIndiaTagline')}`}
          width={1024}
          height={1024}
          className="h-24 w-auto select-none object-contain"
        />
      </div>

      <div className="min-w-[12rem] rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <LifeBuoy size={16} strokeWidth={1.8} aria-hidden className="mt-0.5 text-brand-600" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800">{t('nav.supportTitle')}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t('nav.supportHint')}</p>
          </div>
        </div>
        {/*
         * Points at settings until a support channel is configured. The master spec defines no
         * support address, and guessing one would send an operator's question nowhere.
         */}
        <Link
          href="/settings"
          className="mt-2.5 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
        >
          {t('nav.supportCta')}
          <ArrowRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function Sidebar({
  permissions,
  showFooter = false,
  collapsed = false,
}: {
  permissions: string[];
  /** The Digital India mark and support card, pinned at the foot. See `SidebarFooter`. */
  showFooter?: boolean;
  /** Icon rail: labels become tooltips (and stay readable to screen readers). */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const allowed = new Set(permissions);

  const visible = (items: NavItem[]) =>
    items.filter((item) => !item.permission || allowed.has(item.permission));

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /*
   * Fills its container's height. Only the links scroll, and only if they outgrow the screen;
   * `overscroll-contain` stops a wheel that reaches their end from scrolling the page instead.
   */
  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Main"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-4"
      >
        <div className="space-y-0.5">
          {visible(PRIMARY).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>
        <div className="space-y-0.5 border-t border-slate-200 pt-4">
          {visible(SECONDARY).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      {showFooter ? <SidebarFooter collapsed={collapsed} /> : null}
    </div>
  );
}
