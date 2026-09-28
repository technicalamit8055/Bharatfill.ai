'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, FolderOpen, Grip, Info, Plus, RotateCw, Shrink, Trash2 } from 'lucide-react';
import { MAX_UPLOAD_BYTES } from '@assistigo/core';
import { Alert, Button, NumberField, Spinner, cn } from '@assistigo/ui';
import {
  DEFAULT_TOOL_PREFERENCES,
  MAX_DERIVATIVE_BYTES,
  RecipeBuilder,
  derivativeFilename,
  findPreset,
  type RequirementPreset,
} from '@assistigo/document-tools';
import {
  PdfPasswordRequiredError,
  assemblePdf,
  compressPdf,
  imagesToPdf,
  loadPdf,
  renderPdfThumbnails,
  type PageRef,
} from '@assistigo/document-tools/browser/pdf';
import { formatBytes } from '@/lib/documents/format';
import { readToolPreferences } from '@/lib/document-tools/preferences';
import { useTranslations } from '@/lib/i18n/client';
import { FileDrop, type FileDropHandle } from './file-drop';
import { OutputPanel, type CustomerOption, type ToolOutput } from './output-panel';
import { PresetNotes, PresetPicker } from './preset-picker';
import { ToolSection } from './tool-shell';

/**
 * PDF Studio: merge, split, reorder, rotate, delete pages, image → PDF, target-KB compress.
 * Master spec §13.2.
 *
 * The model is one flat, reorderable page list drawn from any number of source files — a source
 * PDF's pages and a batch of photographed pages are the same kind of tile once loaded, which is
 * what makes "combine the 10th, 12th and degree marksheets into one PDF" a drag operation rather
 * than a separate merge step.
 *
 * Each source keeps its original bytes untouched (§13.3's first acceptance criterion); the
 * assembled PDF is built fresh from `assemblePdf`, which copies page objects losslessly.
 */

type PageTile = {
  id: string;
  sourceIndex: number;
  pageNumber: number;
  thumbnail: string;
  rotate: number;
};

type SourceEntry = { bytes: Uint8Array; label: string };

const RENDER_DEBOUNCE_MS = 250;

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function PdfStudioEditor({
  header,
  customers,
  defaultCustomerId,
  defaultPresetCode,
  today,
}: {
  /** Rendered above the upload card, so the settings rail can start at the top of the page. */
  header?: ReactNode;
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
  defaultPresetCode?: string | null;
  today: string;
}) {
  const t = useTranslations();

  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [pages, setPages] = useState<PageTile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingPassword, setPendingPassword] = useState<{ bytes: Uint8Array; label: string } | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [preset, setPreset] = useState<RequirementPreset | null>(
    defaultPresetCode ? findPreset(defaultPresetCode) : null,
  );
  const [maxKb, setMaxKb] = useState<number | ''>(() => {
    const initial = defaultPresetCode ? findPreset(defaultPresetCode) : null;
    return initial?.maxBytes ? Math.round(initial.maxBytes / 1024) : '';
  });
  const [allowRasterise, setAllowRasterise] = useState(
    DEFAULT_TOOL_PREFERENCES.pdf.allowRasterise,
  );

  // The operator's own starting value (Settings → My preferences), read after mount so the
  // server-rendered first paint matches the built-in default.
  useEffect(() => {
    setAllowRasterise(readToolPreferences().pdf.allowRasterise);
  }, []);

  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);
  const dragIndex = useRef<number | null>(null);
  const dropRef = useRef<FileDropHandle>(null);

  const applyPreset = useCallback((next: RequirementPreset | null) => {
    setPreset(next);
    if (next?.maxBytes) setMaxKb(Math.round(next.maxBytes / 1024));
  }, []);

  const addPdfSource = useCallback(
    async (bytes: Uint8Array, label: string, password?: string) => {
      const loaded = await loadPdf(bytes, password);
      const thumbnails = await renderPdfThumbnails(bytes, { password, maxEdgePx: 220 });

      setSources((previous) => {
        const sourceIndex = previous.length;
        setPages((existingPages) => [
          ...existingPages,
          ...loaded.pages.map((page, index) => ({
            id: `${sourceIndex}-${page.pageNumber}-${Date.now()}-${index}`,
            sourceIndex,
            pageNumber: page.pageNumber,
            thumbnail: thumbnails[index]?.dataUrl ?? '',
            rotate: 0,
          })),
        ]);
        return [...previous, { bytes, label }];
      });
    },
    [],
  );

  const addImageSource = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const pdfBytes = await imagesToPdf([{ bytes, mimeType }], { pageSize: 'fit' });
    await addPdfSource(pdfBytes, file.name);
  }, [addPdfSource]);

  const onFiles = useCallback(
    async (files: File[]) => {
      setLoadError(null);
      setLoading(true);
      try {
        for (const file of files) {
          if (file.type === 'application/pdf') {
            const bytes = new Uint8Array(await file.arrayBuffer());
            try {
              await addPdfSource(bytes, file.name);
            } catch (error) {
              if (error instanceof PdfPasswordRequiredError) {
                setPendingPassword({ bytes, label: file.name });
                continue;
              }
              throw error;
            }
          } else {
            await addImageSource(file);
          }
        }
      } catch {
        setLoadError('documentTools.errors.decodeFailed');
      } finally {
        setLoading(false);
      }
    },
    [addPdfSource, addImageSource],
  );

  async function unlockPending() {
    if (!pendingPassword) return;
    setLoading(true);
    setPasswordError(null);
    try {
      await addPdfSource(pendingPassword.bytes, pendingPassword.label, password);
      setPendingPassword(null);
      setPassword('');
    } catch (error) {
      setPasswordError(
        error instanceof PdfPasswordRequiredError
          ? 'documentTools.card.passwordIncorrect'
          : 'documentTools.errors.decodeFailed',
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Page list operations
  // ---------------------------------------------------------------------------

  function rotatePage(id: string) {
    setPages((previous) =>
      previous.map((page) =>
        page.id === id ? { ...page, rotate: (page.rotate + 90) % 360 } : page,
      ),
    );
  }

  function deletePage(id: string) {
    // Removing the last page drops the source bytes too — nothing references them any more, and
    // a fresh start should not carry a stranger's file forward as source 0.
    if (pages.length === 1 && pages[0]?.id === id) {
      reset();
      return;
    }
    setPages((previous) => previous.filter((page) => page.id !== id));
  }

  function moveTo(fromIndex: number, toIndex: number) {
    setPages((previous) => {
      if (toIndex < 0 || toIndex >= previous.length) return previous;
      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return previous;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function reset() {
    setSources([]);
    setPages([]);
    setOutput(null);
  }

  // ---------------------------------------------------------------------------
  // Assemble + compress
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (pages.length === 0 || sources.length === 0) {
      setOutput(null);
      return;
    }

    const token = ++renderToken.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        const refs: PageRef[] = pages.map((page) => ({
          sourceIndex: page.sourceIndex,
          pageNumber: page.pageNumber,
          rotate: page.rotate || undefined,
        }));
        const assembled = await assemblePdf(sources.map((source) => source.bytes), refs);

        const maxBytes = typeof maxKb === 'number' && maxKb > 0 ? maxKb * 1024 : undefined;
        let finalBytes = assembled;
        let compression: Awaited<ReturnType<typeof compressPdf>> | null = null;

        if (maxBytes && assembled.byteLength > maxBytes) {
          compression = await compressPdf(assembled, { maxBytes, allowRasterise });
          finalBytes = compression.bytes;
        }
        if (token !== renderToken.current) return;

        const recipe = new RecipeBuilder('pdf_studio', preset?.code ?? null)
          .addIf(sources.length > 1, 'merge', { files: sources.length })
          .addIf(pages.some((page) => page.rotate !== 0), 'rotate', {
            pages: pages.filter((page) => page.rotate !== 0).length,
          })
          .add('reorder', { pages: pages.length })
          .addIf(Boolean(compression), 'rasterise', {
            dpi: compression?.dpi ?? 0,
            quality: compression?.jpegQuality ?? 0,
          })
          .addIf(Boolean(maxBytes), 'compress', { maxBytes: maxBytes ?? 0 })
          .build({
            mimeType: 'application/pdf',
            pageCount: pages.length,
            sourceCount: sources.length,
          });

        const warnings: string[] = [];
        if (compression?.overLimit) warnings.push('documentTools.warnings.overLimit');
        if (compression?.rasterised) warnings.push('documentTools.pdf.rasterisedWarning');
        if (finalBytes.byteLength > MAX_DERIVATIVE_BYTES) {
          warnings.push('documentTools.warnings.tooLargeToSave');
        }

        setOutput({
          bytes: finalBytes,
          mimeType: 'application/pdf',
          filename: derivativeFilename({
            tool: 'pdf_studio',
            presetCode: preset?.code ?? null,
            mimeType: 'application/pdf',
            date: today,
          }),
          widthPx: null,
          heightPx: null,
          recipe,
          window: maxBytes ? { maxBytes } : {},
          warnings,
        });
      } catch {
        setOutput(null);
        setLoadError('documentTools.errors.assembleFailed');
      } finally {
        if (token === renderToken.current) setRendering(false);
      }
    }, RENDER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [pages, sources, maxKb, allowRasterise, preset, today]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_auto_1fr]">
      {header ? <div className="min-w-0 xl:col-start-1 xl:row-start-1">{header}</div> : null}

      <section className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-start-1 xl:row-start-2">
        <FileDrop
          variant="hero"
          handleRef={dropRef}
          onFiles={onFiles}
          multiple
          accept={ACCEPTED_TYPES}
          label={t('documentTools.pdf.choose')}
          hint={t('documentTools.pdf.chooseHint')}
          buttonLabel={t('documentTools.pdf.chooseFiles')}
          buttonIcon={FolderOpen}
          choices={[
            { label: t('documentTools.pdf.choosePdfs'), accept: ['application/pdf'] },
            { label: t('documentTools.pdf.choosePhotos'), accept: PHOTO_TYPES },
          ]}
          caption={t('documentTools.pdf.supports', { size: formatBytes(MAX_UPLOAD_BYTES) })}
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner />
            {t('documentTools.pdf.loading')}
          </div>
        ) : null}
        {loadError ? <Alert tone="danger">{t(loadError)}</Alert> : null}

        {pendingPassword ? (
          <ToolSection
            title={t('documentTools.card.unlockTitle')}
            hint={t('documentTools.pdf.protectedFile', { name: pendingPassword.label })}
          >
            <div className="flex items-end gap-2">
              <label className="flex-1 space-y-1">
                <span className="block text-xs font-medium text-slate-700">
                  {t('documentTools.card.password')}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
                />
              </label>
              <Button size="sm" loading={loading} onClick={unlockPending}>
                {t('documentTools.card.unlock')}
              </Button>
            </div>
            {passwordError ? <Alert tone="danger">{t(passwordError)}</Alert> : null}
          </ToolSection>
        ) : null}
      </section>

      {pages.length > 0 ? (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:col-start-1 xl:row-start-3 xl:self-start">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
              {t('documentTools.pdf.pages', { count: pages.length })}
            </h2>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={reset}>
                {t('documentTools.pdf.clearAll')}
              </Button>
              <button
                type="button"
                onClick={() => dropRef.current?.open()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600 bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                {t('documentTools.pdf.addMore')}
              </button>
            </div>
          </header>

          <ol className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                thumbnail={page.thumbnail}
                rotate={page.rotate}
                index={index}
                onRotate={() => rotatePage(page.id)}
                onDelete={() => deletePage(page.id)}
                onMove={(delta) => moveTo(index, index + delta)}
                onDragStart={() => (dragIndex.current = index)}
                onDropOn={() => {
                  if (dragIndex.current !== null && dragIndex.current !== index) {
                    moveTo(dragIndex.current, index);
                  }
                  dragIndex.current = null;
                }}
              />
            ))}
          </ol>

          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <Info className="mt-px h-4 w-4 shrink-0 fill-slate-400 text-white" aria-hidden />
            {t('documentTools.pdf.dragHint')}
          </p>
        </section>
      ) : null}

      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-3 xl:row-start-1">
        <ToolSection
          step={1}
          title={t('documentTools.preset.title')}
          hint={t('documentTools.preset.hint')}
        >
          <PresetPicker
            variant="cards"
            categories={['pdf']}
            value={preset?.code ?? null}
            onChange={applyPreset}
          />
          <PresetNotes preset={preset} />
        </ToolSection>

        <ToolSection
          step={2}
          icon={Shrink}
          title={t('documentTools.pdf.compress')}
          titleAdornment={
            <span className="text-xs font-normal text-slate-500">
              ({t('documentTools.studio.optional')})
            </span>
          }
          actions={
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {t('documentTools.pdf.recommended')}
            </span>
          }
        >
          <NumberField
            label={t('documentTools.rule.maxKb')}
            unit="KB"
            min={0}
            step={10}
            value={maxKb}
            onValueChange={setMaxKb}
          />
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={allowRasterise}
              onChange={(event) => setAllowRasterise(event.target.checked)}
              className="mt-px h-4 w-4 shrink-0 accent-brand-600"
            />
            <span>{t('documentTools.pdf.allowRasterise')}</span>
          </label>
          {!allowRasterise ? (
            <p className="text-[11px] leading-tight text-amber-700">
              {t('documentTools.pdf.rasteriseOffHint')}
            </p>
          ) : null}
        </ToolSection>

        <OutputPanel
          step={3}
          icon={CircleCheck}
          previewable
          output={output}
          busy={rendering && output === null}
          customers={customers}
          defaultCustomerId={defaultCustomerId}
        />
      </div>
    </div>
  );
}

/** One page in the list: drag it, or reorder from the grip with the arrow keys. */
function PageCard({
  thumbnail,
  rotate,
  index,
  onRotate,
  onDelete,
  onMove,
  onDragStart,
  onDropOn,
}: {
  thumbnail: string;
  rotate: number;
  index: number;
  onRotate: () => void;
  onDelete: () => void;
  /** Keyboard reordering from the grip: -1 is one place earlier, +1 one place later. */
  onMove: (delta: -1 | 1) => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const t = useTranslations();
  const [over, setOver] = useState(false);

  const actionButton =
    'flex flex-1 items-center justify-center py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900';

  return (
    <li
      aria-label={t('documentTools.pdf.pageLabel', { number: index + 1 })}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDropOn();
      }}
      className={cn(
        'relative flex cursor-grab flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow active:cursor-grabbing',
        over ? 'border-brand-500 ring-2 ring-brand-400' : 'border-slate-200',
      )}
    >
      <div className="p-2 pb-0">
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-white">
          {thumbnail ? (
            // A data URL rendered in the browser; next/image would try to optimise it on the server.
            <img
              src={thumbnail}
              alt=""
              draggable={false}
              style={{ transform: `rotate(${rotate}deg)` }}
              className="max-h-full max-w-full object-contain transition-transform"
            />
          ) : null}
        </div>
      </div>
      <span
        aria-hidden
        className="absolute left-3.5 top-3.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-800 shadow-sm"
      >
        {index + 1}
      </span>

      <div className="mt-2 flex border-t border-slate-100">
        <button
          type="button"
          onClick={onRotate}
          title={t('documentTools.pdf.rotatePage')}
          aria-label={t('documentTools.pdf.rotatePage')}
          className={actionButton}
        >
          <RotateCw className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t('documentTools.pdf.deletePage')}
          aria-label={t('documentTools.pdf.deletePage')}
          className={cn(actionButton, 'hover:text-red-600')}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          title={t('documentTools.pdf.reorderPage')}
          aria-label={t('documentTools.pdf.reorderPage')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              onMove(-1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              onMove(1);
            }
          }}
          className={cn(actionButton, 'cursor-grab')}
        >
          <Grip className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
