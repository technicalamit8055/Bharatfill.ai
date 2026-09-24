/**
 * Shrinks a camera frame's luma (the Y plane of a YUV frame — a greyscale image) for live edge
 * detection. Runs on the camera thread as a worklet, so it is plain arithmetic with no imports.
 *
 * Box-averaging over each `step × step` block, rather than taking every nth pixel, smooths away
 * sensor noise that would otherwise show up as false edges.
 */

export type LumaImage = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
};

/** The block size that brings `width` down to roughly `targetWidth`. At least 1. */
export function lumaStep(width: number, targetWidth: number): number {
  'worklet';
  return Math.max(1, Math.round(width / targetWidth));
}

export function downsampleLuma(
  source: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  step: number,
): LumaImage {
  'worklet';
  const outWidth = Math.floor(width / step);
  const outHeight = Math.floor(height / step);
  const pixels = new Uint8Array(outWidth * outHeight);
  const area = step * step;

  for (let oy = 0; oy < outHeight; oy += 1) {
    const rowStart = oy * step;
    for (let ox = 0; ox < outWidth; ox += 1) {
      const colStart = ox * step;
      let sum = 0;
      for (let dy = 0; dy < step; dy += 1) {
        const row = (rowStart + dy) * bytesPerRow + colStart;
        for (let dx = 0; dx < step; dx += 1) sum += source[row + dx] ?? 0;
      }
      pixels[oy * outWidth + ox] = Math.round(sum / area);
    }
  }

  return { width: outWidth, height: outHeight, pixels };
}
