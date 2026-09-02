/**
 * Who counts as internal staff, and with which platform role.
 *
 * Deliberately pure and free of `server-only`, Supabase and `next/*`: this is the single decision
 * that stands between a signed-in tenant user and the Super Admin panel, so it is written to be
 * exhaustively unit-testable rather than to be convenient. The I/O around it lives in
 * ./session.ts (pages) and ./context.ts (route handlers).
 *
 * Master spec §6.1.
 */

import { isPlatformRole, type PlatformRole } from '@assistigo/core';

/**
 * Parses `ADMIN_EMAILS` into a lookup set.
 *
 * Lower-cased and trimmed, because an env var written by a human will contain stray spaces and
 * inconsistent case, and a bootstrap that silently fails to match is worse than no bootstrap: it
 * looks like a broken deployment rather than a typo.
 */
export function parseAdminEmails(raw: string | undefined | null): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

export type RosterEntry = {
  role: string;
  isActive: boolean;
};

export type PlatformIdentityInput = {
  email: string | null;
  /**
   * Whether Supabase has confirmed the address.
   *
   * Load-bearing for the bootstrap path: without it, anybody who can guess an address in
   * `ADMIN_EMAILS` could sign up as it and hold Super Admin before ever proving they own the
   * mailbox. A roster row is unaffected — somebody deliberately put that user there.
   */
  emailConfirmed: boolean;
  /** The caller's `platform_admins` row, or null when they have none. */
  roster: RosterEntry | null;
  adminEmails: ReadonlySet<string>;
};

export type PlatformIdentity =
  | { granted: true; role: PlatformRole; via: 'roster' | 'bootstrap' }
  | { granted: false; reason: 'no_roster_row' | 'revoked' | 'email_unconfirmed' | 'unknown_role' };

/**
 * Resolves the caller's platform role.
 *
 * Precedence, and the reasoning for it:
 *
 *   1. An INACTIVE roster row denies, full stop — even for an address in `ADMIN_EMAILS`.
 *      Deactivating a row is an explicit revocation, and an env var that silently reinstated a
 *      revoked employee would make the revoke button a lie.
 *   2. An ACTIVE roster row wins. It is the managed, audited statement of who holds what.
 *   3. Otherwise `ADMIN_EMAILS` grants `super_admin`, but only to a confirmed address. This is a
 *      bootstrap for a fresh database — somebody has to be able to open /admin before there is a
 *      roster to be on — not the everyday mechanism.
 *
 * Rule 1 makes self-lockout possible in principle: a super admin who deactivates their own row
 * cannot walk back in through the env var. That is the correct trade (revocation must be real),
 * and the API refuses to remove or demote the last active super admin, which is where the
 * accident would otherwise happen.
 */
export function resolvePlatformIdentity(input: PlatformIdentityInput): PlatformIdentity {
  const { roster, email, emailConfirmed, adminEmails } = input;

  if (roster) {
    if (!roster.isActive) return { granted: false, reason: 'revoked' };
    // A role the build does not recognise is a database written by a newer deployment, or by
    // hand. Fail closed rather than guess at what it was meant to permit.
    if (!isPlatformRole(roster.role)) return { granted: false, reason: 'unknown_role' };
    return { granted: true, role: roster.role, via: 'roster' };
  }

  const normalised = email?.trim().toLowerCase();
  if (!normalised || !adminEmails.has(normalised)) {
    return { granted: false, reason: 'no_roster_row' };
  }
  if (!emailConfirmed) return { granted: false, reason: 'email_unconfirmed' };

  return { granted: true, role: 'super_admin', via: 'bootstrap' };
}

/**
 * Whether this user may be removed or demoted from the roster.
 *
 * The last active super admin cannot be, because a platform with no super admin has no way back
 * in short of a database edit. Counting is the caller's job; this exists so the page and the API
 * agree on the rule instead of each writing their own comparison.
 */
export function canDemotePlatformAdmin(input: {
  targetRole: PlatformRole;
  targetIsActive: boolean;
  activeSuperAdminCount: number;
}): boolean {
  if (!input.targetIsActive) return true;
  if (input.targetRole !== 'super_admin') return true;
  return input.activeSuperAdminCount > 1;
}
