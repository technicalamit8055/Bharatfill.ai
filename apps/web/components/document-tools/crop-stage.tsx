'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@assistigo/ui';
import { clampRectToBounds, type Rect, type Size } from '@assistigo/document-tools';
import { StageBackdrop } from './tool-shell';

/**
 * The interactive crop box.
 *
 * Design notes worth keeping:
 *
 *   - The crop rectangle is held in *working-canvas pixels*, not in display pixels or in
 *     percentages. That is the coordinate space every downstream operation uses, so there is one
 *     conversion (at the pointer) rather than one per consumer.
 *   - The picture is a `<canvas>` the parent hands over, drawn once per straighten/adjust change.
 *     The crop box is DOM. Dragging a handle therefore never re-renders the image, which is what
 *     makes the drag feel attached to the operator's mouse rather than trailing it.
 *   - When a preset fixes an aspect ratio, the ratio is enforced during the drag, not corrected
 *     afterwards. A box that snaps into a different shape when released is a box the operator
 *     stops trusting.
 */

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'cursor-nwse-resize',
  n: 'cursor-ns-resize',
  ne: 'cursor-nesw-resize',
  e: 'cursor-ew-resize',
  se: 'cursor-nwse-resize',
  s: 'cursor-ns-resize',
  sw: 'cursor-nesw-resize',
  w: 'cursor-ew-resize',
  move: 'cursor-move',
};

/** Smallest crop the operator can drag to, in working pixels. Below this the preview is useless. */
const MIN_CROP_PX = 24;

export function CropStage({
  canvas,
  crop,
  onCropChange,
  aspect,
  /** Turns the crop overlay off — used when the tool is not framing anything. */
  disabled = false,
  /** Draws the rule-of-thirds grid inside the box while dragging. */
  guides = true,
  transparent = false,
  className,
  children,
}: {
  canvas: HTMLCanvasElement | null;
  crop: Rect;
  onCropChange: (crop: Rect) => void;
  aspect?: number | null;
  disabled?: boolean;
  guides?: boolean;
  transparent?: boolean;
  className?: string;
  /** Extra overlay content, positioned against the image — the redaction layer uses this. */
  children?: (view: { scale: number; bounds: Size }) => React.ReactNode;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState<Size>({ width: 0, height: 0 });
  const [drag, setDrag] = useState<{
    handle: HandleId;
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);

  const bounds: Size = canvas
    ? { width: canvas.width, height: canvas.height }
    : { width: 1, height: 1 };

  // Mount the parent's canvas into the DOM and letterbox it to the holder. `useLayoutEffect`
  // because the measurement below has to happen before paint, or the crop box flashes at the
  // wrong size on first render.
  useLayoutEffect(() => {
    const holder = imageRef.current;
    if (!holder) return;
    holder.replaceChildren();
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.maxHeight = '100%';
    canvas.style.objectFit = 'contain';
    holder.appendChild(canvas);
  }, [canvas]);

  // Track the on-screen size of the image so pointer positions can be mapped back to working
  // pixels. A ResizeObserver rather than a window listener: the rail collapsing at the xl
  // breakpoint changes the stage width without the window changing at all.
  useEffect(() => {
    const holder = imageRef.current;
    if (!holder) return;
    const observer = new ResizeObserver(() => {
      const rect = holder.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
    });
    observer.observe(holder);
    const rect = holder.getBoundingClientRect();
    setDisplaySize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, [canvas]);

  const scale = displaySize.width > 0 ? displaySize.width / bounds.width : 0;

  const applyDrag = useCallback(
    (handle: HandleId, startRect: Rect, dx: number, dy: number): Rect => {
      if (handle === 'move') {
        return clampRectToBounds(
          { ...startRect, x: startRect.x + dx, y: startRect.y + dy },
          bounds,
        );
      }

      let { x, y, width, height } = startRect;
      const right = x + width;
      const bottom = y + height;

      if (handle.includes('w')) {
        x = Math.min(startRect.x + dx, right - MIN_CROP_PX);
        width = right - x;
      }
      if (handle.includes('e')) {
        width = Math.max(MIN_CROP_PX, startRect.width + dx);
      }
      if (handle.includes('n')) {
        y = Math.min(startRect.y + dy, bottom - MIN_CROP_PX);
        height = bottom - y;
      }
      if (handle.includes('s')) {
        height = Math.max(MIN_CROP_PX, startRect.height + dy);
      }

      if (aspect && aspect > 0) {
        // Corner handles are driven by whichever axis the operator moved further, so the box
        // follows the pointer instead of fighting it. Edge handles derive the other axis.
        const drivenByWidth =
          handle === 'e' || handle === 'w' || Math.abs(dx) >= Math.abs(dy);
        if (drivenByWidth) height = width / aspect;
        else width = height * aspect;

        // Re-anchor: a north or west drag grows away from the fixed edge, so the origin moves.
        if (handle.includes('n')) y = bottom - height;
        if (handle.includes('w')) x = right - width;
      }

      // Keep the box inside the image without changing its shape: shrink to fit, then clamp.
      const maxWidth = Math.min(width, bounds.width);
      const maxHeight = Math.min(height, bounds.height);
      if (aspect && aspect > 0) {
        const fit = Math.min(maxWidth / width, maxHeight / height);
        width *= fit;
        height *= fit;
        if (handle.includes('n')) y = bottom - height;
        if (handle.includes('w')) x = right - width;
      } else {
        width = maxWidth;
        height = maxHeight;
      }

      return clampRectToBounds({ x, y, width, height }, bounds);
    },
    [aspect, bounds],
  );

  function onPointerDown(handle: HandleId) {
    return (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || scale === 0) return;
      event.preventDefault();
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      setDrag({ handle, startX: event.clientX, startY: event.clientY, startRect: crop });
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || scale === 0) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    onCropChange(applyDrag(drag.handle, drag.startRect, dx, dy));
  }

  function endDrag() {
    setDrag(null);
  }

  // Arrow-key nudging. An operator lining a face up inside a 3.5 × 4.5 cm box needs single-pixel
  // control, and Shift makes it ten — the convention from every image editor.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onCropChange(
      clampRectToBounds({ ...crop, x: crop.x + move[0], y: crop.y + move[1] }, bounds),
    );
  }

  const box = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  };

  return (
    <StageBackdrop
      transparent={transparent}
      className={cn('min-h-[280px] p-3 sm:p-5', className)}
    >
      <div
        ref={holderRef}
        className="relative flex max-h-[62dvh] w-full items-center justify-center"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={imageRef} className="relative max-h-full w-full max-w-full" />

        {canvas && scale > 0 ? (
          <div
            className="absolute inset-0"
            style={{
              // The overlay must line up with the letterboxed canvas, not the holder.
              width: displaySize.width,
              height: displaySize.height,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {children?.({ scale, bounds })}

            {disabled ? null : (
              <>
                {/* Dim everything outside the crop, so the operator sees the portal's frame. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-slate-900/45"
                  style={{
                    clipPath: `polygon(0% 0%, 0% 100%, ${box.left}px 100%, ${box.left}px ${box.top}px, ${box.left + box.width}px ${box.top}px, ${box.left + box.width}px ${box.top + box.height}px, ${box.left}px ${box.top + box.height}px, ${box.left}px 100%, 100% 100%, 100% 0%)`,
                  }}
                />

                <div
                  role="application"
                  aria-label="Crop area"
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  onPointerDown={onPointerDown('move')}
                  className={cn(
                    'absolute outline-2 outline-offset-0 outline-white/90',
                    'ring-1 ring-slate-900/40 focus-visible:outline focus-visible:outline-brand-400',
                    HANDLE_CURSOR.move,
                  )}
                  style={{ ...box, outlineStyle: 'solid' }}
                >
                  {guides && drag ? (
                    <div aria-hidden className="pointer-events-none absolute inset-0">
                      <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
                      <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
                      <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
                      <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
                    </div>
                  ) : null}

                  {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
                    <div
                      key={handle}
                      onPointerDown={onPointerDown(handle)}
                      className={cn(
                        'absolute h-3 w-3 rounded-sm border border-slate-700 bg-white shadow',
                        // Touch targets are bigger than they look; a 12 px handle is hard to hit.
                        'after:absolute after:-inset-2 after:content-[""]',
                        HANDLE_CURSOR[handle],
                        handle.includes('n') && '-top-1.5',
                        handle.includes('s') && '-bottom-1.5',
                        handle.includes('w') && '-left-1.5',
                        handle.includes('e') && '-right-1.5',
                        (handle === 'n' || handle === 's') && 'left-1/2 -ml-1.5',
                        (handle === 'e' || handle === 'w') && 'top-1/2 -mt-1.5',
                      )}
                    />
                  ))}
                </div>

                {/* Live pixel readout. The number the portal will validate, while dragging. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white"
                  style={{
                    left: box.left,
                    top: box.top > 22 ? box.top - 20 : box.top + box.height + 4,
                  }}
                >
                  {Math.round(crop.width)} × {Math.round(crop.height)}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </StageBackdrop>
  );
}
