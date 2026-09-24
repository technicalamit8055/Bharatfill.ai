/**
 * Reading a JPEG's EXIF orientation (so photos are turned upright before cropping), and
 * shrinking camera frames for live detection.
 */

import { describe, expect, it } from 'vitest';

import { readJpegOrientation, uprightRotation } from '../lib/scan/exif';
import { downsampleLuma, lumaStep } from '../lib/scan/luma';

/** A minimal JPEG header with an EXIF block holding only the orientation tag. */
function jpegWithOrientation(orientation: number, littleEndian: boolean): Uint8Array {
  const tiff = new Uint8Array(8 + 2 + 12 + 4);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian); // IFD0 right after the header
  view.setUint16(8, 1, littleEndian); // one entry
  view.setUint16(10, 0x0112, littleEndian); // Orientation
  view.setUint16(12, 3, littleEndian); // SHORT
  view.setUint32(14, 1, littleEndian); // count
  view.setUint16(18, orientation, littleEndian);

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const segmentLength = 2 + exifHeader.length + tiff.length;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    segmentLength >> 8,
    segmentLength & 0xff,
    ...exifHeader,
    ...tiff,
    0xff,
    0xda,
  ]);
}

describe('readJpegOrientation', () => {
  it.each([1, 3, 6, 8])('reads orientation %i in both byte orders', (orientation) => {
    expect(readJpegOrientation(jpegWithOrientation(orientation, true))).toBe(orientation);
    expect(readJpegOrientation(jpegWithOrientation(orientation, false))).toBe(orientation);
  });

  it('treats files without EXIF, or broken ones, as upright', () => {
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array([]))).toBe(1);
    expect(readJpegOrientation(jpegWithOrientation(6, true).slice(0, 20))).toBe(1);
  });

  it('ignores an out-of-range orientation value', () => {
    expect(readJpegOrientation(jpegWithOrientation(42, true))).toBe(1);
  });
});

describe('uprightRotation', () => {
  it('maps EXIF orientations to clockwise turns', () => {
    expect(uprightRotation(1)).toBe(0);
    expect(uprightRotation(3)).toBe(180);
    expect(uprightRotation(6)).toBe(90);
    expect(uprightRotation(8)).toBe(270);
    expect(uprightRotation(99)).toBe(0);
  });
});

describe('downsampleLuma', () => {
  it('averages each block', () => {
    // 4×2 image with a 2-byte row padding (bytesPerRow 6), shrunk by 2.
    const source = new Uint8Array([0, 10, 20, 30, 99, 99, 40, 50, 60, 70, 99, 99]);
    const result = downsampleLuma(source, 4, 2, 6, 2);
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(Array.from(result.pixels)).toEqual([25, 45]);
  });

  it('picks a block size that reaches roughly the target width', () => {
    expect(lumaStep(640, 200)).toBe(3);
    expect(lumaStep(1920, 200)).toBe(10);
    expect(lumaStep(100, 200)).toBe(1);
  });
});
