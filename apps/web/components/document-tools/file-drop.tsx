'use client';

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Alert, cn } from '@assistigo/ui';
import { MAX_UPLOAD_BYTES, isAllowedUploadMimeType } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { formatBytes } from '@/lib/documents/format';

/**
 * How every tool takes its input.
 *
 * Three ways in, because operators arrive at the file three different ways:
 *
 *   - clicking, which is what everyone does the first time,
 *   - dragging from a folder or from a WhatsApp download,
 *   - pasting, which is how a screenshot or a copied image gets in — and the one that saves the
 *     most time on a counter, since it turns "save the photo, find the photo, upload the photo"
 *     into one keystroke.
 *
 * Format and size are checked here so the operator finds out before they wait. Nothing is
 * uploaded: these files are read into the browser and stay there.
 */
export function FileDrop({
  onFiles,
  accept,
  multiple = false,
  label,
  hint,
  compact = false,
  className,
}: {
  onFiles: (files: File[]) => void;
  /** MIME types to accept. Defaults to the upload allow-list. */
  accept?: readonly string[];
  multiple?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const accepted = accept ?? null;

  const check = useCallback(
    (files: File[]): File[] => {
      const good: File[] = [];
      for (const file of files) {
        // The declared type only; the server sniffs the bytes of anything that gets uploaded.
        const allowed = accepted
          ? accepted.includes(file.type)
          : isAllowedUploadMimeType(file.type);
        if (!allowed) {
          setError('validation.unsupported_file_type');
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError('validation.file_too_large');
          continue;
        }
        good.push(file);
      }
      if (good.length > 0) setError(null);
      return multiple ? good : good.slice(0, 1);
    },
    [accepted, multiple],
  );

  const handle = useCallback(
    (files: File[]) => {
      const good = check(files);
      if (good.length > 0) onFiles(good);
    },
    [check, onFiles],
  );

  // Paste anywhere on the page while this drop zone is mounted. Scoped to the document rather
  // than the element because a drop zone is not focusable, and requiring a click before Ctrl+V
  // would defeat the point.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      handle(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handle]);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    handle([...event.dataTransfer.files]);
  }

  return (
    <div className={className}>
      <div
        ref={zoneRef}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors',
          compact ? 'px-4 py-4' : 'px-6 py-10',
          dragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 bg-slate-50/60 hover:border-slate-400',
        )}
      >
        <div className="text-center">
          <label
            htmlFor={inputId}
            className="cursor-pointer text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            {label ?? t('documentTools.drop.choose')}
          </label>
          <input
            id={inputId}
            type="file"
            multiple={multiple}
            accept={(accepted ?? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']).join(
              ',',
            )}
            className="sr-only"
            onChange={(event) => {
              handle([...(event.target.files ?? [])]);
              // Reset so choosing the same file twice still fires a change event.
              event.target.value = '';
            }}
          />
          <p className="mt-1 text-xs text-slate-500">{t('documentTools.drop.orDragPaste')}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {hint ?? t('documents.fileHint', { size: formatBytes(MAX_UPLOAD_BYTES) })}
          </p>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mt-2">
          {t(error)}
        </Alert>
      ) : null}
    </div>
  );
}
