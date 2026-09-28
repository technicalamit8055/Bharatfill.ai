/**
 * The "Where it works" catalogue on the landing page: which portal families the section lists
 * and the filter chip each one sits under. Copy lives in `landing.whereItWorks.*`; each key's
 * icon and colours live with the component.
 */

export const PORTAL_CATEGORIES = ['all', 'government', 'jobs', 'education', 'crm'] as const;
export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

/** Catalogue order is display order under "All Portals". */
export const PORTALS = [
  { key: 'sscRailway', category: 'government' },
  { key: 'nsp', category: 'education' },
  { key: 'stateRecruitment', category: 'government' },
  { key: 'workdayGreenhouse', category: 'jobs' },
  { key: 'linkedinIndeed', category: 'jobs' },
  { key: 'naukriShine', category: 'jobs' },
  { key: 'admissions', category: 'education' },
  { key: 'salesforceZoho', category: 'crm' },
  { key: 'customForms', category: 'crm' },
] as const satisfies readonly { key: string; category: Exclude<PortalCategory, 'all'> }[];

export type Portal = (typeof PORTALS)[number];
export type PortalKey = Portal['key'];

export function portalsIn(category: PortalCategory): readonly Portal[] {
  return category === 'all' ? PORTALS : PORTALS.filter((portal) => portal.category === category);
}
