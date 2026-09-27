import { isSchemeLogoPath } from '@assistigo/core';

/**
 * Where the browser fetches a scheme image — logo, banner or illustration — from: the app's own
 * signed-in route, which streams the object out of the private bucket
 * (app/scheme-logos/[...path]/route.ts). Never a storage URL.
 *
 * `null` for anything that is not a well-formed image path, so the page falls back to its
 * default look rather than rendering a broken image.
 */
export function schemeImageSrc(path: string | null | undefined): string | null {
  return isSchemeLogoPath(path) ? `/scheme-logos/${path}` : null;
}
