/**
 * Family profile colour tokens: the member switcher on Home and the Vault tab, and the Family
 * screen. Light-only branded artwork like the screens it sits on, so it reads from the Home
 * palette rather than `useTheme()`, and keeps its few own values here.
 */

import { homePalette } from '../home/palette';

export const familyPalette = {
  background: homePalette.background,
  surface: homePalette.surface,
  border: homePalette.border,
  cardShadow: homePalette.cardShadow,

  heading: '#0B1736',
  textPrimary: homePalette.textPrimary,
  textSecondary: homePalette.textSecondary,
  textMuted: homePalette.textMuted,

  brandBlue: homePalette.brandBlue,
  onBrand: homePalette.onBrand,

  chipBorder: '#DDE5F0',
  chipText: '#334155',
  avatarSurface: homePalette.avatarSurface,
  avatarText: homePalette.avatarText,
  /** The initials on a selected chip, on brand blue. */
  avatarSelectedSurface: '#FFFFFF',

  /** Expired or soon-to-expire documents: the dot on a chip and the line on a Family row. */
  alertDot: '#EF4444',
  alertDotRing: '#FFFFFF',
  warningSurface: homePalette.warningSurface,
  warningText: homePalette.warningText,
  dangerSurface: '#FDECEC',
  dangerText: '#B42318',

  /** The "stays on this phone" note on the Family screen. */
  noteSurface: '#EDF4FF',
  noteText: '#1D56C9',
} as const;
