/**
 * Dialog and action-sheet colour tokens.
 *
 * Popups open over every screen, and every screen they open over is light-only branded artwork
 * (Home, Vault, Profile, Connect, the scanner flow), so the popups are light-only too and share
 * Home's brand blue and text colours. Tone hues follow `status` in `theme/colors.ts`; each tone's
 * icon colour stays above 3:1 on its badge, and button labels above 4.5:1 on their fills.
 */

import { homePalette } from '../home/palette';

export const dialogPalette = {
  /** Navy scrim, so the screen behind recedes without turning grey. */
  backdrop: 'rgba(11, 23, 54, 0.52)',
  surface: '#FFFFFF',
  shadow: '#0B1736',

  heading: '#0B1736',
  body: homePalette.textSecondary,
  muted: homePalette.textMuted,
  divider: '#EEF2F7',
  handle: '#D5DCE6',

  primary: homePalette.brandBlue,
  primaryPressed: homePalette.brandBluePressed,
  onPrimary: homePalette.onBrand,

  danger: '#D92D20',
  dangerPressed: '#B42318',
  onDanger: '#FFFFFF',

  secondary: '#F1F5F9',
  secondaryPressed: '#E2E8F0',
  onSecondary: '#0F172A',

  rowPressed: '#F4F7FB',
  chevron: '#94A3B8',

  /** Icon badge: an outer halo, an inner disc and the icon. */
  tones: {
    info: { halo: '#EEF4FF', disc: '#DCE8FF', icon: '#1D56C9' },
    brand: { halo: '#EEF4FF', disc: '#DCE8FF', icon: homePalette.brandBlue },
    success: { halo: '#ECFDF3', disc: '#D1FADF', icon: '#067647' },
    warning: { halo: '#FFFAEB', disc: '#FEF0C7', icon: '#B54708' },
    danger: { halo: '#FEF3F2', disc: '#FEE4E2', icon: '#D92D20' },
  },

  /** Action-sheet row icon tiles. */
  actionTile: { background: '#EEF4FF', icon: '#1D56C9' },
  actionTileDanger: { background: '#FEF3F2', icon: '#D92D20' },
} as const;
