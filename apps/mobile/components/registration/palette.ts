/**
 * Mobile-number registration colour tokens.
 *
 * Registration is light-only branded artwork like the splash and onboarding, so it does not
 * read from `useTheme()`. The values live here so registration components still obey the
 * "no hex literals in a component" rule.
 *
 * These are artwork colours, not semantic tokens — do not reuse them elsewhere in the app.
 */

export const registrationPalette = {
  background: '#FFFFFF',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',

  /** Brand wordmark and the accent word of the headline. */
  brandNavy: '#0F172A',
  brandBlue: '#0066FF',
  logoShadow: '#0066FF',

  /** Back chevron and Skip. */
  navIcon: '#1E293B',
  navLabel: '#334155',

  /** Phone field. */
  fieldSurface: '#FFFFFF',
  fieldBorder: '#CBD5E1',
  fieldBorderFocused: '#0066FF',
  fieldBorderError: '#DC2626',
  fieldDivider: '#CBD5E1',
  fieldPlaceholder: '#94A3B8',
  errorText: '#B91C1C',

  /** Primary CTA. */
  cta: '#0066FF',
  ctaPressed: '#0052CC',
  ctaLabel: '#FFFFFF',

  /** Terms / Privacy links, and Resend OTP once it unlocks. */
  link: '#0066FF',
  linkDisabled: '#94A3B8',

  /** OTP screen: the "OTP VERIFICATION" label and the dash in an empty code box. */
  eyebrow: '#64748B',
  otpDash: '#CBD5E1',

  /** Privacy reassurance card. */
  cardSurface: '#F5F9FF',
  cardBorder: '#E6EEFB',
  shieldSurface: '#DCFCE7',
  shield: '#15803D',

  /** Profile setup: the blue "safe with us" shield, filled, with a white tick. */
  trustShieldSurface: '#E3EDFF',
  trustShield: '#0066FF',
  trustShieldTick: '#FFFFFF',

  /** Profile setup: the registration progress stepper. */
  stepReached: '#0066FF',
  stepReachedNumber: '#FFFFFF',
  stepActiveHalo: '#D6E6FF',
  stepUpcomingSurface: '#FFFFFF',
  stepUpcomingBorder: '#CBD5E1',
  stepUpcomingNumber: '#64748B',
  stepConnector: '#E2E8F0',

  /** Profile setup: leading icons and chevrons inside the form fields. */
  fieldIcon: '#1E293B',

  /** Profile setup: the chosen gender and the chosen row in a picker sheet. */
  choiceSelectedSurface: '#EAF2FF',
  choiceSelectedBorder: '#0066FF',
  choiceSelectedLabel: '#0066FF',

  /** Profile setup: picker sheets. */
  sheetBackdrop: 'rgba(15, 23, 42, 0.45)',
  sheetSurface: '#FFFFFF',
  sheetHandle: '#CBD5E1',
  sheetDivider: '#F1F5F9',
  ctaDisabled: '#A7C7FF',

  /** Footer caption and its tricolour bar. */
  footerText: '#64748B',
  saffron: '#FF9933',
  neutralBar: '#E2E8F0',
  green: '#138808',
} as const;
