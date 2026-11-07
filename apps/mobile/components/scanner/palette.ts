/**
 * Scanner colour tokens (camera and review). The scanner is dark in both colour schemes, like a
 * camera, matching the mockup. Artwork colours, not semantic tokens — do not reuse them
 * elsewhere in the app.
 */

export const scannerPalette = {
  background: '#070B14',
  backgroundGradient: ['#131D31', '#0A101C', '#05080F'],

  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',
  /** "document" in the headline, the frame corners and the scan line. */
  accent: '#2F8BFF',
  accentGlow: '#1E7BFF',

  frameFill: 'rgba(255, 255, 255, 0.04)',
  frameBorder: 'rgba(143, 184, 255, 0.22)',
  frameIcon: '#8FB8FF',

  control: 'rgba(15, 23, 42, 0.72)',
  controlPressed: 'rgba(51, 65, 85, 0.9)',
  controlBorder: 'rgba(255, 255, 255, 0.24)',
  controlActiveBorder: '#2F8BFF',

  segmentTrack: 'rgba(15, 23, 42, 0.85)',
  segmentActive: '#1677FF',
  segmentLabel: '#E2E8F0',

  shutterRing: '#1E7BFF',
  shutterFill: '#FFFFFF',
  shutterPressed: '#D6E4FF',
  shutterBusy: '#1E7BFF',

  cardSurface: 'rgba(15, 23, 42, 0.8)',
  cardBorder: 'rgba(255, 255, 255, 0.12)',
  cardIconSurface: 'rgba(255, 255, 255, 0.08)',
  divider: 'rgba(255, 255, 255, 0.18)',

  overlay: 'rgba(3, 7, 18, 0.78)',

  /** Live camera: the detected page, the auto-capture ring, and the shot's white flash. */
  detectedFill: 'rgba(47, 139, 255, 0.18)',
  shutterProgress: '#FFFFFF',
  captureFlash: '#FFFFFF',
  /** Darkening at the top and bottom of the preview, so the controls stay readable. */
  scrimTop: ['rgba(3, 7, 18, 0.85)', 'rgba(3, 7, 18, 0)'],
  scrimBottom: ['rgba(3, 7, 18, 0)', 'rgba(3, 7, 18, 0.9)'],
  controlActive: 'rgba(22, 119, 255, 0.35)',
  badge: '#1677FF',

  /** Review screen. */
  reviewSurface: '#0F1726',
  chip: 'rgba(255, 255, 255, 0.1)',
  chipSelected: '#1677FF',
  handle: '#FFFFFF',
  danger: '#F87171',
  /** Crop editor: the photo outside the crop, dimmed. */
  cropMask: 'rgba(3, 7, 18, 0.55)',
} as const;

/**
 * Scan review colour tokens. Unlike the camera, review is light branded artwork like Save
 * Document, which it leads to: a pale page, a dark stage for the scan, white cards. Text on
 * every tint stays above 4.5:1.
 */
export const scanReviewPalette = {
  background: '#F6F9FF',
  surface: '#FFFFFF',
  border: '#E3EAF5',
  cardShadow: '#1E3A8A',

  heading: '#101C4F',
  subtitle: '#64748B',
  textPrimary: '#0F172A',
  textSecondary: '#475569',

  brandBlue: '#1677FF',
  brandBluePressed: '#0B5ED7',
  onBrand: '#FFFFFF',

  backButton: '#E9EEF6',
  backIcon: '#1E2A78',

  /** The dark stage the page sits on, its crop dots and the zoom button. */
  stage: '#18212F',
  onStage: '#FFFFFF',
  onStageMuted: '#CBD5E1',
  stageVeil: 'rgba(15, 23, 42, 0.7)',
  pageOutline: 'rgba(255, 255, 255, 0.85)',
  cornerDot: '#1677FF',
  cornerDotBorder: '#FFFFFF',
  zoomButton: 'rgba(255, 255, 255, 0.16)',
  notice: 'rgba(15, 23, 42, 0.85)',

  /** Filter cards. */
  filterCard: '#FFFFFF',
  filterCardBorder: '#E5EBF3',
  filterSelected: '#EAF3FF',
  filterSelectedBorder: '#5AA2FF',
  filterIcon: '#475569',
  filterLabel: '#1E293B',
  filterWell: '#EEF2F7',

  /** Page strip. */
  stripSurface: '#EEF2F8',
  stripBorder: '#E3E9F2',
  thumbSurface: '#FFFFFF',
  thumbSelectedBorder: '#1677FF',
  badge: '#FFFFFF',
  badgeText: '#475569',
  badgeSelected: '#1677FF',
  onBadgeSelected: '#FFFFFF',
  pageLabel: '#475569',
  pageLabelSelected: '#0F172A',

  /** Crop / Rotate / Delete page / Add page. */
  actionCircle: '#EEF3FA',
  actionCircleBorder: '#FFFFFF',
  actionIcon: '#1E293B',
  deleteCircle: '#FDE4E8',
  deleteIcon: '#E11D48',

  /** The photo-quality warning: amber, its text dark enough for 4.5:1 on it. */
  warningSurface: '#FFF6E5',
  warningBorder: '#F6C77A',
  warningIcon: '#B45309',
  warningText: '#7C2D12',

  /** Crop editor's tool card: Rotate left / right and the straighten dial. */
  dialTick: '#CBD5E1',
  dialTickMajor: '#64748B',
  dialLabel: '#64748B',
  dialValue: '#101C4F',
  dialValueSurface: '#EAF3FF',

  /** Zoom viewer. */
  zoomBackdrop: '#0B1220',
  zoomControl: 'rgba(255, 255, 255, 0.14)',
  zoomHint: 'rgba(15, 23, 42, 0.72)',
  onZoomHint: '#E2E8F0',
} as const;
