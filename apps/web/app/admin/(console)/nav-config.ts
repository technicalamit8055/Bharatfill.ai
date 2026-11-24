import {
  BookOpen,
  Bot,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Radar,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { PlatformPermission } from '@assistigo/core';

/**
 * The console's information architecture, in one place: the sidebar, the command palette and
 * the breadcrumbs all read it, so a section cannot appear in one and be missing from another.
 *
 * Each item names the permission its page requires. Hiding an item is presentation, not
 * authorization (docs/DEVELOPMENT_RULES.md §4) — every page gates itself again on the server —
 * but because it is the same constant, a role that can see a link can always open it.
 */

export type ConsoleNavItem = {
  href: string;
  /** The path segment after `/admin`, for breadcrumbs. Empty for the overview. */
  segment: string;
  labelKey: string;
  permission: PlatformPermission;
  icon: LucideIcon;
  /** Extra words the command palette matches on. */
  keywords?: string;
};

export type ConsoleNavGroup = { labelKey: string; items: ConsoleNavItem[] };

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    labelKey: 'admin.nav.groupOverview',
    items: [
      {
        href: '/admin',
        segment: '',
        labelKey: 'admin.nav.overview',
        permission: 'platform.analytics.view',
        icon: LayoutDashboard,
        keywords: 'home dashboard analytics metrics',
      },
      {
        href: '/admin/tenants',
        segment: 'tenants',
        labelKey: 'admin.nav.tenants',
        permission: 'platform.tenants.view',
        icon: Building2,
        keywords: 'centres organizations customers accounts suspend',
      },
      {
        href: '/admin/audit',
        segment: 'audit',
        labelKey: 'admin.nav.audit',
        permission: 'platform.audit.view',
        icon: ScrollText,
        keywords: 'audit log history activity security events',
      },
    ],
  },
  {
    labelKey: 'admin.nav.groupCatalogue',
    items: [
      {
        href: '/admin/schemes',
        segment: 'schemes',
        labelKey: 'admin.nav.schemes',
        permission: 'platform.schemes.view',
        icon: BookOpen,
        keywords: 'yojana catalogue government',
      },
      {
        href: '/admin/deadlines',
        segment: 'deadlines',
        labelKey: 'admin.nav.deadlines',
        permission: 'platform.deadlines.edit',
        icon: CalendarClock,
        keywords: 'dates windows expiry closing',
      },
      {
        href: '/admin/forms',
        segment: 'forms',
        labelKey: 'admin.nav.forms',
        permission: 'platform.forms.view',
        icon: FileText,
        keywords: 'portal adapters mapping',
      },
    ],
  },
  {
    labelKey: 'admin.nav.groupPipeline',
    items: [
      {
        href: '/admin/scrapers',
        segment: 'scrapers',
        labelKey: 'admin.nav.scrapers',
        permission: 'platform.scrapers.view',
        icon: Radar,
        keywords: 'sources ingestion runs',
      },
      {
        href: '/admin/queue',
        segment: 'queue',
        labelKey: 'admin.nav.queue',
        permission: 'platform.queue.view',
        icon: Inbox,
        keywords: 'review inbox approve reject',
      },
    ],
  },
  {
    labelKey: 'admin.nav.groupBilling',
    items: [
      {
        href: '/admin/plans',
        segment: 'plans',
        labelKey: 'admin.nav.plans',
        permission: 'platform.plans.view',
        icon: CreditCard,
        keywords: 'pricing limits subscriptions',
      },
      {
        href: '/admin/launch-leads',
        segment: 'launch-leads',
        labelKey: 'admin.nav.launchLeads',
        permission: 'platform.leads.view',
        icon: Megaphone,
        keywords: 'early access waitlist christmas whatsapp leads export',
      },
    ],
  },
  {
    labelKey: 'admin.nav.groupSystem',
    items: [
      {
        href: '/admin/team',
        segment: 'team',
        labelKey: 'admin.nav.team',
        permission: 'platform.team.view',
        icon: Users,
        keywords: 'staff roster roles access members',
      },
      {
        href: '/admin/channels',
        segment: 'channels',
        labelKey: 'admin.nav.channels',
        permission: 'platform.team.manage',
        icon: MessagesSquare,
        keywords: 'whatsapp telegram bots webhook',
      },
      {
        href: '/admin/ai',
        segment: 'ai',
        labelKey: 'admin.nav.aiSettings',
        permission: 'platform.team.manage',
        icon: Bot,
        keywords: 'ai vendor provider api key model ocr reading gemini vertex',
      },
    ],
  },
];

/** Quick actions offered by the command palette, each behind the permission its page needs. */
export const CONSOLE_QUICK_ACTIONS: {
  href: string;
  labelKey: string;
  permission: PlatformPermission;
}[] = [
  {
    href: '/admin/schemes/new',
    labelKey: 'admin.shell.actionNewScheme',
    permission: 'platform.schemes.edit',
  },
  {
    href: '/admin/plans/new',
    labelKey: 'admin.shell.actionNewPlan',
    permission: 'platform.plans.manage',
  },
  {
    href: '/admin/scrapers/new',
    labelKey: 'admin.shell.actionNewSource',
    permission: 'platform.scrapers.configure',
  },
  {
    href: '/admin/team#grant',
    labelKey: 'admin.shell.actionGrantAccess',
    permission: 'platform.team.manage',
  },
  {
    href: '/admin/tenants?status=suspended',
    labelKey: 'admin.shell.actionSuspendedCentres',
    permission: 'platform.tenants.view',
  },
];

/** Whether `href` is the active section for `pathname`. `/admin` would otherwise match everything. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
