/**
 * The FAQ on the landing page: which questions it answers, in what order, and the trust points
 * in the rails either side. Copy lives in `landing.faq.*`; each key's icon and colours live with
 * the component.
 */

/** Display order; the first question starts open. */
export const FAQ_ITEMS = [
  'safety',
  'privacy',
  'languages',
  'install',
  'teams',
  'layoutChanges',
] as const;
export type FaqItem = (typeof FAQ_ITEMS)[number];

/** The rows of the card under the mascot, left of the questions. */
export const FAQ_ASSURANCES = ['support', 'secure', 'india'] as const;
export type FaqAssurance = (typeof FAQ_ASSURANCES)[number];

/** The badges under the building, right of the questions. */
export const FAQ_STATS = ['portals', 'faster', 'trusted'] as const;
export type FaqStat = (typeof FAQ_STATS)[number];
