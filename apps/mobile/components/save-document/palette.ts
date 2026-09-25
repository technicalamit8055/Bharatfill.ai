/**
 * Save Document colour tokens.
 *
 * Light-only branded artwork like the Vault tab it saves into, so it builds on `vaultPalette`
 * and keeps its extra values here to obey the "no hex literals in a component" rule. The status
 * card's green follows Home's ID-card tint; text on every tint stays above 4.5:1.
 */

import { homePalette } from '../home/palette';
import { vaultPalette } from '../vault/palette';

export const saveDocumentPalette = {
  background: vaultPalette.background,
  surface: vaultPalette.surface,
  border: vaultPalette.border,
  cardShadow: vaultPalette.cardShadow,

  heading: vaultPalette.heading,
  textPrimary: vaultPalette.textPrimary,
  textSecondary: vaultPalette.textSecondary,
  textMuted: vaultPalette.textMuted,
  placeholder: '#94A3B8',

  brandBlue: vaultPalette.brandBlue,
  brandBluePressed: homePalette.brandBluePressed,
  brandBlueDisabled: '#9CC2FF',
  onBrand: vaultPalette.onBrand,

  /** "1/3" page badge. */
  badge: '#E3EDFF',
  badgeText: '#1D56C9',

  /** The scan preview's frame and its "Edit Scan" pill. */
  previewFrame: '#EEF2F7',
  previewBorder: '#E2E8F0',
  editPill: 'rgba(51, 65, 85, 0.88)',
  onEditPill: '#FFFFFF',

  field: '#FFFFFF',
  fieldBorder: '#DCE3EE',
  fieldBorderFocused: vaultPalette.brandBlue,
  clearButton: '#C7CFDB',
  onClearButton: '#FFFFFF',
  error: '#C2341D',
  errorBorder: '#E7A89C',

  typeBadge: vaultPalette.brandBlue,
  onTypeBadge: '#FFFFFF',

  tag: '#E6EFFD',
  tagText: '#1E3A8A',
  addTagBorder: '#94A3B8',

  status: {
    clear: { surface: '#EAF8F0', icon: '#16A34A', title: '#0B1736', body: '#475569' },
    uncropped: { surface: '#FDF2E0', icon: '#B26A00', title: '#0B1736', body: '#475569' },
    failed: { surface: '#FBEAE7', icon: '#C2341D', title: '#0B1736', body: '#475569' },
    processing: {
      surface: '#EEF5FF',
      icon: vaultPalette.brandBlue,
      title: '#0B1736',
      body: '#475569',
    },
  },

  /** "Keep it Secure" card. */
  secureSurface: '#EEF4FD',
  secureBadge: '#DCE8FB',
  secureIcon: vaultPalette.brandBlue,

  reminderSurface: '#F4F7FB',
  reminderBadge: '#FFFFFF',
  reminderIcon: '#1E293B',
  switchTrackOff: '#CBD5E1',
  switchTrackOn: '#8DB8FF',
  switchThumbOff: '#FFFFFF',
  switchThumbOn: vaultPalette.brandBlue,
} as const;
