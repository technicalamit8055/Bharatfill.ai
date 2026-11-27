/**
 * Vault tab colour tokens.
 *
 * The vault is light-only branded artwork like Home, drawn from the same mockup set, so it
 * shares Home's page, card and text colours and keeps its own values here to obey the "no hex
 * literals in a component" rule.
 *
 * Category hues follow `vaultCategory` in `theme/colors.ts` (identity blue, academic green,
 * certificate orange, form assets purple), as on Home. Tag text stays above 4.5:1 on its tint.
 */

import { homePalette } from '../home/palette';

export const vaultPalette = {
  background: homePalette.background,
  surface: homePalette.surface,
  border: homePalette.border,
  cardShadow: homePalette.cardShadow,

  heading: '#0B1736',
  textPrimary: homePalette.textPrimary,
  textSecondary: homePalette.textSecondary,
  textMuted: homePalette.textMuted,
  /** "Cyber cafes can't see this yet" on a card; above 4.5:1 on the white card. */
  error: '#C2341D',

  brandBlue: homePalette.brandBlue,
  onBrand: homePalette.onBrand,

  /** Round search / more buttons in the header. */
  headerButton: '#EAF0FA',
  headerIcon: '#1E293B',

  chipBorder: '#DDE5F0',
  chipText: '#475569',

  star: homePalette.brandBlue,
  starOff: '#64748B',

  thumbnailSurface: homePalette.thumbnailSurface,
  emptyBorder: homePalette.emptyBorder,

  neutralTag: { background: '#EEF2F7', text: '#475569' },

  categories: {
    identity: {
      tile: '#EDF4FF',
      border: '#DCE8FF',
      icon: '#1D6BFF',
      tag: '#E3EDFF',
      tagText: '#1D56C9',
    },
    academic: {
      tile: '#EBF8F1',
      border: '#D5F0E0',
      icon: '#16A34A',
      tag: '#DDF4E6',
      tagText: '#15703A',
    },
    certificate: {
      tile: '#FFF4EA',
      border: '#FFE4CC',
      icon: '#EA6A0C',
      tag: '#FFEAD9',
      tagText: '#B03A0A',
    },
    form_asset: {
      tile: '#F5F0FF',
      border: '#E6DCFF',
      icon: '#7C3AED',
      tag: '#EFE7FF',
      tagText: '#6526D9',
    },
  },
} as const;
