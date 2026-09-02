'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function Sidebar({ permissions }: { permissions: string[] }) {
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
    </nav>
  );
}
