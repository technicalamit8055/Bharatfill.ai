/**
 * Profile tab colour tokens.
 *
 * Profile is light-only branded artwork like Home and the vault, drawn from the same mockup set,
 * so it shares their page, card and text colours and keeps its own values here to obey the "no
 * hex literals in a component" rule.
 *
 * Text on a tint stays above 4.5:1: the verified pill's green and the log-out red are darker
 * than the mockup's so they pass on their pale backgrounds.
 */

import { homePalette } from '../home/palette';

export const profilePalette = {
  background: homePalette.background,
  surface: homePalette.surface,
  border: homePalette.border,
  cardShadow: homePalette.cardShadow,

  heading: '#0E1A4F',
  textPrimary: '#101A45',
  textSecondary: homePalette.textSecondary,
  textMuted: homePalette.textMuted,
  chevron: '#334155',
  headerIcon: '#101A45',
  divider: '#E8EDF5',

  brandBlue: homePalette.brandBlue,
  brandBluePressed: homePalette.brandBluePressed,
  onBrand: homePalette.onBrand,

  /** Initials avatar and its camera badge. */
  avatarSurface: homePalette.avatarSurface,
  avatarText: homePalette.avatarText,
  avatarBadge: '#5B6B8C',
  avatarBadgeRing: '#FFFFFF',

  verifiedSurface: '#E6F6EC',
  verifiedText: '#136C34',
  verifiedIcon: '#16A34A',

  /** "Free Plan" card. */
  planSurface: '#EAF2FE',
  planBorder: '#DCE8FC',
  planBadge: '#FDE9C4',
  planIcon: '#F59E0B',

  /** Round well behind each settings icon. */
  menuIconSurface: '#EEF3FB',

  logoutSurface: '#FDECEE',
  logoutBorder: '#F5B5BD',
  logoutText: '#C81E1E',
} as const;
