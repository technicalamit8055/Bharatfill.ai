'use client';

import { useCallback, useState, type PointerEvent } from 'react';
import { cn } from '@assistigo/ui';
import { clampRectToBounds, type Rect, type Size } from '@assistigo/document-tools';
import type { RedactionBox } from '@assistigo/document-tools/browser/image';

/**
 * The draggable black-out box for masking an identifier.
 *
 * A sibling to the crop overlay in `crop-stage.tsx`, not folded into it: cropping frames the
 * whole card and redaction blacks out one region *inside* the framed card, and letting an
 * operator's drag on one accidentally resize the other is the kind of bug that ships an
 * unmasked Aadhaar number.
 *
 * Solid by design — no adjustable opacity. A translucent "redaction" that still shows the digits
 * underneath is worse than none, because it looks handled.
 */
export function RedactionLayer({
  bounds,
  scale,
  box,
  onBoxChange,
  label,
}: {
  bounds: Size;
  scale: number;
  box: RedactionBox;
  onBoxChange: (box: RedactionBox) => void;
  label: string;
}) {
  const [drag, setDrag] = useState<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);

  const onPointerDown = useCallback(
    (mode: 'move' | 'resize') => (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      setDrag({ mode, startX: event.clientX, startY: event.clientY, startRect: box });
    },
    [box],
  );

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || scale === 0) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;

    if (drag.mode === 'move') {
      onBoxChange({
        ...box,
        ...clampRectToBounds({ ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy }, bounds),
      });
      return;
    }

    const width = Math.max(16, drag.startRect.width + dx);
    const height = Math.max(12, drag.startRect.height + dy);
    onBoxChange({
      ...box,
      ...clampRectToBounds({ ...drag.startRect, width, height }, bounds),
    });
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div
      role="application"
      aria-label={label}
      className="absolute cursor-move border-2 border-dashed border-white bg-slate-950"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
      }}
      onPointerDown={onPointerDown('move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        aria-hidden
        className={cn(
          'absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm',
          'border border-slate-700 bg-white shadow',
          'after:absolute after:-inset-2 after:content-[""]',
        )}
        onPointerDown={onPointerDown('resize')}
      />
    </div>
  );
}
