/**
 * Onboarding colour tokens.
 *
 * Like the splash, onboarding is light-only marketing artwork: it has to match the approved
 * explainer design and the store screenshots regardless of the device's colour scheme, so it
 * does not read from `useTheme()`. The values live here so onboarding components still obey the
 * "no hex literals in a component" rule.
 *
 * These are artwork colours, not semantic tokens — do not reuse them elsewhere in the app.
 */

export const onboardingPalette = {
  background: '#FFFFFF',

  /** Two layers of the soft blue swoosh behind the footer. */
  waveBack: '#F0F7FF',
  waveFront: '#E3EEFF',

  /** Headline and titles in deep navy; supporting copy in slate. */
  textPrimary: '#0F172A',
  textSecondary: '#64748B',

  /** Brand wordmark: "Bharat" navy, "Doc" blue. */
  brandNavy: '#0F172A',
  brandBlue: '#0066FF',

  /** Headline accents. */
  accentScan: '#EA580C',
  accentSave: '#16A34A',

  /** Skip pill. */
  skipSurface: '#F1F5F9',
  skipLabel: '#475569',

  /** Pagination. */
  dotActive: '#0066FF',
  dotInactive: '#E2E8F0',

  /** Primary CTA. */
  cta: '#0066FF',
  ctaPressed: '#0052CC',
  ctaLabel: '#FFFFFF',

  /** Feature badges: icon colour on a pastel disc. */
  featureScan: '#0284C7',
  featureScanSurface: '#E0F2FE',
  featureVault: '#16A34A',
  featureVaultSurface: '#DCFCE7',
  featureForms: '#EA580C',
  featureFormsSurface: '#FFEDD5',
  featureReach: '#7C3AED',
  featureReachSurface: '#EDE9FE',
} as const;
