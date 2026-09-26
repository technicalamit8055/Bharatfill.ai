# Implementation Plan: vFlat-Grade Document Scan Quality in BharatDoc

This document contains a ready-to-execute implementation plan for **Claude Code** (or any developer) to upgrade BharatDoc's mobile scanning pipeline to achieve vFlat-grade scan quality.

---

## 1. Problem Statement & Acceptance Criteria

### Visual Defects in Current Output (`test.pdf`):
1. **Desk Border Bleed**: Outer table/desk textures and margins are included in the crop because corner detection runs at only `320px` width (`scaleQuad` multiplies 3–5px error by 10x–12x).
2. **Halo Ringing & Faded Headers**: The `evenOutLighting` closing filter kernel (9×9 at 0.25 scale = 36px) is much smaller than black document banners (70–200px). Division creates bright halos and blotchy, washed-out gray banners.
3. **Dull Grayish Paper**: Paper background sits at 210–235 luma without pure white bleaching.
4. **Soft Text**: Ink is dark gray (`#555555`) with slight optical blur rather than crisp pitch black (`#000000`).

### Target Quality (`vflat.pdf`):
1. **Precise Auto-Crop**: Exact document boundary with zero desk/background bleed.
2. **Pure White Paper**: Paper background pushed to pure `#FFFFFF` without shadows.
3. **Solid Deep Black Headers**: Solid black banners remain uniform pitch black (`#000000`) without halo artifacts.
4. **Crisp Razor-Sharp Text**: High-contrast, thickened text strokes and sharp edges.
5. **Photo & Signature Preservation**: Candidate photo details and signatures remain intact.

---

## 2. Technical Strategy

```
[ Captured Photo (High-Res) ]
            │
            ▼
[ 1. Photo Analysis at 1080p Scale ] ──► Sub-millimeter corner accuracy
            │
            ▼
[ 2. Auto Inset Safety Margin ] ───────► Inset quad by ~0.8% to guarantee 0% desk bleed
            │
            ▼
[ 3. Perspective Warp (2400px max) ]
            │
            ▼
[ 4. Large-Scale Illumination Estimator ] ──► Smooth lighting field without banner halos
            │
            ▼
[ 5. Non-Linear Tone Curve (cv::LUT) ] ─────► Whitening knee (>=195 -> 255) + Ink darkening (<=90 -> 0-25)
            │
            ▼
[ 6. Unsharp Masking ] ─────────────────────► addWeighted edge boost for laser-crisp characters
            │
            ▼
[ Output: vFlat-Grade Scan ]
```

---

## 3. Step-by-Step Implementation Steps

### Phase 1: Geometry Helpers (`apps/mobile/lib/scan/geometry.ts`)

#### Task 1.1: Add `insetQuad` function
When a document is auto-detected on a contrasting desk or cloth, corners can drift 2–5px outward. Shrinking the quad inwards by a tiny margin (0.8% towards its centroid) ensures that table wood grain and paper shadows along edges are completely cropped away.

**File:** `apps/mobile/lib/scan/geometry.ts`
```typescript
/**
 * Insets a quadrilateral inwards towards its centroid by a fraction of its scale.
 * Used on auto-detected documents to guarantee desk/table borders are not captured.
 */
export function insetQuad(quad: Quad, ratio = 0.008): Quad {
  if (ratio <= 0) return quad;
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4;
  return quad.map((p) => ({
    x: Math.round(p.x + (cx - p.x) * ratio),
    y: Math.round(p.y + (cy - p.y) * ratio),
  })) as unknown as Quad;
}
```

#### Task 1.2: Add unit tests for `insetQuad`
**File:** `apps/mobile/tests/scan-geometry.test.ts`
- Test that insetting moves all 4 corners closer to the centroid.
- Test that `ratio = 0` returns the identical quad.
- Test that corner ordering is preserved.

---

### Phase 2: High-Resolution Corner Detection (`apps/mobile/lib/scan/document-vision.ts`)

#### Task 2.1: Separate Live Preview Detection from Captured Photo Detection
Currently:
```typescript
const DETECTION_WIDTH = 320;
```
Live camera frames (30fps) need `320px` for smooth real-time performance.
Captured full-resolution photos (`analysePhoto`) should run at `1080px` for high-precision edge placement:

**File:** `apps/mobile/lib/scan/document-vision.ts`
```typescript
/** Width live camera frames are shrunk to for the 30fps auto-capture loop. */
const LIVE_DETECTION_WIDTH = 320;
/** Width captured/imported photos are scaled to when finding the document boundaries. */
const PHOTO_DETECTION_WIDTH = 1080;
```

In `analysePhoto`:
```typescript
export async function analysePhoto(uri: string): Promise<PhotoAnalysis> {
  // ...
  const image = await loadUpright(uri, keep);
  const size = { width: image.cols, height: image.rows };
  const scale = Math.min(1, PHOTO_DETECTION_WIDTH / size.width);
  // ...
  // When quad is detected, apply scaleQuad, then apply insetQuad:
  return quad
    ? { size, quad: insetQuad(scaleQuad(quad, 1 / scale), 0.008), detected: true }
    : { size, quad: fullFrameQuad(size), detected: false };
}
```

---

### Phase 3: Large-Scale Illumination & Halo Removal (`document-vision.ts`)

#### Task 3.1: Replace Small Kernel Closing with Large-Scale Smooth Illumination
The current `Size(9, 9)` closing on a 0.25 image cannot bridge 70–200px header banners.
Instead:
1. Downsample the channel to a small illumination grid (~80–120px max dimension). At this scale, 150px headers become tiny 5px strokes.
2. Apply an elliptical morphological closing kernel (`Size(19, 19)`).
3. Apply a heavy blur (`GaussianBlur` or `medianBlur`) to ensure the background estimate represents **only** room lighting gradients across the paper, not local document structures.
4. Upsample the illumination field back to the channel's full size.
5. Divide `channel / background * 255`.

```typescript
function evenOutLighting(channel: Mat, keep: <R extends Releasable>(object: R) => R): Mat {
  // Target a smooth low-frequency illumination thumbnail (~96px longest side).
  const thumbScale = Math.min(1, 96 / Math.max(channel.cols, channel.rows));
  const thumbW = Math.max(16, Math.round(channel.cols * thumbScale));
  const thumbH = Math.max(16, Math.round(channel.rows * thumbScale));

  const small = keep(emptyMat());
  OpenCV.resize(channel, small, keep(Size.create(thumbW, thumbH)), 0, 0, InterpolationFlags.INTER_AREA);

  // At ~96px thumbnail size, a 15x15 closing kernel bridges any large banner or photo.
  const closed = keep(emptyMat());
  const kernel = keep(
    OpenCV.getStructuringElement(MorphShapes.MORPH_ELLIPSE, keep(Size.create(15, 15))),
  );
  OpenCV.morphologyEx(small, closed, MorphTypes.MORPH_CLOSE, kernel);

  const blurredThumb = keep(emptyMat());
  OpenCV.GaussianBlur(closed, blurredThumb, keep(Size.create(11, 11)), 4);

  const background = keep(emptyMat());
  OpenCV.resize(blurredThumb, background, keep(Size.create(channel.cols, channel.rows)), 0, 0, InterpolationFlags.INTER_LINEAR);

  const divided = keep(emptyMat());
  OpenCV.divide(channel, background, divided, 255);
  return divided;
}
```

---

### Phase 4: Document Tone Curve & Paper Whitening (`document-vision.ts`)

#### Task 4.1: Construct Document Look-Up Table (LUT)
vFlat scans look crisp because paper is mapped to pure `#FFFFFF` (255) and text is deepened.
We construct a 256-element `Uint8Array` lookup table:
- **Paper Whitening Knee (`x >= 195`)**:
  Maps values from 195–255 directly to **255** (pure white paper).
- **Ink Darkening (`x <= 90`)**:
  Values below 90 are compressed toward 0–25 (deep rich black text).
- **Midtone S-Curve (`90 < x < 195`)**:
  Hermite/smoothstep interpolation preserving candidate photos, blue ink signatures, and stamps.

```typescript
/** Precomputed 1x256 Look-Up Table for vFlat-grade document contrast enhancement. */
function createDocumentLutMat(keep: <R extends Releasable>(object: R) => R): Mat {
  const table = new Uint8Array(256);
  const blackPoint = 85;
  const whitePoint = 195;

  for (let i = 0; i < 256; i += 1) {
    if (i <= blackPoint) {
      // Darken ink strokes to deep black
      table[i] = Math.round((i / blackPoint) * 20);
    } else if (i >= whitePoint) {
      // Bleach paper to pure white
      table[i] = 255;
    } else {
      // Smooth S-curve transition in midtones
      const t = (i - blackPoint) / (whitePoint - blackPoint);
      const s = t * t * (3 - 2 * t); // smoothstep
      table[i] = Math.round(20 + s * (255 - 20));
    }
  }

  return keep(Mat.createFromBuffer('uint8', 1, 256, 1, table));
}
```

#### Task 4.2: Apply LUT via `OpenCV.LUT`
```typescript
function applyDocumentToneCurve(
  image: Mat,
  lutMat: Mat,
  keep: <R extends Releasable>(object: R) => R,
): Mat {
  const enhanced = keep(emptyMat());
  OpenCV.LUT(image, lutMat, enhanced);
  return enhanced;
}
```

---

### Phase 5: Unsharp Masking for Razor-Sharp Text (`document-vision.ts`)

#### Task 5.1: Implement `applyUnsharpMask`
Boost edge gradients so printed text, roll numbers, and fine lines appear razor sharp:

```typescript
function applyUnsharpMask(
  image: Mat,
  keep: <R extends Releasable>(object: R) => R,
  amount = 0.35,
): Mat {
  const blurred = keep(emptyMat());
  OpenCV.GaussianBlur(image, blurred, keep(Size.create(3, 3)), 1.0);
  const sharpened = keep(emptyMat());
  // out = image * (1 + amount) - blurred * amount
  OpenCV.addWeighted(image, 1.0 + amount, blurred, -amount, 0, sharpened);
  return sharpened;
}
```

---

### Phase 6: Wire into Filters & Pipeline (`document-vision.ts`)

#### Task 6.1: Update `applyFilter`
1. **`magic`**:
   - Split BGR into channels.
   - Run `evenOutLighting` on each channel.
   - Merge back to BGR.
   - Apply `createDocumentLutMat` via `OpenCV.LUT`.
   - Apply `applyUnsharpMask`.
2. **`grayscale`**:
   - Convert to Grayscale.
   - Run `evenOutLighting`.
   - Apply `createDocumentLutMat`.
   - Apply `applyUnsharpMask`.
3. **`blackWhite`**:
   - Convert to Grayscale + `evenOutLighting`.
   - Apply adaptive threshold (`ADAPTIVE_THRESH_GAUSSIAN_C`, block size 31, C = 12).
4. **`original`**:
   - Returns unaugmented warped page.

---

## 4. Verification & Testing

### Step 1: Run Existing Mobile Unit Tests
```bash
npm run test:mobile
```
Ensure all 31 test files and 328+ unit tests pass.

### Step 2: Validate With Sample Documents
Run on Android emulator or physical device (`npm run android --workspace @assistigo/mobile`):
1. Scan an Admit Card or Marksheet placed on a wooden desk.
2. Confirm auto-crop excludes all wooden desk margins.
3. Confirm paper background is clean white `#FFFFFF`.
4. Confirm black university/exam banners are solid deep black without halo rings.
5. Confirm candidate photo and signatures are clear and sharp.

---

## 5. Summary of Files to Modify

| File Path | Changes |
| :--- | :--- |
| `apps/mobile/lib/scan/geometry.ts` | Add `insetQuad` helper. |
| `apps/mobile/tests/scan-geometry.test.ts` | Add tests for `insetQuad`. |
| `apps/mobile/lib/scan/document-vision.ts` | Update `PHOTO_DETECTION_WIDTH`, `analysePhoto` with inset, `evenOutLighting` large-scale illumination, `createDocumentLutMat`, `applyUnsharpMask`, and `applyFilter`. |

---

## 6. As built (differs from the plan above)

Tuned against an offline OpenCV harness: vFlat's output degraded into realistic phone photos
(desk, uneven light, shadow, bulb tint, blur, noise, JPEG), with the pipeline's output scored
against vFlat. Where the plan's numbers lost detail, the measured design replaced them.

- **Page detection** (`page-lines.ts`): captured photos are searched for the page's straight
  edges, not only closed outlines. A side must be a brightness step with the paper brighter
  inside, which rejects tables printed on the page. The frame border may stand in for one side,
  so pages that fill or run off the frame are found. Found at 320px, then each side is snapped to
  the matching edge at 1080px. Inset is 0.5%. Live detection is unchanged.
- **Lighting** (`paper-light.ts`): estimated from paper only, with dark areas (banners, photos)
  filled from surrounding paper. The plan's 96px closing still washed out large ID-card photos.
- **Tone curve** (`tone-curve.ts`): fitted per page from its histogram, not fixed at 85/195. The
  fixed curve crushed passport photos to black and erased faint signatures.
- **Magic Color**: the curve and sharpening run on brightness (YCrCb) only, and faint tints snap
  to grey. This removes the colour speckle on text.
- **Black & White**: thresholded after the tone curve, so paper cannot speckle. The threshold
  window is 1.3% of the page's longest side.
- **Resolution** (replaces the 2400px cap): pages are saved at 3508px on the long side (A4 at
  300 dpi). vFlat's PDF holds a 2602 × 3756 image; ours held about 1900 × 2060. A page caught
  smaller than that is enlarged up to 2× in the bicubic warp, before filtering, so text edges
  are drawn at full resolution. The camera asks for 12 MP with `qualityPrioritization:
  'quality'`.
- **Page shape** (`pageAspect` in `geometry.ts`): the flattened page takes its true width ÷
  height from the corners through a pinhole camera model (Zhang & He), with focal length 0.75 ×
  the photo's long side. Sizing from edge lengths squashed pages shot at an angle: a receipt
  shot with the phone leaning over it came out about 25% too wide, and its round seal came out
  oval. The shape falls back to edge lengths when the correction exceeds 1.6×.
- **Sharpening**: band-pass (σ 0.6 to 1.6 photo pixels, amount 2), run before the tone curve.
  The curve clips the overshoot to pure white and solid black, giving hard-edged text without
  halos. The band skips pixel-sized sensor noise, so photos stay clean.
- **Not solved**: a page on a light, low-contrast desk may not be detected (falls back to the
  full frame for manual cropping), and curled pages are not dewarped. Large light-grey printed
  areas (a faint seal) are whitened along with shadows: raising the paper threshold from 0.62
  to 0.72 keeps them grey, but leaves half the paper in a shadow grey.
