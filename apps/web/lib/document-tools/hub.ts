/**
 * The document tools hub: which tools it lists, where each one opens, and the copy on its card.
 * Master spec §13.
 *
 * Kept out of the page so the list of translation keys can be checked against both locales —
 * a missing key would otherwise surface only as a raw key on screen.
 */

export type DocumentToolId = 'photoSignature' | 'passportGrid' | 'pvcCard' | 'pdfStudio';

export type DocumentToolCard = {
  id: DocumentToolId;
  href: string;
  titleKey: string;
  descriptionKey: string;
  /** Three short capability chips under the description. */
  tagKeys: readonly [string, string, string];
};

export const DOCUMENT_TOOL_CARDS: readonly DocumentToolCard[] = [
  {
    id: 'photoSignature',
    href: '/document-tools/photo-signature',
    titleKey: 'documentTools.hub.photoSignature.title',
    descriptionKey: 'documentTools.hub.photoSignature.description',
    tagKeys: [
      'documentTools.hub.photoSignatureTags.resize',
      'documentTools.hub.photoSignatureTags.background',
      'documentTools.hub.photoSignatureTags.portal',
    ],
  },
  {
    id: 'passportGrid',
    href: '/document-tools/passport-grid',
    titleKey: 'documentTools.hub.passportGrid.title',
    descriptionKey: 'documentTools.hub.passportGrid.description',
    tagKeys: [
      'documentTools.hub.passportGridTags.counts',
      'documentTools.hub.passportGridTags.paper',
      'documentTools.hub.passportGridTags.print',
    ],
  },
  {
    id: 'pvcCard',
    href: '/document-tools/pvc-card',
    titleKey: 'documentTools.hub.pvcCard.title',
    descriptionKey: 'documentTools.hub.pvcCard.description',
    tagKeys: [
      'documentTools.hub.pvcCardTags.faces',
      'documentTools.hub.pvcCardTags.mask',
      'documentTools.hub.pvcCardTags.print',
    ],
  },
  {
    id: 'pdfStudio',
    href: '/document-tools/pdf-studio',
    titleKey: 'documentTools.hub.pdfStudio.title',
    descriptionKey: 'documentTools.hub.pdfStudio.description',
    tagKeys: [
      'documentTools.hub.pdfStudioTags.mergeSplit',
      'documentTools.hub.pdfStudioTags.compress',
      'documentTools.hub.pdfStudioTags.rotate',
    ],
  },
];

/** The four operations drawn on the PDF Studio card's preview. */
export const PDF_ACTION_KEYS = [
  'documentTools.hub.pdfActions.merge',
  'documentTools.hub.pdfActions.split',
  'documentTools.hub.pdfActions.rotate',
  'documentTools.hub.pdfActions.compress',
] as const;

/** The checklist on the right of the banner. */
export const BANNER_BENEFIT_KEYS = [
  'documentTools.hub.benefits.portalReady',
  'documentTools.hub.benefits.sizeFormat',
  'documentTools.hub.benefits.clean',
  'documentTools.hub.benefits.printReady',
] as const;

/** Every other key the hub page reads, so the test covers the whole screen. */
export const HUB_COPY_KEYS = [
  'documentTools.title',
  'documentTools.subtitle',
  'documentTools.hub.headlineLead',
  'documentTools.hub.headlineJoin',
  'documentTools.hub.headlineHighlight',
  'documentTools.hub.openTool',
  'documentTools.hub.privacyTitle',
  'documentTools.hub.privacyBody',
  'documentTools.hub.privacyBadgeTitle',
  'documentTools.hub.privacyBadgeBody',
] as const;
