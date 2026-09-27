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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-sm transition-all duration-150',
        active
          ? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
          : 'border-transparent text-slate-700 hover:translate-x-0.5 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <Icon
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600',
        )}
      />
      {t(item.labelKey)}
    </Link>
  );
}

/**
 * The foot of the rail: the Digital India mark, then the way to reach a human.
 *
 * Rendered only in the desktop rail — the mobile bar at the bottom of the layout renders the
 * same `Sidebar`, and a second copy of the artwork under a phone-width nav would push the
 * page's actual content off the screen.
 */
function SidebarFooter() {
  const t = useTranslations();

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      {/*
        * The artwork already carries the words "Digital India / Empowering Citizens" inside the
        * image, so there is no caption under it — a repeat would read as a printing error.
        *
        * That baked-in text is also why this one is not decorative: it cannot be translated, so
        * the alt string is how a Hindi operator, or anyone on a screen reader, gets the same
        * message. Per-locale artwork would be the better fix if this becomes more than a badge.
        */}
      <div className="flex justify-center">
        <Image
          src="/dashboard/sidebar-digital-india.png"
          alt={`${t('nav.digitalIndiaTitle')} — ${t('nav.digitalIndiaTagline')}`}
          width={1024}
          height={1024}
          className="h-24 w-auto select-none object-contain"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <LifeBuoy size={16} strokeWidth={1.8} aria-hidden className="mt-0.5 text-brand-600" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800">{t('nav.supportTitle')}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {t('nav.supportHint')}
            </p>
          </div>
        </div>
        {/*
          * Points at settings until a support channel is configured. The master spec defines no
          * support address, and guessing one would send an operator's question nowhere.
          */}
        <Link
          href="/settings"
          className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
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
}: {
  permissions: string[];
  /** Desktop rail only. See `SidebarFooter`. */
  showFooter?: boolean;
}) {
  const pathname = usePathname();
  const allowed = new Set(permissions);

  const visible = (items: NavItem[]) =>
    items.filter((item) => !item.permission || allowed.has(item.permission));

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Main" className="space-y-6">
      <div className="space-y-0.5">
        {visible(PRIMARY).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
      <div className="space-y-0.5 border-t border-slate-200 pt-4">
        {visible(SECONDARY).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      {showFooter ? <SidebarFooter /> : null}
    </nav>
  );
}
