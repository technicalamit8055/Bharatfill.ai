/**
 * Static copy and artwork for the PVC Card & Aadhaar Mask page.
 *
 * Kept out of the editor so the locale check can walk every key without rendering React.
 */

export type CardFeatureId = 'autoCrop' | 'privacy' | 'quality' | 'pvc';

/** The four tiles under the drop zones. */
export const CARD_FEATURES: readonly { id: CardFeatureId; titleKey: string; hintKey: string }[] = [
  {
    id: 'autoCrop',
    titleKey: 'documentTools.card.features.autoCrop.title',
    hintKey: 'documentTools.card.features.autoCrop.hint',
  },
  {
    id: 'privacy',
    titleKey: 'documentTools.card.features.privacy.title',
    hintKey: 'documentTools.card.features.privacy.hint',
  },
  {
    id: 'quality',
    titleKey: 'documentTools.card.features.quality.title',
    hintKey: 'documentTools.card.features.quality.hint',
  },
  {
    id: 'pvc',
    titleKey: 'documentTools.card.features.pvc.title',
    hintKey: 'documentTools.card.features.pvc.hint',
  },
];

/** Every other key the page layout renders, for the locale check. */
export const CARD_COPY_KEYS = [
  'documentTools.studio.beta',
  'documentTools.card.notice',
  'documentTools.card.front',
  'documentTools.card.back',
  'documentTools.card.chooseImage',
  'documentTools.card.chooseEAadhaar',
  'documentTools.card.chooseEAadhaarHint',
  'documentTools.card.chooseFile',
  'documentTools.card.or',
  'documentTools.card.documentKind',
  'documentTools.card.documentKindHint',
  'documentTools.card.sheet',
  'documentTools.card.copies',
  'documentTools.card.copiesHint',
  'documentTools.output.empty',
] as const;

/** Artwork served from `public/`. */
export const CARD_ARTWORK = {
  headerVignette: '/document-tools/pvc-card-header-vignette.png',
  uploadPhoto: '/document-tools/upload-photo-cards.svg',
  uploadPdf: '/document-tools/upload-pdf-locked.svg',
} as const;
