import { describe, expect, it } from 'vitest';
import { schemeImageSrc } from './logo';

const PATH = 'ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.png';

describe('schemeImageSrc', () => {
  it('points at the app’s own signed-in route', () => {
    expect(schemeImageSrc(PATH)).toBe(`/scheme-logos/${PATH}`);
  });

  it('has no logo for an empty value', () => {
    expect(schemeImageSrc(null)).toBeNull();
    expect(schemeImageSrc(undefined)).toBeNull();
    expect(schemeImageSrc('')).toBeNull();
  });

  /** A card must never be turned into a request to somebody else's server, or up a folder. */
  it('refuses anything that is not a logo path', () => {
    expect(schemeImageSrc('https://example.com/logo.png')).toBeNull();
    expect(schemeImageSrc('//example.com/logo.png')).toBeNull();
    expect(schemeImageSrc(`../${PATH}`)).toBeNull();
    expect(schemeImageSrc('ssc-cgl/logo.png')).toBeNull();
    expect(schemeImageSrc('ssc-cgl/0f8fad5b-d9cb-469f-a165-70867728950e.svg')).toBeNull();
  });
});
