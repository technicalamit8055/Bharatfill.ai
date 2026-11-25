/**
 * Home dashboard colour tokens.
 *
 * Home is light-only branded artwork like registration and onboarding: its hero and CSC
 * illustrations are flat JPEGs on white, blended into light cards. So it does not read from
 * `useTheme()`, and the values live here so home components still obey the "no hex literals in
 * a component" rule.
 *
 * Category hues follow `vaultCategory` in `theme/colors.ts` (identity blue, academic green,
 * certificate orange, form assets purple), so a vault section is the same colour on every tab.
 * These are the brighter artwork tints from the mockup, not semantic tokens — do not reuse them
 * elsewhere in the app.
 */

export const homePalette = {
  background: '#F6F9FF',
  surface: '#FFFFFF',
  border: '#E3EAF5',
  cardShadow: '#1E3A8A',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  /** Captions on white and on the pastel tiles; stays above 4.5:1 on both. */
  textMuted: '#556275',

  brandBlue: '#0066FF',
  brandBluePressed: '#0052CC',
  onBrand: '#FFFFFF',
  logoShadow: '#0066FF',

  /** Header: bell, unread dot and the initials avatar. */
  headerIcon: '#1E293B',
  notificationDot: '#EF4444',
  notificationDotRing: '#FFFFFF',
  avatarSurface: '#E3EDFF',
  avatarText: '#1E3A8A',

  /** "Scan करें, Secure रखें" hero card. */
  heroGradient: ['#D6E6FF', '#E9F2FF', '#F5F9FF'],
  heroTitle: '#0B1736',

  /** "Form Bharna Ab Aur Bhi Aasaan" banner. */
  bannerGradient: ['#DDEBFF', '#EEF5FF'],
  bannerButtonBorder: '#CFE0FF',

  /** Recent documents: the well behind each thumbnail, and the empty state. */
  thumbnailSurface: '#F1F5F9',
  emptyBorder: '#CBD5E1',

  /** Document checklist: ready, expired, and the progress bar. */
  readySurface: '#E6F6EC',
  readyText: '#136C34',
  warningSurface: '#FFF3DC',
  warningText: '#8A4B00',
  progressFill: '#16A34A',
  progressTrack: '#E3EAF5',

  quickActions: {
    document: { tile: '#EDF4FF', border: '#DCE8FF' },
    upload: { tile: '#E8F7F8', border: '#D0EEF0' },
    multi_page: { tile: '#FFF5E6', border: '#FFE6C2' },
  },
} as const;
