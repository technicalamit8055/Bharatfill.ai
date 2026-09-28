'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { ArrowUp, CloudUpload } from 'lucide-react';
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
  variant = 'default',
  buttonLabel,
  footer,
  className,
}: {
  onFiles: (files: File[]) => void;
  /** MIME types to accept. Defaults to the upload allow-list. */
  accept?: readonly string[];
  multiple?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
  /**
   * `hero` is the large, icon-led zone a tool shows when it opens empty — the whole card is the
   * call to action. `default` is the quiet inline zone.
   */
  variant?: 'default' | 'hero';
  /** The hero variant's button text. */
  buttonLabel?: string;
  /** Rendered inside the hero zone, under the button. */
  footer?: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const dragProps = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      handle([...event.dataTransfer.files]);
    },
  };

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      multiple={multiple}
      accept={(accepted ?? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']).join(',')}
      className="sr-only"
      // The hero variant's visible button is the keyboard entry point; a second tab stop on the
      // hidden input would announce the same action twice.
      tabIndex={variant === 'hero' ? -1 : undefined}
      onChange={(event) => {
        handle([...(event.target.files ?? [])]);
        // Reset so choosing the same file twice still fires a change event.
        event.target.value = '';
      }}
    />
  );

  const hintText = hint ?? t('documents.fileHint', { size: formatBytes(MAX_UPLOAD_BYTES) });

  const errorNode = error ? (
    <Alert tone="danger" className="mt-2">
      {t(error)}
    </Alert>
  ) : null;

  if (variant === 'hero') {
    return (
      <div className={className}>
        <div
          ref={zoneRef}
          {...dragProps}
          className={cn(
            'rounded-2xl border-2 border-dashed px-4 py-10 transition-colors sm:px-6',
            dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-brand-200 bg-gradient-to-b from-brand-50/40 to-white',
          )}
        >
          <div className="flex flex-col items-center text-center">
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100/70 text-brand-600"
            >
              <CloudUpload className="h-9 w-9" strokeWidth={1.8} />
            </span>
            <label htmlFor={inputId} className="mt-4 text-lg font-semibold text-slate-900">
              {label ?? t('documentTools.drop.choose')}
            </label>
            {fileInput}
            <p className="mt-1 text-sm text-slate-600">{t('documentTools.drop.orDragPaste')}</p>
            <p className="mt-1 text-xs text-slate-500">{hintText}</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              {buttonLabel ?? label ?? t('documentTools.drop.choose')}
            </button>
            {footer ? <div className="mt-8 w-full">{footer}</div> : null}
          </div>
        </div>
        {errorNode}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={zoneRef}
        {...dragProps}
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
          {fileInput}
          <p className="mt-1 text-xs text-slate-500">{t('documentTools.drop.orDragPaste')}</p>
          <p className="mt-1 text-[11px] text-slate-400">{hintText}</p>
        </div>
      </div>

      {errorNode}
    </div>
  );
}
