/**
 * Reads the EXIF orientation of a JPEG. Phone cameras usually store the sensor's pixels as they
 * are and record how to turn them upright in this tag; OpenCV's decoder ignores it, so the
 * scanner applies it itself before cropping.
 *
 * Only the orientation tag is read. Nothing else in the EXIF block (GPS, device, time) is used,
 * and the processed pages are written without EXIF at all.
 */

/** Clockwise turn needed to show the image upright. */
export type UprightRotation = 0 | 90 | 180 | 270;

/**
 * The EXIF orientation value (1–8), or 1 when the file has none or is not a readable JPEG.
 * Never throws: a malformed header just means "already upright".
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1] as number;
    // Start of scan or end of image: the metadata segments are over.
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = view.getUint16(offset + 2);
    if (length < 2) return 1;

    if (marker === 0xe1) return orientationFromApp1(view, offset + 4, length - 2);
    offset += 2 + length;
  }
  return 1;
}

function orientationFromApp1(view: DataView, start: number, length: number): number {
  const end = start + length;
  // "Exif\0\0"
  if (end > view.byteLength || length < 14 || view.getUint32(start) !== 0x45786966) return 1;

  const tiff = start + 6;
  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1;
  const little = byteOrder === 0x4949;

  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return 1;

  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/**
 * The clockwise rotation that makes an image with this EXIF orientation upright. The mirrored
 * orientations (2, 4, 5, 7) never come from a phone's back camera; they get the matching
 * rotation without the flip.
 */
export function uprightRotation(orientation: number): UprightRotation {
  switch (orientation) {
    case 3:
    case 4:
      return 180;
    case 5:
    case 6:
      return 90;
    case 7:
    case 8:
      return 270;
    default:
      return 0;
  }
}
