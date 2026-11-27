/**
 * The single definition of what each organization role may do.
 * Master spec §6.2, §18.3; mirrored by the RLS policies in
 * packages/database/migrations/0010_rls_policies.sql.
 *
 * Never inline a role string comparison anywhere else — import `can()` instead.
 */

import type { OrgRole } from './roles';

export const PERMISSIONS = [
  // customers
  'customer.view',
  'customer.create',
  'customer.update',
  'customer.delete',
  'customer.reveal_sensitive',
  'customer.export',
  // roaming (migration 0024) — bookmark a customer registered at another centre, and ask that
  // customer for the consent that unlocks their record here. Split in two because they are
  // different acts: linking is a note to self, authenticating reaches into another tenant.
  'customer.roaming_link',
  'customer.roaming_authenticate',
  // portal credential vault (migration 0036, spec §19.7a). Split in two: `manage` writes what is
  // stored (and lists it, masked); `use` takes a secret back out — reveal, one-click login,
  // slip — and every use is a critical audit entry.
  'credential.manage',
  'credential.use',
  // Citizen Vault bridge (migration 0038, docs/VAULT_BRIDGE_DESIGN.md): ask a citizen for access
  // by mobile number and, once they approve or read out their share code, open and attach their
  // synced documents. Counter roles only — every use puts the citizen in the loop.
  'vault.access',
  // documents
  'document.view',
  'document.upload',
  'document.download',
  'document.delete',
  'extraction.review',
  'documenttool.use',
  // form filling
  'fill.run',
  'formreport.create',
  // applications
  'application.view',
  'application.create',
  'application.update',
  'application.delete',
  // counter khata (migration 0050). Recording a payment is `application.update`; a refund takes
  // money back out of the drawer, so it is a separate, manager-level act.
  'payment.refund',
  // organization
  'member.view',
  'member.invite',
  'member.remove',
  'member.change_role',
  'org.settings',
  'org.security',
  'org.export',
  'org.delete',
  'adapter.manage',
  // billing
  'billing.view',
  'billing.manage',
  // audit
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR_PERMISSIONS: readonly Permission[] = [
  'customer.view',
  'customer.create',
  'customer.update',
  'customer.reveal_sensitive',
  'customer.roaming_link',
  'customer.roaming_authenticate',
  'credential.manage',
  'credential.use',
  'vault.access',
  'document.view',
  'document.upload',
  'document.download',
  'extraction.review',
  'documenttool.use',
  'fill.run',
  'formreport.create',
  'application.view',
  'application.create',
  'application.update',
  'member.view',
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  ...OPERATOR_PERMISSIONS,
  'customer.delete',
  'customer.export',
  'document.delete',
  'application.delete',
  'payment.refund',
  'member.invite',
  'member.remove',
  'member.change_role',
  'org.settings',
  'adapter.manage',
  'audit.view',
  'billing.view',
];

const VIEWER_PERMISSIONS: readonly Permission[] = [
  'customer.view',
  'document.view',
  'application.view',
  'member.view',
];

/**
 * Billing admin manages money, not people's documents (§6.2).
 * Combining roles is a future feature; in the MVP a membership carries exactly one role.
 */
const BILLING_ADMIN_PERMISSIONS: readonly Permission[] = ['billing.view', 'billing.manage'];

const OWNER_PERMISSIONS: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: OWNER_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  operator: OPERATOR_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
  billing_admin: BILLING_ADMIN_PERMISSIONS,
};

/** Permissions granted by a set of roles (union). */
export function permissionsFor(roles: OrgRole | readonly OrgRole[]): Set<Permission> {
  const list: readonly OrgRole[] = Array.isArray(roles) ? roles : [roles as OrgRole];
  const out = new Set<Permission>();
  for (const role of list) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function can(roles: OrgRole | readonly OrgRole[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';
  readonly status = 403;
  constructor(readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'PermissionDeniedError';
  }
}

export function assertCan(roles: OrgRole | readonly OrgRole[], permission: Permission): void {
  if (!can(roles, permission)) throw new PermissionDeniedError(permission);
}
