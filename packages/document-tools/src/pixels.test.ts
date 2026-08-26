import { describe, expect, it } from 'vitest';
import {
  assessBackground,
  cleanSignature,
  contentBoundingBox,
  enhance,
  luma,
  lumaHistogram,
  otsuThreshold,
  percentileLuma,
  type RgbaImage,
} from './pixels';

/** A blank canvas of one colour. */
function solid(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = 255;
  }
  return { data, width, height };
}

function setPixel(image: RgbaImage, x: number, y: number, rgb: [number, number, number]): void {
  const index = (y * image.width + x) * 4;
  image.data[index] = rgb[0];
  image.data[index + 1] = rgb[1];
  image.data[index + 2] = rgb[2];
  image.data[index + 3] = 255;
}

function pixel(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const index = (y * image.width + x) * 4;
  return [
    image.data[index] ?? 0,
    image.data[index + 1] ?? 0,
    image.data[index + 2] ?? 0,
    image.data[index + 3] ?? 0,
  ];
}

/**
 * The case this module exists for: dark strokes on paper that a phone rendered grey-yellow, with
 * a shadow gradient across it. Nothing in here is white.
 */
function shadowedSignature(): RgbaImage {
  const width = 60;
  const height = 30;
  const image = solid(width, height, [0, 0, 0]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Paper: yellow-grey, darkening left to right as the shadow falls across it.
      const shade = 210 - Math.round((x / width) * 55);
      setPixel(image, x, y, [shade, shade - 6, shade - 26]);
    }
  }
  // A stroke across the middle, in ink that is dark but nowhere near black.
  for (let x = 6; x < width - 6; x += 1) {
    setPixel(image, x, 14, [58, 54, 70]);
    setPixel(image, x, 15, [58, 54, 70]);
  }
  return image;
}

describe('luma', () => {
  it('weights green most, the way the eye does', () => {
    expect(luma(0, 255, 0)).toBeGreaterThan(luma(255, 0, 0));
    expect(luma(255, 0, 0)).toBeGreaterThan(luma(0, 0, 255));
    expect(luma(255, 255, 255)).toBeCloseTo(255, 4);
    expect(luma(0, 0, 0)).toBe(0);
  });
});

describe('lumaHistogram', () => {
  it('counts every pixel exactly once', () => {
    const image = shadowedSignature();
    const total = [...lumaHistogram(image)].reduce((sum, count) => sum + count, 0);
    expect(total).toBe(image.width * image.height);
  });
});

describe('percentileLuma', () => {
  it('reads the paper level off a page that has no white in it', () => {
    const paper = percentileLuma(shadowedSignature(), 0.9);
    // Somewhere in the yellow-grey band, well below white and well above the ink.
    expect(paper).toBeGreaterThan(150);
    expect(paper).toBeLessThan(215);
  });

  it('ignores a specular highlight, which is why it is a percentile and not a maximum', () => {
    const image = solid(40, 40, [180, 180, 180]);
    setPixel(image, 0, 0, [255, 255, 255]); // phone flash
    expect(percentileLuma(image, 0.9)).toBeLessThan(200);
  });
});

describe('otsuThreshold', () => {
  it('splits ink from paper on a shadowed page', () => {
    const split = otsuThreshold(shadowedSignature());
    // Between the ink (~56) and the darkest paper (~150) — the midpoint of the empty gap.
    expect(split).toBeGreaterThan(60);
    expect(split).toBeLessThan(150);
  });

  it('does not crash on a uniform image', () => {
    expect(otsuThreshold(solid(10, 10, [128, 128, 128]))).toBeGreaterThanOrEqual(0);
  });
});

describe('cleanSignature', () => {
  it('turns grey-yellow paper into pure white', () => {
    const cleaned = cleanSignature(shadowedSignature());
    // A corner, far from the stroke.
    expect(pixel(cleaned, 1, 1)).toEqual([255, 255, 255, 255]);
    // And the darkest end of the shadow gradient, which a fixed threshold would have kept.
    expect(pixel(cleaned, 58, 1)).toEqual([255, 255, 255, 255]);
  });

  it('keeps the stroke, and makes it darker than the paper it sits on', () => {
    const cleaned = cleanSignature(shadowedSignature());
    const [red] = pixel(cleaned, 30, 14);
    expect(red).toBeLessThan(90);
  });

  it('produces a transparent background when asked, for overlaying on a card', () => {
    const cleaned = cleanSignature(shadowedSignature(), { background: 'transparent' });
    expect(pixel(cleaned, 1, 1)[3]).toBe(0);
    expect(pixel(cleaned, 30, 14)[3]).toBeGreaterThan(200);
  });

  it('keeps blue ink blue when asked, rather than forcing it to black', () => {
    const image = solid(20, 20, [235, 233, 220]);
    for (let x = 2; x < 18; x += 1) setPixel(image, x, 10, [30, 40, 190]);
    const cleaned = cleanSignature(image, { keepInkColour: true });
    const [red, green, blue] = pixel(cleaned, 10, 10);
    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });

  it('forces ink to neutral grey by default, so a portal sees black on white', () => {
    const image = solid(20, 20, [235, 233, 220]);
    for (let x = 2; x < 18; x += 1) setPixel(image, x, 10, [30, 40, 190]);
    const [red, green, blue] = pixel(cleanSignature(image), 10, 10);
    expect(red).toBe(green);
    expect(green).toBe(blue);
  });

  it('feathers the ink/paper boundary instead of snapping it, so strokes do not come out jagged', () => {
    // A luma ramp crosses the split continuously, so any pixel landing strictly between black
    // and white is the feather band doing its job. A hard binarisation would produce only 0s
    // and 255s — and a hard-edged signature is the kind of artefact that reads as tampered with.
    const image = solid(160, 8, [0, 0, 0]);
    for (let x = 0; x < 160; x += 1) {
      const shade = Math.round((x / 159) * 255);
      for (let y = 0; y < 8; y += 1) setPixel(image, x, y, [shade, shade, shade]);
    }
    const cleaned = cleanSignature(image);

    const intermediate: number[] = [];
    for (let x = 0; x < 160; x += 1) {
      const value = pixel(cleaned, x, 4)[0];
      if (value > 4 && value < 251) intermediate.push(value);
    }
    expect(intermediate.length).toBeGreaterThan(3);
    // And the band is a ramp, not noise: darker pixels stay darker.
    expect(intermediate).toEqual([...intermediate].sort((a, b) => a - b));
  });

  it('is more aggressive at positive strength and gentler at negative', () => {
    // A continuous luma ramp, so the strength control actually moves the boundary rather than
    // sliding around inside the empty gap of a clean two-tone scan.
    const ramp = () => {
      const image = solid(120, 12, [0, 0, 0]);
      for (let x = 0; x < 120; x += 1) {
        const shade = 50 + Math.round((x / 119) * 200);
        for (let y = 0; y < 12; y += 1) setPixel(image, x, y, [shade, shade, shade]);
      }
      return image;
    };
    const inked = (strength: number) => {
      const cleaned = cleanSignature(ramp(), { strength });
      let count = 0;
      for (let index = 0; index < cleaned.data.length; index += 4) {
        if ((cleaned.data[index] ?? 255) < 250) count += 1;
      }
      return count;
    };
    expect(inked(60)).toBeGreaterThan(inked(0));
    expect(inked(0)).toBeGreaterThan(inked(-60));
  });
});

describe('contentBoundingBox', () => {
  it('finds the ink and ignores the paper margin', () => {
    const image = solid(100, 60, [250, 250, 250]);
    for (let x = 20; x <= 79; x += 1) {
      for (let y = 15; y <= 44; y += 1) setPixel(image, x, y, [20, 20, 20]);
    }
    expect(contentBoundingBox(image)).toEqual({ x: 20, y: 15, width: 60, height: 30 });
  });

  it('measures the background rather than assuming white, so a grey scan still trims', () => {
    const image = solid(80, 40, [168, 165, 150]);
    for (let x = 30; x <= 49; x += 1) setPixel(image, x, 20, [30, 30, 30]);
    const box = contentBoundingBox(image);
    expect(box).toEqual({ x: 30, y: 20, width: 20, height: 1 });
  });

  it('adds the padding asked for, without leaving the image', () => {
    const image = solid(40, 40, [252, 252, 252]);
    setPixel(image, 1, 1, [0, 0, 0]);
    const box = contentBoundingBox(image, { padding: 8 });
    expect(box).toMatchObject({ x: 0, y: 0 });
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(40);
  });

  it('returns null on a uniform image rather than an empty crop', () => {
    expect(contentBoundingBox(solid(30, 30, [255, 255, 255]))).toBeNull();
  });

  it('treats fully transparent pixels as absent, not as dark content', () => {
    const image = solid(20, 20, [255, 255, 255]);
    const corner = 0;
    image.data[corner] = 0;
    image.data[corner + 1] = 0;
    image.data[corner + 2] = 0;
    image.data[corner + 3] = 0;
    expect(contentBoundingBox(image)).toBeNull();
  });
});

describe('enhance', () => {
  it('stretches a flat grey scan towards black and white', () => {
    const image = solid(40, 40, [120, 120, 120]);
    for (let x = 0; x < 40; x += 1) {
      for (let y = 0; y < 20; y += 1) setPixel(image, x, y, [150, 150, 150]);
    }
    const before = pixel(image, 0, 30)[0];
    const after = pixel(enhance(image, { clarity: 100 }), 0, 30)[0];
    expect(after).toBeLessThan(before);
  });

  it('leaves the image alone with no options', () => {
    const image = solid(8, 8, [100, 110, 120]);
    expect(pixel(enhance(image), 4, 4)).toEqual([100, 110, 120, 255]);
  });

  it('brightens and darkens in the direction asked', () => {
    expect(pixel(enhance(solid(8, 8, [100, 100, 100]), { brightness: 20 }), 4, 4)[0]).toBe(151);
    expect(pixel(enhance(solid(8, 8, [100, 100, 100]), { brightness: -20 }), 4, 4)[0]).toBe(49);
  });

  it('clamps rather than wrapping around at the ends of the range', () => {
    const bright = pixel(enhance(solid(8, 8, [250, 250, 250]), { brightness: 90 }), 4, 4);
    expect(bright.slice(0, 3)).toEqual([255, 255, 255]);
    const dark = pixel(enhance(solid(8, 8, [5, 5, 5]), { brightness: -90 }), 4, 4);
    expect(dark.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('makes every channel equal when converting to greyscale', () => {
    const [red, green, blue] = pixel(
      enhance(solid(8, 8, [200, 60, 30]), { grayscale: true }),
      4,
      4,
    );
    expect(red).toBe(green);
    expect(green).toBe(blue);
  });
});

describe('assessBackground', () => {
  it('accepts the plain light background portals ask for', () => {
    expect(assessBackground(solid(120, 150, [244, 244, 244])).verdict).toBe('plain_light');
  });

  it('flags a dark background', () => {
    expect(assessBackground(solid(120, 150, [40, 40, 45])).verdict).toBe('dark');
  });

  it('flags a busy background', () => {
    const image = solid(120, 150, [230, 230, 230]);
    // Vertical stripes through the border ring — a wall, a curtain, a doorway.
    for (let x = 0; x < 120; x += 4) {
      for (let y = 0; y < 150; y += 1) setPixel(image, x, y, [70, 70, 70]);
    }
    expect(assessBackground(image).verdict).toBe('busy');
  });

  it('samples the border and not the subject, so a dark shirt is not a dark background', () => {
    const image = solid(120, 150, [246, 246, 246]);
    for (let x = 30; x < 90; x += 1) {
      for (let y = 40; y < 120; y += 1) setPixel(image, x, y, [15, 15, 15]);
    }
    expect(assessBackground(image).verdict).toBe('plain_light');
  });
});
