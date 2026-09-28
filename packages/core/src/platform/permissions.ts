/**
 * What each internal staff role may do inside the Super Admin panel.
 * Master spec §6.1 (platform roles); mirrors packages/core/src/auth/permissions.ts for tenants.
 *
 * Deliberately a *separate* axis from `Permission`. An organization role and a platform role
 * answer different questions — "may this operator edit their centre's customer?" versus "may this
 * employee publish a government deadline to every centre in the country?" — and merging them into
 * one enum is how a tenant owner eventually ends up holding a platform capability by accident.
 *
 * The hard rule underneath all of it: nothing here grants access to customer data. There is no
 * `customer.*` platform permission and there never should be one. Internal access to a tenant's
 * records goes through a time-limited, reasoned, audited `support_access_grant` (§19.9), which is
 * a different mechanism entirely.
 *
 * Never inline a platform role string comparison anywhere else — import `canPlatform()` instead.
 */

import type { PlatformRole } from '../auth/roles';

export const PLATFORM_PERMISSIONS = [
  // --- analytics -----------------------------------------------------------
  /** Aggregate platform metrics: tenant counts, usage totals, job health. Never row-level data. */
  'platform.analytics.view',
  /** The tenant list — organization metadata and usage only (§6.1). */
  'platform.tenants.view',
  /**
   * Suspend or reactivate an organization. Super admin only: suspension takes the dashboard and
   * the extension away from every member of a centre at once. Still metadata-only — it changes
   * whether a tenant may act, never what staff may read.
   */
  'platform.tenants.manage',

  // --- scheme & form catalogue --------------------------------------------
  'platform.schemes.view',
  'platform.schemes.edit',
  /** Flip a global scheme between draft and live for every tenant. */
  'platform.schemes.publish',
  'platform.schemes.delete',
  /** Edit application windows on live schemes — the highest-frequency content task. */
  'platform.deadlines.edit',
  'platform.forms.view',
  'platform.forms.edit',

  // --- scraper pipeline ----------------------------------------------------
  'platform.scrapers.view',
  'platform.scrapers.configure',
  'platform.scrapers.run',
  /** Read the staging inbox. */
  'platform.queue.view',
  /** Approve a staged item into the live catalogue, or reject it. */
  'platform.queue.review',

  // --- operations ----------------------------------------------------------
  'platform.jobs.view',
  'platform.audit.view',

  // --- billing -------------------------------------------------------------
  /** The plan catalogue: prices, limits and how many organizations are on each plan. */
  'platform.plans.view',
  /**
   * Create, edit, retire and reactivate plans. Super admin only: a limit changed here changes
   * what every centre on that plan can do, the moment it is saved.
   */
  'platform.plans.manage',
  /**
   * Put one organization on a plan by hand — a comp, a pilot, a support fix (spec §6.1 "billing
   * overrides"). Super admin only, reason required, and refused while a paid provider owns the
   * centre's subscription, so the database and the payment provider never disagree.
   */
  'platform.billing.override',

  // --- team ----------------------------------------------------------------
  'platform.team.view',
  'platform.team.manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/**
 * Read-only across the operational surface, write nowhere. This is the floor every other
 * platform role builds on, and on its own it is what a support engineer needs to answer
 * "why did this centre's upload fail?" without being able to change anything.
 */
const SUPPORT_ADMIN_PERMISSIONS: readonly PlatformPermission[] = [
  'platform.analytics.view',
  'platform.tenants.view',
  'platform.schemes.view',
  'platform.forms.view',
  'platform.scrapers.view',
  'platform.queue.view',
  'platform.jobs.view',
  'platform.plans.view',
  'platform.audit.view',
];

/**
 * The catalogue employee. Owns schemes, portal forms and deadlines — the content that centres
 * read out to citizens — and may clear the scraper inbox because approving a staged item is a
 * content decision. Cannot configure or trigger scrapers, and cannot manage the team.
 */
const CONTENT_MANAGER_PERMISSIONS: readonly PlatformPermission[] = [
  'platform.analytics.view',
  'platform.schemes.view',
  'platform.schemes.edit',
  'platform.schemes.publish',
  'platform.deadlines.edit',
  'platform.forms.view',
  'platform.forms.edit',
  'platform.scrapers.view',
  'platform.queue.view',
  'platform.queue.review',
  'platform.jobs.view',
  'platform.plans.view',
];

/**
 * The pipeline employee. Configures sources and runs them, and stages what comes back — but
 * publishing a scraped claim about a government rule to every centre stays a content decision,
 * so `platform.queue.review` is deliberately absent. A scraper operator fills the inbox; someone
 * else empties it.
 */
const SCRAPER_OPERATOR_PERMISSIONS: readonly PlatformPermission[] = [
  'platform.analytics.view',
  'platform.schemes.view',
  'platform.scrapers.view',
  'platform.scrapers.configure',
  'platform.scrapers.run',
  'platform.queue.view',
  'platform.jobs.view',
  'platform.plans.view',
];

const SUPER_ADMIN_PERMISSIONS: readonly PlatformPermission[] = PLATFORM_PERMISSIONS;

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  super_admin: SUPER_ADMIN_PERMISSIONS,
  content_manager: CONTENT_MANAGER_PERMISSIONS,
  scraper_operator: SCRAPER_OPERATOR_PERMISSIONS,
  support_admin: SUPPORT_ADMIN_PERMISSIONS,
};

/** Permissions granted by a set of platform roles (union). */
export function platformPermissionsFor(
  roles: PlatformRole | readonly PlatformRole[],
): Set<PlatformPermission> {
  const list: readonly PlatformRole[] = Array.isArray(roles) ? roles : [roles as PlatformRole];
  const out = new Set<PlatformPermission>();
  for (const role of list) {
    for (const permission of PLATFORM_ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function canPlatform(
  roles: PlatformRole | readonly PlatformRole[],
  permission: PlatformPermission,
): boolean {
  return platformPermissionsFor(roles).has(permission);
}

export class PlatformPermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';
  readonly status = 403;
  constructor(readonly permission: PlatformPermission) {
    super(`Missing platform permission: ${permission}`);
    this.name = 'PlatformPermissionDeniedError';
  }
}

export function assertPlatformCan(
  roles: PlatformRole | readonly PlatformRole[],
  permission: PlatformPermission,
): void {
  if (!canPlatform(roles, permission)) throw new PlatformPermissionDeniedError(permission);
}

export function isPlatformPermission(value: unknown): value is PlatformPermission {
  return (
    typeof value === 'string' && (PLATFORM_PERMISSIONS as readonly string[]).includes(value)
  );
}
