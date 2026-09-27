/**
 * Illustrations for the scheme detail page, keyed by scheme slug.
 *
 * Presentation only, and deliberately opt-in per scheme: the hospital banner has "Ayushman Bharat
 * PM-JAY" painted onto the building, so falling back to it for any other scheme would put the
 * wrong programme's name on the page. A scheme with no entry here gets the same layout with the
 * category icon and no artwork.
 *
 * The strings are translation keys, never copy. The facts they carry must agree with the scheme's
 * own `benefitsSummary` in `@assistigo/core` — the test next to this file pins the slug to the
 * built-in catalogue so a rename cannot silently orphan an entry.
 *
 * Any scheme can also carry its own logo, banner and illustration, uploaded in the admin panel
 * (migration 0028); `resolveSchemeImages` puts those ahead of anything bundled here.
 */

import type { SchemeImageKind } from '@assistigo/core';
import { schemeImageSrc } from './logo';

/** Pills under the title. The page owns the icon and tint for each. */
export const SCHEME_ART_TAGS = ['health', 'familySupport', 'governmentScheme'] as const;
export type SchemeArtTag = (typeof SCHEME_ART_TAGS)[number];

export type SchemeArtwork = {
  /** Square emblem shown beside the title. An uploaded admin logo still wins over this. */
  logo: string;
  /** Wide artwork behind the right side of the hero. Hidden below `md`. */
  banner: string;
  /** The picture between the actions and the benefit checklist. */
  illustration: string;
  /** The floating money card: `{eyebrowKey} {amount} {suffixKey}`. Rupees. */
  cover: { amount: number; eyebrowKey: string; suffixKey: string };
  tags: readonly SchemeArtTag[];
  /** Short benefit lines for the checklist, as translation keys. */
  benefitKeys: readonly string[];
};

const ARTWORK: Readonly<Record<string, SchemeArtwork>> = {
  'ayushman-bharat-pmjay': {
    logo: '/schemes/ayushman-bharat-logo.png',
    banner: '/schemes/ayushman-hospital-banner.png',
    illustration: '/schemes/family-health-shield.png',
    cover: {
      amount: 500_000,
      eyebrowKey: 'schemes.detail.art.pmjay.coverEyebrow',
      suffixKey: 'schemes.detail.art.pmjay.coverSuffix',
    },
    tags: ['health', 'familySupport', 'governmentScheme'],
    benefitKeys: [
      'schemes.detail.art.pmjay.benefitCashless',
      'schemes.detail.art.pmjay.benefitNoPremium',
      'schemes.detail.art.pmjay.benefitCare',
      'schemes.detail.art.pmjay.benefitFamilies',
    ],
  },
};

export function schemeArtwork(slug: string): SchemeArtwork | null {
  return Object.hasOwn(ARTWORK, slug) ? (ARTWORK[slug] ?? null) : null;
}

/** Every slug with artwork, for the catalogue check in the test. */
export const SCHEME_ARTWORK_SLUGS: readonly string[] = Object.keys(ARTWORK);

export type ResolvedSchemeImage = {
  src: string;
  /**
   * True for an admin upload. Those are served by the signed-in /scheme-logos route, which the
   * image optimiser would fetch without the viewer's cookies — so they must render unoptimised.
   */
  uploaded: boolean;
};

/**
 * The picture to show for each slot on the detail page.
 *
 * An image uploaded in the admin panel wins, kind by kind; the bundled artwork fills whatever is
 * left. Uploading only a banner for PM-JAY keeps its bundled logo and illustration.
 */
export function resolveSchemeImages(
  paths: {
    logoPath?: string | null;
    bannerPath?: string | null;
    illustrationPath?: string | null;
  },
  art: SchemeArtwork | null,
): Record<SchemeImageKind, ResolvedSchemeImage | null> {
  const pick = (path: string | null | undefined, bundled: string | undefined) => {
    const uploaded = schemeImageSrc(path);
    if (uploaded) return { src: uploaded, uploaded: true };
    return bundled ? { src: bundled, uploaded: false } : null;
  };
  return {
    logo: pick(paths.logoPath, art?.logo),
    banner: pick(paths.bannerPath, art?.banner),
    illustration: pick(paths.illustrationPath, art?.illustration),
  };
}
