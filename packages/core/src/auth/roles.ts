/**
 * Organization roles and membership states.
 * Master spec §6.2, §18.2 (organization_members).
 */

export const ORG_ROLES = ['owner', 'manager', 'operator', 'viewer', 'billing_admin'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * Internal Assistigo staff roles. Never grant customer data access by themselves (§6.1).
 *
 * `super_admin` and `support_admin` are the two the spec names. `content_manager` and
 * `scraper_operator` split day-to-day catalogue work off the owner account, so an employee who
 * edits scheme deadlines, or who triages the scraper inbox, does not also hold tenant management
 * and billing overrides. None of the four grants access to customer data — that still requires a
 * time-limited `support_access_grant` (§19.9).
 */
export const PLATFORM_ROLES = [
  'super_admin',
  'content_manager',
  'scraper_operator',
  'support_admin',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, { en: string; hi: string }> = {
  super_admin: { en: 'Super Admin', hi: 'सुपर एडमिन' },
  content_manager: { en: 'Content Manager', hi: 'कंटेंट मैनेजर' },
  scraper_operator: { en: 'Scraper Operator', hi: 'स्क्रैपर ऑपरेटर' },
  support_admin: { en: 'Support Admin', hi: 'सपोर्ट एडमिन' },
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export const ORG_ROLE_LABELS: Record<OrgRole, { en: string; hi: string }> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  manager: { en: 'Manager', hi: 'प्रबंधक' },
  operator: { en: 'Operator', hi: 'ऑपरेटर' },
  viewer: { en: 'Viewer', hi: 'दर्शक' },
  billing_admin: { en: 'Billing Admin', hi: 'बिलिंग एडमिन' },
};

/** Roles a member of `actorRole` is allowed to assign to somebody else. */
export const ASSIGNABLE_ROLES: Record<OrgRole, readonly OrgRole[]> = {
  owner: ORG_ROLES,
  // A manager may staff the centre but may never create another owner (§6.2).
  manager: ['operator', 'viewer'],
  operator: [],
  viewer: [],
  billing_admin: [],
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);
}
