/**
 * Live page detection on the camera preview.
 *
 * The camera thread (a worklet) shrinks a frame's greyscale plane and hands it to the JS thread,
 * which finds the page with OpenCV (`detectDocument`) and maps its corners onto the preview. A
 * shared flag makes the camera thread send a new frame only once the previous one has been
 * handled, so detection never queues up behind the camera (about 8 checks a second).
 *
 * The frame's own corners are converted to camera coordinates on the camera thread, while the
 * frame is still valid; that fixes the sensor-to-screen rotation for the whole frame, so the JS
 * side can place any detected point without the frame.
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { type CameraRef, type Frame, useFrameOutput } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import { detectDocument } from '../../lib/scan/document-vision';
import {
  applyFrameAffine,
  type FrameAffine,
  INITIAL_STABILITY,
  nextStability,
  type Quad,
  scaleQuad,
  type StabilityState,
} from '../../lib/scan/geometry';
import { downsampleLuma, type LumaImage, lumaStep } from '../../lib/scan/luma';

/** Resolution of the frames streamed for detection; they are shrunk further before OpenCV. */
const FRAME_RESOLUTION = { width: 640, height: 480 } as const;

/** Width the camera thread shrinks frames to before detection. */
const DETECTION_WIDTH = 200;
const debugStats = { frames: 0, found: 0 };

/** Pause between detections, so the JS thread stays free for the UI. */
const DETECTION_INTERVAL_MS = 120;

export type LiveDetection = {
  /** The page's corners in preview (screen) coordinates, or null when none is in view. */
  readonly outline: Quad | null;
  readonly stability: StabilityState;
  /** Forget the current page, e.g. right after a capture. */
  readonly reset: () => void;
};

export function useLiveDocumentDetection(
  cameraRef: RefObject<CameraRef | null>,
  enabled: boolean,
): { detection: LiveDetection; frameOutput: ReturnType<typeof useFrameOutput> } {
  const wantFrame = useMemo(() => createSynchronizable(true), []);
  const [outline, setOutline] = useState<Quad | null>(null);
  const [stability, setStability] = useState<StabilityState>(INITIAL_STABILITY);
  const stabilityRef = useRef<StabilityState>(INITIAL_STABILITY);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const requestNextFrame = useCallback(() => {
    setTimeout(() => wantFrame.setBlocking(true), DETECTION_INTERVAL_MS);
  }, [wantFrame]);

  const onLuma = useCallback(
    (luma: LumaImage, map: FrameAffine) => {
      try {
        if (!enabledRef.current) {
          setOutline(null);
          stabilityRef.current = INITIAL_STABILITY;
          setStability(INITIAL_STABILITY);
          return;
        }

        const small = detectDocument(luma);
        // TEMP diagnostic (counts only, no image data) — remove after on-device check.
        debugStats.frames += 1;
        if (small) debugStats.found += 1;
        if (__DEV__ && debugStats.frames % 20 === 0) {
          console.log(
            `[scan-debug] frames=${debugStats.frames} found=${debugStats.found} luma=${luma.width}x${luma.height} frame=${map.size.width}x${map.size.height}`,
          );
        }
        const inFrame = small
          ? scaleQuad(small, map.size.width / luma.width, map.size.height / luma.height)
          : null;

        const camera = cameraRef.current;
        let onScreen: Quad | null = null;
        if (inFrame && camera) {
          try {
            onScreen = inFrame.map((p) =>
              camera.convertCameraPointToViewPoint(applyFrameAffine(p, map)),
            ) as unknown as Quad;
          } catch {
            onScreen = null; // Preview not laid out yet.
          }
        }

        const next = nextStability(stabilityRef.current, inFrame, map.size, Date.now());
        stabilityRef.current = next;
        setStability(next);
        // While a brief miss is tolerated, the last outline stays up instead of flickering off.
        if (onScreen || !next.quad) setOutline(onScreen);
      } finally {
        requestNextFrame();
      }
    },
    [cameraRef, requestNextFrame],
  );

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      if (!wantFrame.getDirty()) {
        frame.dispose();
        return;
      }
      wantFrame.setBlocking(false);

      try {
        const plane = frame.getPlanes()[0];
        if (!plane || !plane.isValid) {
          wantFrame.setBlocking(true);
          return;
        }
        // A plane's own width and height describe its memory (the row stride, and the buffer
        // length over it), not the picture: rows are padded, e.g. 640 pixels in 1024-byte rows.
        // The picture's size is the frame's; rows past the end of the buffer are dropped.
        const pixels = new Uint8Array(plane.getPixelBuffer());
        const stride = plane.bytesPerRow;
        const width = Math.min(frame.width, stride);
        const height = Math.min(frame.height, Math.floor((pixels.length - width) / stride) + 1);
        const step = lumaStep(width, DETECTION_WIDTH);
        const luma = downsampleLuma(pixels, width, height, stride, step);
        const map: FrameAffine = {
          size: { width: frame.width, height: frame.height },
          origin: frame.convertFramePointToCameraPoint({ x: 0, y: 0 }),
          xEnd: frame.convertFramePointToCameraPoint({ x: frame.width, y: 0 }),
          yEnd: frame.convertFramePointToCameraPoint({ x: 0, y: frame.height }),
        };
        scheduleOnRN(onLuma, luma, map);
      } catch {
        wantFrame.setBlocking(true);
      } finally {
        frame.dispose();
      }
    },
    [wantFrame, onLuma],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    // A constant, not a literal: a new object each render would rebuild the output and make the
    // camera session reconfigure on every render.
    targetResolution: FRAME_RESOLUTION,
    dropFramesWhileBusy: true,
    onFrame,
  });

  const reset = useCallback(() => {
    setOutline(null);
    stabilityRef.current = INITIAL_STABILITY;
    setStability(INITIAL_STABILITY);
  }, []);

  return { detection: { outline, stability, reset }, frameOutput };
}
