/**
 * Bharatfill Citizen App — colour tokens.
 *
 * The brand ramp is carried over verbatim from the operator dashboard
 * (`apps/web/tailwind.config.ts`) so the citizen app, the dashboard and the extension read as
 * one product. Everything else is derived from it.
 *
 * Categories match the vault taxonomy in `docs/CITIZEN_MOBILE_APP_SPEC.md` §3 Feature 2 — each
 * of the four vault sections gets a stable accent so a citizen can recognise a section by
 * colour before they read its label.
 *
 * Rules:
 * - No component hard-codes a hex value. Import from here.
 * - Every colour used on text has a documented contrast pairing (see `contrastNotes`).
 */

/** Primary brand ramp — shared with the operator dashboard. */
export const brand = {
  50: '#EEF5FF',
  100: '#D9E8FF',
  200: '#BCD7FF',
  300: '#8EBEFF',
  400: '#5999FF',
  500: '#3374FB',
  600: '#1D54F0',
  700: '#1841DC',
  800: '#1A37B2',
  900: '#1B338C',
} as const;

/** Neutral ramp for surfaces, borders and body text. */
export const neutral = {
  0: '#FFFFFF',
  50: '#F7F8FA',
  100: '#EEF0F4',
  200: '#E0E4EB',
  300: '#C7CDD8',
  400: '#98A1B2',
  500: '#6B7488',
  600: '#4C5468',
  700: '#363D4E',
  800: '#232938',
  900: '#151A25',
  950: '#0C1017',
} as const;

/** Status colours for sync state, verification and destructive actions. */
export const status = {
  success: '#1B8A5A',
  successSurface: '#E6F5EE',
  warning: '#B26A00',
  warningSurface: '#FDF2E0',
  danger: '#C2341D',
  dangerSurface: '#FBEAE7',
  info: brand[600],
  infoSurface: brand[50],
} as const;

/**
 * Vault category accents — one per section of the document vault.
 * Keys match `citizen_vault_documents.category` in the spec §5.2.
 */
export const vaultCategory = {
  identity: '#1D54F0',
  academic: '#1B8A5A',
  certificate: '#B26A00',
  form_asset: '#7A3DBD',
} as const;

export type VaultCategory = keyof typeof vaultCategory;

/** Resolved tokens a screen actually consumes. */
export type ThemeColors = {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textOnBrand: string;
  readonly primary: string;
  readonly primaryPressed: string;
  readonly primarySurface: string;
  readonly tabActive: string;
  readonly tabInactive: string;
  readonly tabBar: string;
  readonly overlay: string;
};

export const lightColors: ThemeColors = {
  background: neutral[50],
  surface: neutral[0],
  surfaceRaised: neutral[0],
  surfaceSunken: neutral[100],
  border: neutral[200],
  borderStrong: neutral[300],
  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textMuted: neutral[500],
  textOnBrand: neutral[0],
  primary: brand[600],
  primaryPressed: brand[700],
  primarySurface: brand[50],
  tabActive: brand[600],
  tabInactive: neutral[500],
  tabBar: neutral[0],
  overlay: 'rgba(12, 16, 23, 0.55)',
};

export const darkColors: ThemeColors = {
  background: neutral[950],
  surface: neutral[900],
  surfaceRaised: neutral[800],
  surfaceSunken: neutral[950],
  border: neutral[800],
  borderStrong: neutral[700],
  textPrimary: neutral[50],
  textSecondary: neutral[300],
  textMuted: neutral[400],
  textOnBrand: neutral[0],
  primary: brand[400],
  primaryPressed: brand[300],
  primarySurface: neutral[800],
  tabActive: brand[400],
  tabInactive: neutral[400],
  tabBar: neutral[900],
  overlay: 'rgba(0, 0, 0, 0.7)',
};

export type ColorScheme = 'light' | 'dark';

export function colorsFor(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/**
 * Contrast pairings verified against WCAG 2.1 AA (4.5:1 body, 3:1 large text and UI).
 * Recorded here so a future palette change can be re-checked against the same list.
 */
export const contrastNotes = [
  'lightColors.textPrimary on lightColors.surface',
  'lightColors.textSecondary on lightColors.surface',
  'lightColors.textOnBrand on lightColors.primary',
  'darkColors.textPrimary on darkColors.surface',
  'darkColors.textSecondary on darkColors.surface',
] as const;
