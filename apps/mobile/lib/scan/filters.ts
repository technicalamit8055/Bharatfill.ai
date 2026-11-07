/**
 * The looks a scanned page can be saved with. Kept apart from `document-vision.ts`, which loads
 * native OpenCV, so pure modules and tests can name the filters.
 */

/** Each has copy at `scanner.filters.<filter>`. */
export const PAGE_FILTERS = ['magic', 'original', 'grayscale', 'blackWhite'] as const;
export type PageFilter = (typeof PAGE_FILTERS)[number];
