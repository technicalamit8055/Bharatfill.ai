'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Crop,
  Download,
  Eye,
  FileText,
  FlipHorizontal2,
  ImagePlus,
  LayoutGrid,
  Printer,
  RotateCcw,
  RotateCw,
  ScanFace,
  Settings,
} from 'lucide-react';
import { Alert, NumberField, Slider, Switch, cn } from '@assistigo/ui';
import { MAX_UPLOAD_BYTES } from '@assistigo/core';
import {
  DEFAULT_GAP_MM,
  DEFAULT_MARGIN_MM,
  DEFAULT_PRINT_DPI,
  DEFAULT_TOOL_PREFERENCES,
  GRID_COUNT_OPTIONS,
  PRINT_SHEETS,
  RecipeBuilder,
  centredCropForAspect,
  cutMarksForCell,
  derivativeFilename,
  findSheet,
  planPhotoSheet,
  type Rect,
  type SheetLayout,
} from '@assistigo/document-tools';
import {
  canvasAsSource,
  composePhotoSheet,
  decodeImage,
  encodeToWindow,
  findTrimRect,
  renderImage,
  type DecodedImage,
} from '@assistigo/document-tools/browser/image';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { readToolPreferences } from '@/lib/document-tools/preferences';
import { downloadBytes, printImage } from '@/lib/document-tools/save';
import { CropStage } from './crop-stage';
import { FileDrop } from './file-drop';
import { OutputPanel, type CustomerOption, type ToolOutput } from './output-panel';
import { ToolSection } from './tool-shell';

/**
 * Passport and stamp photo sheets.
 *
 * The counter job this replaces: a customer asks for eight passport photos, and the operator
 * lays them out by hand in a desktop image editor — five to ten minutes, every time, and the
 * cut lines end up wherever the eye put them.
 *
 * What makes the output usable is the arithmetic in `planPhotoSheet`, which is unit tested in
 * @assistigo/document-tools: real millimetres, a centred block, a centred final row, and corner
 * ticks that sit in the gap so the cut consumes them.
 */

const MAX_WORKING_EDGE = 2400;
const RENDER_DEBOUNCE_MS = 220;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Stock artwork of a made-up person. Shown in the preview until the operator adds a photo, so an
 * empty tool still explains what it makes; it never reaches an output.
 */
const SAMPLE_PHOTO_SRC = '/document-tools/sample-passport-photo.png';

/** Sizes a customer asks for by name. Millimetres, because the printer works in millimetres. */
const PHOTO_SIZES = [
  { code: 'passport', widthMm: 35, heightMm: 45 },
  { code: 'stamp', widthMm: 20, heightMm: 25 },
  { code: 'postcard', widthMm: 101.6, heightMm: 152.4 },
  { code: 'square', widthMm: 35, heightMm: 35 },
] as const;

type PhotoSizeCode = (typeof PHOTO_SIZES)[number]['code'] | 'custom';

/** The sizes offered as tiles; the postcard size stays reachable through Custom. */
const SIZE_TILES = [
  { code: 'passport', labelKey: 'documentTools.grid.sizePassportShort' },
  { code: 'stamp', labelKey: 'documentTools.grid.sizeStampShort' },
  { code: 'square', labelKey: 'documentTools.grid.sizeSquare' },
] as const;

/**
 * The counts customers actually ask for. A count the sheet cannot hold is shown disabled rather
 * than offered, because a button that silently drops four photos is worse than no button.
 */
const COUNT_OPTIONS = GRID_COUNT_OPTIONS;

/** Paper tiles per row; a leftover last tile spans the row. */
const PAPER_COLUMNS = 4;

/** Tick length on the printed sheet, ~1.3 mm — the same as `composePhotoSheet`. */
const CUT_MARK_INCH = 0.05;

function formatCm(mm: number): string {
  return String(Number((mm / 10).toFixed(2)));
}

export function PassportGridEditor({
  header,
  customers,
  defaultCustomerId,
  today,
}: {
  /** Rendered above the picture column, so the settings rail can start at the top of the page. */
  header?: ReactNode;
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
  today: string;
}) {
  const t = useTranslations();
  const { locale } = useI18n();

  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [working, setWorking] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [flip, setFlip] = useState(false);

  const [sheetCode, setSheetCode] = useState(DEFAULT_TOOL_PREFERENCES.grid.sheetCode);
  const [sizeCode, setSizeCode] = useState<PhotoSizeCode>(DEFAULT_TOOL_PREFERENCES.grid.photoSize);
  const [customWidthMm, setCustomWidthMm] = useState<number | ''>(35);
  const [customHeightMm, setCustomHeightMm] = useState<number | ''>(45);
  const [count, setCount] = useState<number | null>(DEFAULT_TOOL_PREFERENCES.grid.count);
  const [gapMm, setGapMm] = useState(DEFAULT_GAP_MM);
  const [marginMm, setMarginMm] = useState(DEFAULT_MARGIN_MM);
  const [cutMarks, setCutMarks] = useState(DEFAULT_TOOL_PREFERENCES.grid.cutMarks);
  const [dpi, setDpi] = useState(DEFAULT_TOOL_PREFERENCES.grid.dpi);

  // The operator's own starting values (Settings → My preferences). Read after mount: they live
  // in this browser, and the server-rendered first paint has to match the built-in defaults.
  useEffect(() => {
    const { grid } = readToolPreferences();
    setSheetCode(grid.sheetCode);
    setSizeCode(grid.photoSize);
    setCount(grid.count);
    setCutMarks(grid.cutMarks);
    setDpi(grid.dpi);
  }, []);

  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);
  const changeInput = useRef<HTMLInputElement>(null);

  const sheet = findSheet(sheetCode) ?? PRINT_SHEETS[0]!;

  const photo = useMemo(() => {
    if (sizeCode === 'custom') {
      return {
        widthMm: typeof customWidthMm === 'number' ? customWidthMm : 35,
        heightMm: typeof customHeightMm === 'number' ? customHeightMm : 45,
      };
    }
    const found = PHOTO_SIZES.find((size) => size.code === sizeCode) ?? PHOTO_SIZES[0];
    return { widthMm: found.widthMm, heightMm: found.heightMm };
  }, [sizeCode, customWidthMm, customHeightMm]);

  const layout = useMemo(
    () =>
      planPhotoSheet({
        sheet,
        photoWidthMm: photo.widthMm,
        photoHeightMm: photo.heightMm,
        count,
        gapMm,
        marginMm,
        dpi,
      }),
    [sheet, photo, count, gapMm, marginMm, dpi],
  );

  const aspect = photo.widthMm / photo.heightMm;

  const loadFile = useCallback(async (file: File) => {
    setDecodeError(null);
    try {
      const image = await decodeImage(file);
      setDecoded((previous) => {
        previous?.release();
        return image;
      });
      setQuarterTurns(0);
      setFlip(false);
    } catch {
      setDecodeError('documentTools.errors.decodeFailed');
    }
  }, []);

  const onFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  /** "Change photo" skips the drop zone, so it repeats the drop zone's checks. */
  const onChangeInput = (file: File | undefined) => {
    if (!file) return;
    if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      setDecodeError('validation.unsupported_file_type');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setDecodeError('validation.file_too_large');
      return;
    }
    void loadFile(file);
  };

  useEffect(() => () => decoded?.release(), [decoded]);

  // Working canvas: rotation and flip are baked in here, so the crop box, the preview and the
  // output all see the photo the right way up.
  useEffect(() => {
    if (!decoded) {
      setWorking(null);
      return;
    }
    const rotated = renderImage(decoded, { rotate: quarterTurns * 90, flipHorizontal: flip });
    const longEdge = Math.max(rotated.width, rotated.height);
    const scale = longEdge > MAX_WORKING_EDGE ? MAX_WORKING_EDGE / longEdge : 1;
    setWorking(
      scale === 1
        ? rotated
        : renderImage(canvasAsSource(rotated), {
            width: Math.round(rotated.width * scale),
            height: Math.round(rotated.height * scale),
          }),
    );
  }, [decoded, quarterTurns, flip]);

  useEffect(() => {
    if (!working) return;
    setCrop(centredCropForAspect({ width: working.width, height: working.height }, aspect));
  }, [working, aspect]);

  /** Trims a uniform border, then keeps the photo's aspect inside what is left. */
  const autoTrim = useCallback(() => {
    if (!working) return;
    const rect = findTrimRect(working, { padding: Math.round(working.width * 0.01) });
    if (!rect) return;
    const fitted = centredCropForAspect({ width: rect.width, height: rect.height }, aspect);
    setCrop({ ...fitted, x: rect.x + fitted.x, y: rect.y + fitted.y });
  }, [working, aspect]);

  // A small render of the framed photo for the preview tiles. Stays on this machine: it is a
  // data URL in the page, never uploaded.
  const thumbnail = useMemo(() => {
    if (!working) return null;
    const width = 240;
    return renderImage(canvasAsSource(working), {
      crop,
      width,
      height: Math.round(width / aspect),
    }).toDataURL('image/jpeg', 0.85);
  }, [working, crop, aspect]);

  const photoSrc = thumbnail ?? SAMPLE_PHOTO_SRC;

  // ---------------------------------------------------------------------------
  // Sheet render
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!working || layout.placed === 0) {
      setOutput(null);
      return;
    }

    const token = ++renderToken.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        // Each cell gets the photo at exactly its upright pixel size, so the resampling happens
        // once here rather than once per cell inside the compositor. A turned grid's cells are
        // the photo on its side; the compositor does the quarter turn.
        const cell = layout.cells[0];
        const photoWidthPx = (layout.turned ? cell?.height : cell?.width) ?? 0;
        const photoHeightPx = (layout.turned ? cell?.width : cell?.height) ?? 0;
        const single = renderImage(canvasAsSource(working), {
          crop,
          width: photoWidthPx,
          height: photoHeightPx,
        });

        const composed = composePhotoSheet(single, layout, { cutMarks });
        // No KB window: a print sheet goes to a printer, not to an upload box, so quality wins.
        const encoded = await encodeToWindow(composed, { mimeType: 'image/jpeg' });
        if (token !== renderToken.current) return;

        const recipe = new RecipeBuilder('passport_grid', null)
          .addIf(quarterTurns % 4 !== 0, 'rotate', {
            degrees: (((quarterTurns * 90) % 360) + 360) % 360,
          })
          .addIf(flip, 'convert', { flipHorizontal: true })
          .add('crop', { width: Math.round(crop.width), height: Math.round(crop.height) })
          .add('resize', { width: photoWidthPx, height: photoHeightPx, dpi })
          .add('sheet_layout', {
            sheet: sheet.code,
            photos: layout.placed,
            columns: layout.columns,
            gapMm,
            marginMm,
            cutMarks,
            dpi,
          })
          .add('compress', { quality: encoded.quality ?? 1 })
          .build({
            mimeType: encoded.mimeType,
            widthPx: encoded.width,
            heightPx: encoded.height,
            dpi,
            sourceCount: 1,
          });

        const warnings: string[] = [];
        if (layout.dropped > 0) warnings.push('documentTools.warnings.sheetFull');

        setOutput({
          bytes: encoded.bytes,
          mimeType: encoded.mimeType,
          filename: derivativeFilename({
            tool: 'passport_grid',
            presetCode: null,
            mimeType: encoded.mimeType,
            date: today,
          }),
          widthPx: encoded.width,
          heightPx: encoded.height,
          recipe,
          window: {},
          warnings,
        });
      } finally {
        if (token === renderToken.current) setRendering(false);
      }
    }, RENDER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    working,
    crop,
    layout,
    cutMarks,
    sheet.code,
    gapMm,
    marginMm,
    dpi,
    quarterTurns,
    flip,
    today,
  ]);

  const toolbarButton =
    'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-[auto_auto_1fr]">
      {header ? <div className="min-w-0 xl:col-start-1 xl:row-start-1">{header}</div> : null}

      <section className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-start-1 xl:row-start-2">
        {decoded ? (
          <CropStage
            canvas={working}
            crop={crop}
            onCropChange={setCrop}
            aspect={aspect}
            maxHeight={360}
          />
        ) : (
          <FileDrop
            variant="hero"
            onFiles={onFiles}
            accept={ACCEPTED_TYPES}
            label={t('documentTools.grid.choose')}
            hint={t('documentTools.grid.uploadHint')}
            buttonLabel={t('documentTools.studio.uploadPhoto')}
          />
        )}
        {decodeError ? <Alert tone="danger">{t(decodeError)}</Alert> : null}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:col-start-1 xl:row-start-3 xl:self-start">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"
            >
              <Eye className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                {t('documentTools.grid.preview')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t('documentTools.grid.previewHint')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {decoded ? null : (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                {t('documentTools.grid.sample')}
              </span>
            )}
            <p className="text-[11px] tabular-nums text-slate-500">
              {t('documentTools.grid.placed', {
                placed: layout.placed,
                capacity: layout.capacity,
              })}
            </p>
          </div>
        </header>

        <div className="mt-4 flex justify-center rounded-xl bg-slate-50 px-4 py-6">
          <SheetPreview layout={layout} photoSrc={photoSrc} cutMarks={cutMarks} />
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={toolbarButton}
            disabled={!decoded}
            onClick={() => setQuarterTurns((n) => n - 1)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('documentTools.transform.rotateLeft')}
          </button>
          <button
            type="button"
            className={toolbarButton}
            disabled={!decoded}
            onClick={() => setQuarterTurns((n) => n + 1)}
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            {t('documentTools.transform.rotateRight')}
          </button>
          <button
            type="button"
            className={toolbarButton}
            disabled={!decoded}
            aria-pressed={flip}
            onClick={() => setFlip((value) => !value)}
          >
            <FlipHorizontal2 className="h-4 w-4" aria-hidden />
            {t('documentTools.transform.flip')}
          </button>
          <button type="button" className={toolbarButton} disabled={!decoded} onClick={autoTrim}>
            <Crop className="h-4 w-4" aria-hidden />
            {t('documentTools.transform.autoTrim')}
          </button>
          <button
            type="button"
            className={toolbarButton}
            onClick={() => changeInput.current?.click()}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t('documentTools.grid.changePhoto')}
          </button>
          <input
            ref={changeInput}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              onChangeInput(event.target.files?.[0]);
              // Reset so choosing the same file twice still fires a change event.
              event.target.value = '';
            }}
          />
        </div>
      </section>

      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-3 xl:row-start-1">
        <ToolSection
          step={1}
          icon={FileText}
          title={t('documentTools.grid.paper')}
          hint={t('documentTools.grid.paperHint')}
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PRINT_SHEETS.map((option, index) => {
              const label =
                locale === 'hi'
                  ? (option.shortLabelHi ?? option.labelHi ?? option.label)
                  : (option.shortLabel ?? option.label);
              const spansRow = index >= PAPER_COLUMNS;
              return (
                <OptionTile
                  key={option.code}
                  selected={option.code === sheetCode}
                  onSelect={() => setSheetCode(option.code)}
                  label={label}
                  sub={`${option.widthMm} × ${option.heightMm} mm`}
                  className={spansRow ? 'col-span-full items-start text-left' : undefined}
                />
              );
            })}
          </div>
        </ToolSection>

        <ToolSection
          step={2}
          icon={ScanFace}
          title={t('documentTools.grid.photoSize')}
          hint={t('documentTools.grid.photoSizeHint')}
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {SIZE_TILES.map((tile) => {
              const size = PHOTO_SIZES.find((entry) => entry.code === tile.code)!;
              return (
                <OptionTile
                  key={tile.code}
                  selected={sizeCode === tile.code}
                  onSelect={() => setSizeCode(tile.code)}
                  label={t(tile.labelKey)}
                  sub={t('documentTools.grid.cm', {
                    width: formatCm(size.widthMm),
                    height: formatCm(size.heightMm),
                  })}
                />
              );
            })}
            <OptionTile
              selected={sizeCode === 'custom'}
              onSelect={() => setSizeCode('custom')}
              label={t('documentTools.grid.sizeCustom')}
              sub={t('documentTools.grid.sizeCustomHint')}
            />
          </div>

          {sizeCode === 'custom' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label={t('documentTools.rule.width')}
                unit="mm"
                min={5}
                step={0.5}
                value={customWidthMm}
                onValueChange={setCustomWidthMm}
              />
              <NumberField
                label={t('documentTools.rule.height')}
                unit="mm"
                min={5}
                step={0.5}
                value={customHeightMm}
                onValueChange={setCustomHeightMm}
              />
            </div>
          ) : null}

          <PhotoDimensions widthMm={photo.widthMm} heightMm={photo.heightMm} photoSrc={photoSrc} />
        </ToolSection>

        <ToolSection
          step={3}
          icon={LayoutGrid}
          title={t('documentTools.grid.howMany')}
          hint={t('documentTools.grid.howManyHint', { capacity: layout.capacity })}
        >
          {layout.capacity === 0 ? (
            <Alert tone="warning">{t('documentTools.grid.tooBig')}</Alert>
          ) : (
            <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] gap-1.5">
              {COUNT_OPTIONS.map((option) => {
                const fits = option <= layout.capacity;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCount(option)}
                    disabled={!fits}
                    title={
                      fits
                        ? undefined
                        : t('documentTools.grid.countTooMany', { capacity: layout.capacity })
                    }
                    aria-pressed={count === option}
                    className={cn(
                      countButton,
                      count === option ? countSelected : countIdle,
                      'tabular-nums',
                    )}
                  >
                    {option}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCount(null)}
                aria-pressed={count === null}
                className={cn(countButton, 'px-3', count === null ? countSelected : countIdle)}
              >
                {t('documentTools.grid.fill')}
              </button>
            </div>
          )}
        </ToolSection>

        <ToolSection step={4} icon={Settings} title={t('documentTools.grid.printing')}>
          <Slider
            label={t('documentTools.grid.gap')}
            min={0}
            max={10}
            step={0.5}
            defaultValue={DEFAULT_GAP_MM}
            value={gapMm}
            valueLabel={`${gapMm} mm`}
            onValueChange={setGapMm}
          />
          <Slider
            label={t('documentTools.grid.margin')}
            min={0}
            max={15}
            step={0.5}
            defaultValue={DEFAULT_MARGIN_MM}
            value={marginMm}
            valueLabel={`${marginMm} mm`}
            onValueChange={setMarginMm}
          />
          <Slider
            label={t('documentTools.rule.dpi')}
            min={150}
            max={600}
            step={50}
            defaultValue={DEFAULT_PRINT_DPI}
            value={dpi}
            valueLabel={`${dpi} dpi`}
            onValueChange={setDpi}
          />
          <Switch
            label={t('documentTools.grid.cutMarks')}
            hint={t('documentTools.grid.cutMarksHint')}
            checked={cutMarks}
            onCheckedChange={setCutMarks}
          />
        </ToolSection>

        <OutputPanel
          step={5}
          icon={Download}
          hint={t('documentTools.grid.resultHint')}
          output={output}
          busy={rendering && output === null}
          customers={customers}
          defaultCustomerId={defaultCustomerId}
          showDownload={false}
          footer={
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <button
                type="button"
                disabled={!output}
                onClick={() => {
                  if (output) downloadBytes(output.bytes, output.filename, output.mimeType);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-brand-600/50"
              >
                <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                {t('documentTools.grid.downloadSheet')}
              </button>
              <button
                type="button"
                disabled={!output}
                onClick={() => {
                  if (output) printImage(output.bytes, output.mimeType, output.filename);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-600 bg-white px-3 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t('documentTools.output.print')}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}

const countButton =
  'rounded-lg border py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const countSelected = 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500';
const countIdle = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300';

/** A two-line choice card: a name and the numbers behind it. */
function OptionTile({
  selected,
  onSelect,
  label,
  sub,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  sub: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-w-0 flex-col items-center rounded-lg border px-1.5 py-2 text-center transition-colors',
        selected
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
          : 'border-slate-200 bg-white hover:border-slate-300',
        className,
      )}
    >
      <span
        className={cn(
          'text-sm font-medium',
          selected ? 'text-brand-800' : 'text-slate-900',
        )}
      >
        {label}
      </span>
      <span className="mt-0.5 text-[10px] leading-tight tabular-nums tracking-tight text-slate-500">
        {sub}
      </span>
    </button>
  );
}

/** The chosen size in words and as a dimensioned photo, so "35 × 45" has a shape. */
function PhotoDimensions({
  widthMm,
  heightMm,
  photoSrc,
}: {
  widthMm: number;
  heightMm: number;
  photoSrc: string;
}) {
  const t = useTranslations();
  const boxHeight = 96;
  const boxWidth = Math.round(Math.min(150, boxHeight * (widthMm / heightMm)));

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{t('documentTools.grid.dimensions')}</p>
        <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">
          {widthMm} × {heightMm} mm
        </p>
        <p className="text-xs tabular-nums text-slate-500">
          ({t('documentTools.grid.cm', { width: formatCm(widthMm), height: formatCm(heightMm) })})
        </p>
      </div>
      <div aria-hidden className="flex shrink-0 items-end gap-1.5 pr-1">
        <div style={{ width: boxWidth }}>
          <p className="text-center text-[10px] tabular-nums text-slate-500">{widthMm} mm</p>
          <div className="mb-1 h-1.5 border-x border-t border-slate-400" />
          {/* A data URL or a small static sample; next/image would try to optimise it on the server. */}
          <img
            src={photoSrc}
            alt=""
            className="block rounded-sm bg-white object-cover shadow-sm ring-1 ring-slate-200"
            style={{ width: boxWidth, height: boxHeight }}
          />
        </div>
        <div className="flex items-center gap-1" style={{ height: boxHeight }}>
          <div className="h-full w-1.5 border-y border-r border-slate-400" />
          <p className="whitespace-nowrap text-[10px] tabular-nums text-slate-500">
            {heightMm} mm
          </p>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_MAX_HEIGHT = 340;

/**
 * The sheet as it will print, drawn with the framed photo in every slot.
 *
 * Built from the layout, not from the composed JPEG, so it follows every slider without waiting
 * on the debounced render. A turned grid is shown turned back, faces upright, because that is how
 * the operator will hold the sheet to cut it.
 */
function SheetPreview({
  layout,
  photoSrc,
  cutMarks,
}: {
  layout: SheetLayout;
  photoSrc: string;
  cutMarks: boolean;
}) {
  // Turning the sheet a quarter turn anticlockwise undoes the compositor's clockwise turn.
  const width = layout.turned ? layout.sheetHeightPx : layout.sheetWidthPx;
  const height = layout.turned ? layout.sheetWidthPx : layout.sheetHeightPx;
  const cells: Rect[] = layout.turned
    ? layout.cells.map((cell) => ({
        x: cell.y,
        y: layout.sheetWidthPx - cell.x - cell.width,
        width: cell.height,
        height: cell.width,
      }))
    : layout.cells;
  const aspect = width / height;
  const tick = Math.round(layout.dpi * CUT_MARK_INCH);

  const corner = 'pointer-events-none absolute h-4 w-4 border-slate-700';

  return (
    <div
      className="relative"
      style={{
        aspectRatio: `${aspect}`,
        width: `min(100%, ${Math.round(PREVIEW_MAX_HEIGHT * aspect)}px)`,
      }}
    >
      <div className="absolute inset-0 bg-white shadow-sm ring-1 ring-slate-200">
        {cells.map((cell, index) => (
          // A data URL or a small static sample; next/image would try to optimise it on the server.
          <img
            key={index}
            src={photoSrc}
            alt=""
            className="absolute object-cover"
            style={{
              left: `${(cell.x / width) * 100}%`,
              top: `${(cell.y / height) * 100}%`,
              width: `${(cell.width / width) * 100}%`,
              height: `${(cell.height / height) * 100}%`,
            }}
          />
        ))}
        {cutMarks ? (
          <svg
            aria-hidden
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full text-slate-500"
          >
            {cells.flatMap((cell, index) =>
              cutMarksForCell(cell, tick).map(([x1, y1, x2, y2], mark) => (
                <line
                  key={`${index}-${mark}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}
          </svg>
        ) : null}
      </div>
      <span aria-hidden className={cn(corner, '-left-2 -top-2 border-l-2 border-t-2')} />
      <span aria-hidden className={cn(corner, '-right-2 -top-2 border-r-2 border-t-2')} />
      <span aria-hidden className={cn(corner, '-bottom-2 -left-2 border-b-2 border-l-2')} />
      <span aria-hidden className={cn(corner, '-bottom-2 -right-2 border-b-2 border-r-2')} />
    </div>
  );
}
