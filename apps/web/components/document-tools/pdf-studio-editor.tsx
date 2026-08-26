'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, NumberField, Spinner, cn } from '@assistigo/ui';
import {
  MAX_DERIVATIVE_BYTES,
  RecipeBuilder,
  derivativeFilename,
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
import { useTranslations } from '@/lib/i18n/client';
import { FileDrop } from './file-drop';
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

export function PdfStudioEditor({
  customers,
  defaultCustomerId,
  today,
}: {
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
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

  const [preset, setPreset] = useState<RequirementPreset | null>(null);
  const [maxKb, setMaxKb] = useState<number | ''>('');
  const [allowRasterise, setAllowRasterise] = useState(true);

  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);
  const dragIndex = useRef<number | null>(null);

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
    setPages((previous) => previous.filter((page) => page.id !== id));
  }

  function moveTo(fromIndex: number, toIndex: number) {
    setPages((previous) => {
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <FileDrop
          onFiles={onFiles}
          multiple
          accept={['application/pdf', 'image/jpeg', 'image/png', 'image/webp']}
          label={t('documentTools.pdf.choose')}
          hint={t('documentTools.pdf.chooseHint')}
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

        {pages.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('documentTools.pdf.pages', { count: pages.length })}
              </p>
              <Button size="sm" variant="ghost" onClick={reset}>
                {t('documentTools.transform.changeFile')}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {pages.map((page, index) => (
                <PageTileView
                  key={page.id}
                  page={page}
                  index={index}
                  onRotate={() => rotatePage(page.id)}
                  onDelete={() => deletePage(page.id)}
                  onDragStart={() => (dragIndex.current = index)}
                  onDropOn={() => {
                    if (dragIndex.current !== null && dragIndex.current !== index) {
                      moveTo(dragIndex.current, index);
                    }
                    dragIndex.current = null;
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{t('documentTools.pdf.dragHint')}</p>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <ToolSection title={t('documentTools.preset.title')} hint={t('documentTools.preset.hint')}>
          <PresetPicker categories={['pdf']} value={preset?.code ?? null} onChange={applyPreset} />
          <PresetNotes preset={preset} />
        </ToolSection>

        <ToolSection title={t('documentTools.pdf.compress')}>
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
              className="mt-0.5"
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
          output={output}
          busy={rendering && output === null}
          customers={customers}
          defaultCustomerId={defaultCustomerId}
        />
      </div>
    </div>
  );
}

function PageTileView({
  page,
  index,
  onRotate,
  onDelete,
  onDragStart,
  onDropOn,
}: {
  page: PageTile;
  index: number;
  onRotate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const t = useTranslations();
  const [over, setOver] = useState(false);

  return (
    <div
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
        'group relative cursor-grab overflow-hidden rounded border bg-white',
        over ? 'border-brand-500 ring-2 ring-brand-400' : 'border-slate-200',
      )}
    >
      <div className="flex aspect-[3/4] items-center justify-center bg-slate-50 p-1">
        {page.thumbnail ? (
          <img
            src={page.thumbnail}
            alt=""
            style={{ transform: `rotate(${page.rotate}deg)` }}
            className="max-h-full max-w-full object-contain transition-transform"
          />
        ) : null}
      </div>
      <Badge tone="neutral" className="absolute left-1 top-1 text-[9px]">
        {index + 1}
      </Badge>
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onRotate}
          title={t('documentTools.pdf.rotatePage')}
          className="rounded bg-white/90 p-1 text-slate-700 shadow hover:bg-white"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t('documentTools.pdf.deletePage')}
          className="rounded bg-white/90 p-1 text-red-600 shadow hover:bg-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
