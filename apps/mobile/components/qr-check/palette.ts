/**
 * QR check card colour tokens. Built on the vault's light palette, like the screens the card
 * sits on (Save Document, Document Details). Text on every tint stays above 4.5:1.
 */

import { vaultPalette } from '../vault/palette';

export const qrCheckPalette = {
  surface: vaultPalette.surface,
  border: vaultPalette.border,
  heading: vaultPalette.heading,
  textPrimary: vaultPalette.textPrimary,
  textSecondary: vaultPalette.textSecondary,
  brandBlue: vaultPalette.brandBlue,
  onBrand: vaultPalette.onBrand,
  divider: '#E2E8F0',

  tone: {
    success: { surface: '#EAF8F0', border: '#B7E4C7', icon: '#15803D' },
    info: { surface: '#EEF5FF', border: '#C7DBFF', icon: '#1D56C9' },
    warning: { surface: '#FDF2E0', border: '#F2D19B', icon: '#9A5B00' },
    neutral: { surface: '#F1F5F9', border: '#DCE3EE', icon: '#475569' },
  },
} as const;
