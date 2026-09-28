/**
 * The Photo & Signature Studio's static copy: the dropzone's feature pills, the "what is this"
 * checklist, and the worked examples under the dropzone.
 * Master spec §13.2.
 *
 * Kept out of the component so every translation key can be checked against both locales, and
 * so the example artwork is listed in one place. Every example picture is stock artwork of a
 * made-up person — no customer file is ever shown as an example.
 */

export type StudioFeatureId = 'autoCrop' | 'removeBackground' | 'enhance' | 'exactSize';

/** The four capability pills under the dropzone. */
export const STUDIO_FEATURES: readonly { id: StudioFeatureId; labelKey: string }[] = [
  { id: 'autoCrop', labelKey: 'documentTools.studio.features.autoCrop' },
  { id: 'removeBackground', labelKey: 'documentTools.studio.features.removeBackground' },
  { id: 'enhance', labelKey: 'documentTools.studio.features.enhance' },
  { id: 'exactSize', labelKey: 'documentTools.studio.features.exactSize' },
];

/** The checklist beside the Photo / Signature switch. */
export const STUDIO_CHECKLIST_KEYS = [
  'documentTools.studio.checklist.resize',
  'documentTools.studio.checklist.clean',
  'documentTools.studio.checklist.format',
  'documentTools.studio.checklist.custom',
] as const;

export type ExampleKind = 'photo' | 'signature';

/**
 * How one example stage is drawn:
 *   - `plain`: the artwork as-is,
 *   - `cutout`: over the transparency checkerboard,
 *   - `portal`: inside a thin print frame at the preset's shape,
 *   - `custom`: inside a frame with resize arrows at the corners.
 */
export type ExampleStageStyle = 'plain' | 'cutout' | 'portal' | 'custom';

export type ExampleStage = {
  style: ExampleStageStyle;
  labelKey: string;
  src: string;
  width: number;
  height: number;
  /**
   * The artwork is shot on white; `multiply` drops the white so the checkerboard shows through.
   * Only needed where the file itself has no transparency.
   */
  multiply?: boolean;
};

const PHOTO_ORIGINAL = { src: '/document-tools/photo-sample-original.png', width: 240, height: 300 };
const PHOTO_CUTOUT = { src: '/document-tools/photo-sample-cutout.png', width: 240, height: 300 };
const SIGNATURE = { src: '/home/thumb-signature.png', width: 390, height: 250 };

export const STUDIO_EXAMPLES: Record<ExampleKind, readonly ExampleStage[]> = {
  photo: [
    { style: 'plain', labelKey: 'documentTools.studio.examples.original', ...PHOTO_ORIGINAL },
    {
      style: 'cutout',
      labelKey: 'documentTools.studio.examples.backgroundRemoved',
      ...PHOTO_CUTOUT,
    },
    { style: 'portal', labelKey: 'documentTools.studio.examples.passport', ...PHOTO_ORIGINAL },
    { style: 'custom', labelKey: 'documentTools.studio.examples.customSize', ...PHOTO_ORIGINAL },
  ],
  signature: [
    { style: 'plain', labelKey: 'documentTools.studio.examples.original', ...SIGNATURE },
    {
      style: 'cutout',
      labelKey: 'documentTools.studio.examples.backgroundRemoved',
      multiply: true,
      ...SIGNATURE,
    },
    {
      style: 'portal',
      labelKey: 'documentTools.studio.examples.signaturePortal',
      ...SIGNATURE,
    },
    { style: 'custom', labelKey: 'documentTools.studio.examples.customSize', ...SIGNATURE },
  ],
};

export const EXAMPLE_TAB_KEYS: Record<ExampleKind, string> = {
  photo: 'documentTools.studio.examples.tabPhoto',
  signature: 'documentTools.studio.examples.tabSignature',
};

/** Every other key the studio layout renders, for the locale check. */
export const STUDIO_COPY_KEYS = [
  'documentTools.studio.beta',
  'documentTools.studio.chooseTitle',
  'documentTools.studio.chooseSignatureTitle',
  'documentTools.studio.uploadPhoto',
  'documentTools.studio.uploadSignature',
  'documentTools.studio.optional',
  'documentTools.studio.downloadPhoto',
  'documentTools.studio.downloadSignature',
  'documentTools.studio.examples.title',
  'documentTools.studio.features.removeBackgroundHint',
] as const;
