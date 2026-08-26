/**
 * @assistigo/document-tools — the file-preparation half of the product (spec §13).
 *
 * This barrel is pure: presets, unit and layout arithmetic, pixel operations and recipe
 * metadata, with no canvas, `File`, `Worker` or PDF dependency anywhere in the graph. That is
 * deliberate — a route handler validating a derivative and a Node unit test both import from
 * here, and neither should pull `pdf-lib` into its bundle.
 *
 * The browser half lives behind explicit subpaths, imported only from client components:
 *
 *   @assistigo/document-tools/browser/image   canvas crop / resize / compress / stamp / redact
 *   @assistigo/document-tools/browser/pdf     pdf-lib + pdf.js merge / split / rotate / rasterise
 */

export * from './types';
export * from './units';
export * from './presets';
export * from './sizing';
export * from './pixels';
export * from './sheets';
export * from './cards';
export * from './recipe';
