/**
 * The pricing preview on the landing page: which plans it shows, in what order, what each one
 * lists, and the trust points around them. Copy lives in `landing.pricing.*`; each plan's icon
 * and colours live with the component.
 *
 * These are the marketing tiers shown to visitors. The billable catalogue that entitlements run
 * on is `@assistigo/core` billing plans, and is not read from here.
 */

export const PRICING_PLANS = [
  {
    key: 'starter',
    priceInr: 0,
    period: 'forever',
    featured: false,
    href: '/sign-up',
    features: ['autofills', 'profile', 'extension', 'masking', 'matching'],
  },
  {
    key: 'pro',
    priceInr: 499,
    period: 'month',
    featured: true,
    href: '/sign-up?plan=pro',
    features: ['autofills', 'vault', 'ocr', 'resizer', 'presets', 'support'],
  },
  {
    key: 'csc',
    priceInr: 1299,
    period: 'month',
    featured: false,
    href: '/sign-up?plan=team',
    features: ['staff', 'everythingPro', 'bulkSearch', 'auditLogs', 'support', 'sla'],
  },
] as const satisfies readonly {
  key: string;
  priceInr: number;
  period: 'forever' | 'month';
  featured: boolean;
  href: string;
  features: readonly string[];
}[];

export type PricingPlan = (typeof PRICING_PLANS)[number];
export type PricingPlanKey = PricingPlan['key'];

/** The pills stacked beside the plans on wide screens, and above them otherwise. */
export const PRICING_BADGES = ['secure', 'faster', 'trusted'] as const;
export type PricingBadge = (typeof PRICING_BADGES)[number];

/** The strip under the plans. */
export const PRICING_ASSURANCES = ['lockIn', 'privacy', 'support', 'india'] as const;
export type PricingAssurance = (typeof PRICING_ASSURANCES)[number];

/** `₹1,299`, grouped the Indian way in both locales. */
export function formatPlanPrice(priceInr: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(priceInr);
}
