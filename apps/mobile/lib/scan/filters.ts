/**
 * The looks a scanned page can be saved with. Kept apart from `document-vision.ts`, which loads
 * native OpenCV, so pure modules and tests can name the filters.
 */

/** A document's looks. Each has copy at `scanner.filters.<filter>`. */
export const PAGE_FILTERS = ['magic', 'original', 'grayscale', 'blackWhite'] as const;

/**
 * A passport photo's looks: the person on plain white or light blue (`studio-photo.ts`), or the
 * photo's own background. Each has copy at `scanner.filters.<filter>`.
 */
export const PHOTO_FILTERS = ['studioWhite', 'studioBlue', 'original'] as const;

export type PageFilter = (typeof PAGE_FILTERS)[number] | (typeof PHOTO_FILTERS)[number];
