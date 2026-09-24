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
} as const;
