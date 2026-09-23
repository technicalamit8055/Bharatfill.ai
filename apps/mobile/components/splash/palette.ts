/**
 * Splash-screen colour tokens.
 *
 * The splash is the one surface that does not follow the themed palette in `theme/colors.ts`:
 * it is always light, always the same, and its colours come from the approved launch artwork
 * (`assets/splash/mockup-reference.png`) rather than from the product ramp. They live here so
 * the splash components still obey the "no hex literals in a component" rule, and so a change
 * to the launch artwork is a one-file edit.
 *
 * These are brand/flag colours, not semantic tokens — do not reuse them elsewhere in the app.
 */

export const splashPalette = {
  /** Page background — the splash is light-only by design. */
  background: '#FFFFFF',

  /** Flag saffron and green, used by the wave ribbon and the mini indicator bars. */
  saffron: '#FF9933',
  green: '#138808',
  /** The neutral that stands in for white between the two flag bands. */
  neutralBar: '#E2E8F0',

  /** "Bharat" in deep navy, "Doc" in electric blue. */
  brandNavy: '#0B2545',
  brandBlue: '#0070F3',

  /** Ambient glow cast by the app icon. */
  iconGlow: '#0066FF',

  /** Supporting text, lightest to darkest. */
  watermark: '#94A3B8',
  calligraphy: '#A5B4FC',
  caption: '#64748B',
  subtitle: '#475569',

  /** Spinner track and its moving arc. */
  spinnerTrack: '#E2E8F0',
  spinnerArc: '#0070F3',
} as const;
