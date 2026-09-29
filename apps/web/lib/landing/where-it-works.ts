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

/**
 * The real marks shown in each card's tile. They are third-party trademarks, so the files are
 * supplied by hand: drop `<name>.svg` (or `.png` / `.webp`) into `public/portal-logos/`. A logo
 * with no file is skipped, and a card with none falls back to its icon (see
 * `portal-logos.server.ts`). `src` points at an asset that already lives elsewhere in `public/`.
 * At most `MAX_TILE_LOGOS` show per card.
 */
export type PortalLogo = { readonly name: string; readonly src?: string };

export const MAX_TILE_LOGOS = 2;

export const PORTAL_LOGOS: Record<PortalKey, readonly PortalLogo[]> = {
  sscRailway: [{ name: 'ssc', src: '/ssc-logo.png' }, { name: 'indian-railways' }],
  nsp: [{ name: 'nsp' }],
  stateRecruitment: [{ name: 'e-district' }],
  workdayGreenhouse: [{ name: 'workday' }, { name: 'greenhouse' }],
  linkedinIndeed: [{ name: 'linkedin' }, { name: 'indeed' }],
  naukriShine: [{ name: 'naukri' }, { name: 'shine' }],
  admissions: [{ name: 'cuet' }],
  salesforceZoho: [{ name: 'salesforce' }, { name: 'zoho' }],
  customForms: [],
};

/** Resolved public URLs of the logo files that exist, per portal. */
export type PortalLogoSources = Partial<Record<PortalKey, readonly string[]>>;

export function portalsIn(category: PortalCategory): readonly Portal[] {
  return category === 'all' ? PORTALS : PORTALS.filter((portal) => portal.category === category);
}
