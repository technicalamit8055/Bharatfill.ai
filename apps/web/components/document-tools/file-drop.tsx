'use client';

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ArrowUp, ChevronDown, CloudUpload, Upload, type LucideIcon } from 'lucide-react';
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

/** Lets a page open the file picker from its own button — "Add more files" under a page list. */
export type FileDropHandle = { open: () => void };

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export function FileDrop({
  onFiles,
  accept,
  multiple = false,
  label,
  hint,
  compact = false,
  variant = 'default',
  buttonLabel,
  buttonIcon: ButtonIcon = ArrowUp,
  choices,
  caption,
  footer,
  artwork,
  pasteable = true,
  handleRef,
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
   * call to action. `tile` is a smaller zone with artwork beside the text, for pages that offer
   * two ways in stacked one above the other. `default` is the quiet inline zone.
   */
  variant?: 'default' | 'hero' | 'tile';
  /** The hero and tile variants' button text. */
  buttonLabel?: string;
  /** The hero variant's button pictogram. */
  buttonIcon?: LucideIcon;
  /**
   * The hero variant's narrower pickers, offered from a menu beside the button. The OS file
   * dialog filters to the chosen types, which saves scrolling past every PDF to find a photo.
   * Each list must be a subset of `accept`.
   */
  choices?: readonly { label: string; accept: readonly string[] }[];
  /** A short line directly under the hero button — the supported formats. */
  caption?: string;
  /** Rendered inside the hero zone, under the button. */
  footer?: ReactNode;
  /** The tile variant's picture, shown to the left of the text. */
  artwork?: ReactNode;
  /**
   * Off for the second of two zones on one page. The paste listener is document-wide, so two
   * mounted zones would both receive the same pasted file.
   */
  pasteable?: boolean;
  handleRef?: Ref<FileDropHandle>;
  className?: string;
}) {
  const t = useTranslations();
  const inputId = useId();
  const menuId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const accepted = accept ?? null;

  // The accept attribute is written on every open, not left to React: a narrowed choice has to
  // write it imperatively (the dialog must open inside the click), and React would never undo
  // that write because the prop did not change.
  const openPicker = useCallback(
    (narrowTo?: readonly string[]) => {
      const input = inputRef.current;
      if (!input) return;
      input.accept = (narrowTo ?? accepted ?? DEFAULT_ACCEPT).join(',');
      input.click();
    },
    [accepted],
  );

  useImperativeHandle(handleRef, () => ({ open: () => openPicker() }), [openPicker]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

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
    if (!pasteable) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      handle(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handle, pasteable]);

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
      accept={(accepted ?? DEFAULT_ACCEPT).join(',')}
      className="sr-only"
      // The hero and tile variants' visible button is the keyboard entry point; a second tab
      // stop on the hidden input would announce the same action twice.
      tabIndex={variant === 'default' ? undefined : -1}
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
            <div ref={menuRef} className="relative mt-5 inline-flex rounded-lg shadow-sm">
              <button
                type="button"
                onClick={() => openPicker()}
                className={cn(
                  'inline-flex items-center gap-2 bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  choices?.length ? 'rounded-l-lg pl-8 pr-6' : 'rounded-lg px-8',
                )}
              >
                <ButtonIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                {buttonLabel ?? label ?? t('documentTools.drop.choose')}
              </button>
              {choices?.length ? (
                <>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-controls={menuOpen ? menuId : undefined}
                    aria-label={t('documentTools.drop.moreChoices')}
                    onClick={() => setMenuOpen((open) => !open)}
                    className="inline-flex items-center rounded-r-lg border-l border-brand-500 bg-brand-600 px-3 text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')}
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </button>
                  {menuOpen ? (
                    <div
                      id={menuId}
                      role="menu"
                      className="absolute right-0 top-full z-20 mt-1.5 min-w-full whitespace-nowrap rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg"
                    >
                      {choices.map((choice) => (
                        <button
                          key={choice.label}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            openPicker(choice.accept);
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            {caption ? <p className="mt-4 text-xs text-slate-500">{caption}</p> : null}
            {footer ? <div className="mt-8 w-full">{footer}</div> : null}
          </div>
        </div>
        {errorNode}
      </div>
    );
  }

  if (variant === 'tile') {
    return (
      <div className={className}>
        <div
          ref={zoneRef}
          {...dragProps}
          className={cn(
            'rounded-xl border-2 border-dashed px-4 py-5 transition-colors sm:px-6',
            dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-brand-200 bg-white hover:border-brand-300',
          )}
        >
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-6 sm:text-left">
            {artwork ? (
              <div aria-hidden className="flex shrink-0 justify-center sm:w-2/5 sm:justify-end">
                {artwork}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <label htmlFor={inputId} className="text-base font-semibold text-slate-900">
                {label ?? t('documentTools.drop.choose')}
              </label>
              {fileInput}
              <p className="mt-1 text-sm text-slate-600">{t('documentTools.drop.orDragPaste')}</p>
              <p className="mt-1 text-xs text-slate-500">{hintText}</p>
              <button
                type="button"
                onClick={() => openPicker()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                {buttonLabel ?? t('documentTools.drop.choose')}
              </button>
            </div>
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
