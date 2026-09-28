/**
 * Which sign-in page each internal staff role uses.
 *
 * The console has two front doors: one for Super Admins and one for everyone else on the
 * platform team. They open the same panel, but a Super Admin session can change who holds access,
 * suspend a centre and override billing, so it gets a separate, stricter entry point — the same
 * reason a cloud provider keeps its root-account login apart from its IAM-user login. A role is
 * accepted at exactly one portal; a Super Admin at the team page is turned away rather than let in
 * through the lesser door.
 *
 * Deliberately pure: this is part of the gate, so it is written to be tested exhaustively.
 */

import type { PlatformRole } from '../auth/roles';

export const CONSOLE_PORTALS = ['super_admin', 'team'] as const;
export type ConsolePortal = (typeof CONSOLE_PORTALS)[number];

/** Where each portal's sign-in page lives. */
export const CONSOLE_PORTAL_PATHS: Record<ConsolePortal, string> = {
  super_admin: '/admin/login',
  team: '/staff/login',
};

export function isConsolePortal(value: unknown): value is ConsolePortal {
  return typeof value === 'string' && (CONSOLE_PORTALS as readonly string[]).includes(value);
}

/** The one portal a role signs in through. */
export function consolePortalFor(role: PlatformRole): ConsolePortal {
  return role === 'super_admin' ? 'super_admin' : 'team';
}

export function isRoleAllowedAtPortal(role: PlatformRole, portal: ConsolePortal): boolean {
  return consolePortalFor(role) === portal;
}
