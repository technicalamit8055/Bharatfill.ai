/**
 * Document Details colour tokens.
 *
 * Light-only branded artwork like the Vault tab it opens from, so it builds on `vaultPalette`
 * and keeps its extra values here to obey the "no hex literals in a component" rule. The action
 * hues are the mockup's; each label sits on the pale action bar, not on its circle, and stays
 * above 4.5:1 there.
 */

import { homePalette } from '../home/palette';
import { vaultPalette } from '../vault/palette';

export const documentDetailsPalette = {
  background: vaultPalette.background,
  surface: vaultPalette.surface,
  border: vaultPalette.border,
  cardShadow: vaultPalette.cardShadow,

  heading: '#101C4F',
  subtitle: '#4A5A8A',
  textPrimary: vaultPalette.textPrimary,
  textSecondary: vaultPalette.textSecondary,
  textMuted: vaultPalette.textMuted,
  placeholder: '#94A3B8',

  brandBlue: vaultPalette.brandBlue,
  brandBluePressed: homePalette.brandBluePressed,
  onBrand: vaultPalette.onBrand,

  /** Back chevron and the round star / more buttons in the header. */
  backIcon: '#1E2A78',
  starButton: '#E4EEFD',
  moreButton: '#EDF2FA',
  headerIcon: '#1E293B',

  /** The dark frame the pages scroll in, its "1 / 2" pill and its arrows. */
  viewerFrame: '#3A3D43',
  viewerPage: '#FFFFFF',
  viewerPagePlaceholder: '#50545B',
  viewerPill: 'rgba(22, 24, 28, 0.78)',
  viewerPillBorder: 'rgba(255, 255, 255, 0.22)',
  viewerArrow: 'rgba(22, 24, 28, 0.78)',
  viewerArrowBorder: 'rgba(255, 255, 255, 0.28)',
  onViewer: '#FFFFFF',
  onViewerMuted: '#C9CDD4',

  /** Share / Download / Print / More. */
  actionBar: '#EAF1FC',
  actionDivider: '#D5DFEE',
  actionLabel: '#2B3A55',
  actions: {
    share: { circle: '#1673F5', icon: '#FFFFFF' },
    download: { circle: '#1FA152', icon: '#FFFFFF' },
    print: { circle: '#8F57EE', icon: '#FFFFFF' },
    more: { circle: '#E0E8F4', icon: '#1E293B' },
  },

  /** Document Details card. */
  rowDivider: '#EDF1F7',
  rowIcon: '#334155',
  rowLabel: '#475569',
  rowValue: '#1E293B',
  editPill: '#E6EFFD',
  tag: '#E6EFFD',
  tagText: '#1D56C9',
  addTagBorder: '#8A9BB4',
  addTagText: '#1E293B',

  /** "Stored Securely" card. */
  secureSurface: '#EDF3FC',
  secureBadge: '#DCE8FB',
  secureIcon: vaultPalette.brandBlue,

  moveSurface: '#EAF1FC',
  moveBorder: '#C5D8F5',
  deleteSurface: '#FDE9ED',
  deleteBorder: '#F6C1CB',
  deleteText: '#D1123F',

  /** The sheets and the "Preparing…" overlay. */
  backdrop: 'rgba(15, 23, 42, 0.45)',
  sheetHandle: '#CBD5E1',
  field: '#FFFFFF',
  fieldBorder: '#DCE3EE',
  fieldBorderFocused: vaultPalette.brandBlue,
  error: '#C2341D',
  menuPressed: '#F1F5F9',
} as const;
