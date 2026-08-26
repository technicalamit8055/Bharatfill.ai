'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, NumberField, SegmentedControl, Slider, Switch, cn } from '@assistigo/ui';
import {
  DEFAULT_GAP_MM,
  DEFAULT_MARGIN_MM,
  DEFAULT_PRINT_DPI,
  PRINT_SHEETS,
  RecipeBuilder,
  centredCropForAspect,
  derivativeFilename,
  findSheet,
  planPhotoSheet,
  suggestedCounts,
  type Rect,
} from '@assistigo/document-tools';
import {
  canvasAsSource,
  composePhotoSheet,
  decodeImage,
  encodeToWindow,
  renderImage,
  type DecodedImage,
} from '@assistigo/document-tools/browser/image';
import { useI18n, useTranslations } from '@/lib/i18n/client';
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

/** Sizes a customer asks for by name. Millimetres, because the printer works in millimetres. */
const PHOTO_SIZES = [
  { code: 'passport', widthMm: 35, heightMm: 45 },
  { code: 'stamp', widthMm: 20, heightMm: 25 },
  { code: 'postcard', widthMm: 101.6, heightMm: 152.4 },
  { code: 'square', widthMm: 35, heightMm: 35 },
] as const;

type PhotoSizeCode = (typeof PHOTO_SIZES)[number]['code'] | 'custom';

export function PassportGridEditor({
  customers,
  defaultCustomerId,
  today,
}: {
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

  const [sheetCode, setSheetCode] = useState('4x6');
  const [sizeCode, setSizeCode] = useState<PhotoSizeCode>('passport');
  const [customWidthMm, setCustomWidthMm] = useState<number | ''>(35);
  const [customHeightMm, setCustomHeightMm] = useState<number | ''>(45);
  const [count, setCount] = useState<number | null>(8);
  const [gapMm, setGapMm] = useState(DEFAULT_GAP_MM);
  const [marginMm, setMarginMm] = useState(DEFAULT_MARGIN_MM);
  const [cutMarks, setCutMarks] = useState(true);
  const [dpi, setDpi] = useState(DEFAULT_PRINT_DPI);

  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);

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

  const onFiles = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setDecodeError(null);
    try {
      const image = await decodeImage(file);
      setDecoded((previous) => {
        previous?.release();
        return image;
      });
    } catch {
      setDecodeError('documentTools.errors.decodeFailed');
    }
  }, []);

  useEffect(() => () => decoded?.release(), [decoded]);

  useEffect(() => {
    if (!decoded) {
      setWorking(null);
      return;
    }
    const longEdge = Math.max(decoded.width, decoded.height);
    const scale = longEdge > MAX_WORKING_EDGE ? MAX_WORKING_EDGE / longEdge : 1;
    setWorking(
      renderImage(decoded, {
        width: Math.round(decoded.width * scale),
        height: Math.round(decoded.height * scale),
      }),
    );
  }, [decoded]);

  useEffect(() => {
    if (!working) return;
    setCrop(centredCropForAspect({ width: working.width, height: working.height }, aspect));
  }, [working, aspect]);

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
        // Each cell gets the photo at exactly the cell's pixel size, so the resampling happens
        // once here rather than once per cell inside the compositor.
        const cell = layout.cells[0];
        const single = renderImage(canvasAsSource(working), {
          crop,
          width: cell?.width,
          height: cell?.height,
        });

        const composed = composePhotoSheet(single, layout, { cutMarks });
        // No KB window: a print sheet goes to a printer, not to an upload box, so quality wins.
        const encoded = await encodeToWindow(composed, { mimeType: 'image/jpeg' });
        if (token !== renderToken.current) return;

        const recipe = new RecipeBuilder('passport_grid', null)
          .add('crop', { width: Math.round(crop.width), height: Math.round(crop.height) })
          .add('resize', { width: cell?.width ?? 0, height: cell?.height ?? 0, dpi })
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
  }, [working, crop, layout, cutMarks, sheet.code, gapMm, marginMm, dpi, today]);

  const counts = suggestedCounts(layout.capacity);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        {decoded ? (
          <>
            <CropStage canvas={working} crop={crop} onCropChange={setCrop} aspect={aspect} />
            <SheetPreview layout={layout} />
          </>
        ) : (
          <FileDrop
            onFiles={onFiles}
            accept={['image/jpeg', 'image/png', 'image/webp']}
            label={t('documentTools.grid.choose')}
            hint={t('documentTools.grid.chooseHint')}
          />
        )}

        {decodeError ? <Alert tone="danger">{t(decodeError)}</Alert> : null}

        {decoded ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              decoded.release();
              setDecoded(null);
              setOutput(null);
            }}
          >
            {t('documentTools.transform.changeFile')}
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <ToolSection title={t('documentTools.grid.paper')}>
          <div className="grid gap-1.5">
            {PRINT_SHEETS.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => setSheetCode(option.code)}
                aria-pressed={option.code === sheetCode}
                className={cn(
                  'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                  option.code === sheetCode
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span className="text-slate-900">
                  {locale === 'hi' && option.labelHi ? option.labelHi : option.label}
                </span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {option.widthMm} × {option.heightMm} mm
                </span>
              </button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title={t('documentTools.grid.photoSize')}>
          <SegmentedControl
            ariaLabel={t('documentTools.grid.photoSize')}
            size="sm"
            value={sizeCode}
            onValueChange={(value) => setSizeCode(value as PhotoSizeCode)}
            options={[
              { value: 'passport', label: t('documentTools.grid.sizePassport') },
              { value: 'stamp', label: t('documentTools.grid.sizeStamp') },
              { value: 'square', label: t('documentTools.grid.sizeSquare') },
              { value: 'custom', label: t('documentTools.grid.sizeCustom') },
            ]}
            className="w-full"
          />
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
          ) : (
            <p className="text-[11px] tabular-nums text-slate-500">
              {photo.widthMm} × {photo.heightMm} mm
            </p>
          )}
        </ToolSection>

        <ToolSection
          title={t('documentTools.grid.howMany')}
          hint={t('documentTools.grid.howManyHint', { capacity: layout.capacity })}
        >
          {layout.capacity === 0 ? (
            <Alert tone="warning">{t('documentTools.grid.tooBig')}</Alert>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {counts.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  aria-pressed={count === option}
                  className={cn(
                    'min-w-9 rounded-md border px-2 py-1 text-sm font-medium tabular-nums transition-colors',
                    count === option
                      ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  )}
                >
                  {option}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCount(null)}
                aria-pressed={count === null}
                className={cn(
                  'rounded-md border px-2 py-1 text-sm font-medium transition-colors',
                  count === null
                    ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                {t('documentTools.grid.fill')}
              </button>
            </div>
          )}
        </ToolSection>

        <ToolSection title={t('documentTools.grid.printing')}>
          <Slider
            label={t('documentTools.grid.gap')}
            min={0}
            max={10}
            step={0.5}
            defaultValue={DEFAULT_GAP_MM}
            value={gapMm}
            valueLabel={`${gapMm} mm`}
            hint={t('documentTools.grid.gapHint')}
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
            hint={t('documentTools.grid.marginHint')}
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
          output={output}
          busy={rendering && output === null}
          customers={customers}
          defaultCustomerId={defaultCustomerId}
          printable
        />
      </div>
    </div>
  );
}

/**
 * A scaled diagram of the sheet.
 *
 * Deliberately schematic rather than a live render of the composed JPEG: the operator's question
 * here is "how will this be cut", and a wireframe answers it at a glance while a photographic
 * preview of sixteen identical faces does not. The real output is in the panel below.
 */
function SheetPreview({ layout }: { layout: ReturnType<typeof planPhotoSheet> }) {
  const t = useTranslations();
  const aspect = layout.sheetWidthPx / layout.sheetHeightPx;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('documentTools.grid.preview')}
        </p>
        <p className="text-[11px] tabular-nums text-slate-500">
          {t('documentTools.grid.placed', { placed: layout.placed, capacity: layout.capacity })}
        </p>
      </div>
      <div
        className="relative mx-auto w-full max-w-[260px] rounded border border-slate-300 bg-slate-50"
        style={{ aspectRatio: `${aspect}` }}
      >
        {layout.cells.map((cell, index) => (
          <div
            key={index}
            className="absolute rounded-[1px] border border-dashed border-brand-500/70 bg-brand-500/15"
            style={{
              left: `${(cell.x / layout.sheetWidthPx) * 100}%`,
              top: `${(cell.y / layout.sheetHeightPx) * 100}%`,
              width: `${(cell.width / layout.sheetWidthPx) * 100}%`,
              height: `${(cell.height / layout.sheetHeightPx) * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
