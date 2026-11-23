/**
 * Upload colour tokens (`ImportScreen`, `PdfPasswordSheet`): the light branded artwork of scan
 * review and Save Document, which Upload leads to. Text on every surface stays above 4.5:1.
 * Artwork colours, not semantic tokens — do not reuse them elsewhere in the app.
 */

export const importPalette = {
  background: '#F6F9FF',
  surface: '#FFFFFF',
  border: '#E3EAF5',
  cardShadow: '#1E3A8A',
  backdrop: 'rgba(15, 23, 42, 0.5)',
  handle: '#CBD5E1',

  heading: '#101C4F',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  placeholder: '#94A3B8',

  brandBlue: '#1677FF',
  brandBluePressed: '#0B5ED7',
  onBrand: '#FFFFFF',

  backButton: '#E9EEF6',
  backIcon: '#1E2A78',

  /** The two choices: photos (blue) and PDF / file (teal), as on Home's tiles. */
  photosTile: '#EDF4FF',
  photosIcon: '#1D6BFF',
  filesTile: '#E8F7F8',
  filesIcon: '#0E8C95',

  /** The privacy note. */
  noteSurface: '#EEF6EF',
  noteIcon: '#15803D',
  noteText: '#14532D',

  input: '#F8FAFC',
  inputBorder: '#CBD5E1',
  inputFocused: '#1677FF',
  error: '#B91C1C',
  errorBorder: '#DC2626',
} as const;
