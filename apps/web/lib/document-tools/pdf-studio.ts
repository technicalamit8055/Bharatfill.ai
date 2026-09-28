/**
 * Static copy and artwork for the PDF Studio page.
 *
 * Kept out of the editor so the locale check can walk every key without rendering React.
 */

export type PdfFeatureId = 'merge' | 'split' | 'reorder' | 'rotate' | 'compress' | 'portalReady';

/** The pills under the page title — one per thing the studio does. */
export const PDF_FEATURES: readonly { id: PdfFeatureId; labelKey: string }[] = [
  { id: 'merge', labelKey: 'documentTools.pdf.features.merge' },
  { id: 'split', labelKey: 'documentTools.pdf.features.split' },
  { id: 'reorder', labelKey: 'documentTools.pdf.features.reorder' },
  { id: 'rotate', labelKey: 'documentTools.pdf.features.rotate' },
  { id: 'compress', labelKey: 'documentTools.pdf.features.compress' },
  { id: 'portalReady', labelKey: 'documentTools.pdf.features.portalReady' },
];

/** Every other key the page layout renders, for the locale check. */
export const PDF_COPY_KEYS = [
  'documentTools.pdf.choose',
  'documentTools.pdf.chooseHint',
  'documentTools.pdf.chooseFiles',
  'documentTools.pdf.choosePdfs',
  'documentTools.pdf.choosePhotos',
  'documentTools.pdf.supports',
  'documentTools.pdf.pages',
  'documentTools.pdf.addMore',
  'documentTools.pdf.clearAll',
  'documentTools.pdf.dragHint',
  'documentTools.pdf.pageLabel',
  'documentTools.pdf.reorderPage',
  'documentTools.pdf.rotatePage',
  'documentTools.pdf.deletePage',
  'documentTools.pdf.compress',
  'documentTools.pdf.recommended',
  'documentTools.drop.moreChoices',
  'documentTools.output.preview',
  'documentTools.studio.optional',
] as const;

/** Artwork served from `public/`. */
export const PDF_ARTWORK = {
  headerVignette: '/document-tools/pdf-studio-header-vignette.png',
} as const;
