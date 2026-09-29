/**
 * The landing footer: the trust points under the CTA banner, the two link columns, the social
 * profiles and the pillars of the "Built for a Digital World" card. Copy lives in
 * `landing.footer.*`; each key's icon and colours live with the component.
 */

/** The proof points under the CTA buttons, in display order. */
export const FOOTER_TRUST = ['noCard', 'trusted', 'setup'] as const;
export type FooterTrust = (typeof FOOTER_TRUST)[number];

/** In-page anchors: each `href` is the `id` of a landing section, as in the header's nav. */
export const FOOTER_PRODUCT_LINKS = [
  { key: 'features', href: '#features' },
  { key: 'howItWorks', href: '#how-it-works' },
  { key: 'whereItWorks', href: '#where-it-works' },
  { key: 'pricing', href: '#pricing' },
  { key: 'faq', href: '#faq' },
] as const;

export const FOOTER_LEGAL_LINKS = [
  { key: 'privacy', href: '/legal/privacy' },
  { key: 'terms', href: '/legal/terms' },
  { key: 'acceptableUse', href: '/legal/acceptable-use' },
  { key: 'security', href: '/legal/security' },
] as const;

/**
 * Each network's home page stands in until the official Bharatfill profiles exist; swap in the
 * profile URLs here.
 */
export const FOOTER_SOCIALS = [
  { key: 'youtube', href: 'https://www.youtube.com' },
  { key: 'linkedin', href: 'https://www.linkedin.com' },
  { key: 'x', href: 'https://x.com' },
  { key: 'instagram', href: 'https://www.instagram.com' },
] as const;
export type FooterSocial = (typeof FOOTER_SOCIALS)[number]['key'];

/** The row along the bottom of the "Built for a Digital World" card. */
export const FOOTER_PILLARS = ['secure', 'trusted', 'fast'] as const;
export type FooterPillar = (typeof FOOTER_PILLARS)[number];
