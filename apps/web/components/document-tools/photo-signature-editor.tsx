'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  CircleCheck,
  Crop,
  FileDigit,
  FileImage,
  FlipHorizontal2,
  ImageDown,
  LayoutGrid,
  MoveDiagonal,
  MoveDiagonal2,
  RotateCcw,
  RotateCw,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Button, NumberField, Slider, Switch, cn } from '@assistigo/ui';
import {
  DEFAULT_DPI,
  MAX_DERIVATIVE_BYTES,
  RecipeBuilder,
  centredCropForAspect,
  derivativeFilename,
  findPreset,
  formatSizeWindow,
  mmToPx,
  presetAspectRatio,
  presetTargetSize,
  pxToMm,
  type OutputMimeType,
  type Rect,
  type RequirementPreset,
} from '@assistigo/document-tools';
import {
  applyCleanSignature,
  applyEnhance,
  canvasAsSource,
  decodeImage,
  drawNameDateStamp,
  encodeToWindow,
  findTrimRect,
  renderImage,
  type DecodedImage,
} from '@assistigo/document-tools/browser/image';
import { downloadBytes } from '@/lib/document-tools/save';
import {
  EXAMPLE_TAB_KEYS,
  STUDIO_CHECKLIST_KEYS,
  STUDIO_EXAMPLES,
  STUDIO_FEATURES,
  type ExampleKind,
  type ExampleStage,
  type StudioFeatureId,
} from '@/lib/document-tools/studio';
import { useTranslations } from '@/lib/i18n/client';
import { CropStage } from './crop-stage';
import { FileDrop } from './file-drop';
import { OutputPanel, type CustomerOption, type ToolOutput } from './output-panel';
import { PresetNotes, PresetPicker } from './preset-picker';
import { StageBackdrop, ToolSection } from './tool-shell';

/**
 * Photo and signature preparation.
 * Master spec §13.2 — the photo tool and the signature tool, which share every control except
 * background cleanup, so they share one editor with a mode switch.
 *
 * The pipeline is two canvases, and the split is what keeps the editor responsive:
 *
 *   source ──straighten, flip, adjust, clean──▶ working canvas ──crop, resize, stamp──▶ output
 *
 * The working canvas is rebuilt only when a pixel-level setting changes. Dragging the crop box
 * touches neither it nor the pixel operations, so the drag stays at pointer speed on the kind of
 * desktop a service centre actually has.
 */

/**
 * Ceiling on the working canvas's long edge.
 *
 * No portal preset in the catalogue asks for more than 1000 px, and a 3.5 × 4.5 cm print at
 * 300 DPI is 414 × 532. A 12 MP phone photo held at native size would make every histogram pass
 * read 48 MB of pixels per slider movement for detail that is discarded at the end anyway.
 */
const MAX_WORKING_EDGE = 2400;

/** How long the editor waits after the last change before re-encoding. */
const RENDER_DEBOUNCE_MS = 180;

type Mode = 'photo' | 'signature';

type Adjustments = {
  brightness: number;
  contrast: number;
  clarity: number;
  grayscale: boolean;
};

const NEUTRAL: Adjustments = { brightness: 0, contrast: 0, clarity: 0, grayscale: false };

export function PhotoSignatureEditor({
  customers,
  defaultCustomerId,
  defaultPresetCode,
  defaultMode = 'photo',
  sourceDocumentId,
  today,
  header,
}: {
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
  defaultPresetCode?: string | null;
  defaultMode?: Mode;
  sourceDocumentId?: string | null;
  /** ISO date, resolved on the server so the filename and the stamp agree with the audit row. */
  today: string;
  /**
   * The page's title block. Rendered inside the editor's grid so the settings rail can start
   * level with the title on a wide screen, instead of below it.
   */
  header?: ReactNode;
}) {
  const t = useTranslations();

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [exampleKind, setExampleKind] = useState<ExampleKind>(defaultMode);
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [preset, setPreset] = useState<RequirementPreset | null>(
    defaultPresetCode ? findPreset(defaultPresetCode) : null,
  );

  // Custom rule, used when no preset is selected and as the editable copy of a preset's numbers.
  const [outputMime, setOutputMime] = useState<OutputMimeType>('image/jpeg');
  const [targetWidthMm, setTargetWidthMm] = useState<number | ''>(35);
  const [targetHeightMm, setTargetHeightMm] = useState<number | ''>(45);
  const [dpi, setDpi] = useState<number | ''>(DEFAULT_DPI);
  const [minKb, setMinKb] = useState<number | ''>('');
  const [maxKb, setMaxKb] = useState<number | ''>('');
  const [lockAspect, setLockAspect] = useState(true);

  const [quarterTurns, setQuarterTurns] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [flip, setFlip] = useState(false);
  const [adjust, setAdjust] = useState<Adjustments>(NEUTRAL);

  const [cleanBackground, setCleanBackground] = useState(false);
  const [cleanStrength, setCleanStrength] = useState(0);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [keepInkColour, setKeepInkColour] = useState(false);

  const [stampEnabled, setStampEnabled] = useState(false);
  const [stampName, setStampName] = useState('');
  const [stampDate, setStampDate] = useState(today.slice(0, 10));

  const [working, setWorking] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);

  /** Guards against an older async render overwriting a newer one. */
  const renderToken = useRef(0);

  // ---------------------------------------------------------------------------
  // Rule resolution — a preset fills the editable fields; nothing is read-only
  // ---------------------------------------------------------------------------

  const applyPreset = useCallback(
    (next: RequirementPreset | null) => {
      setPreset(next);
      if (!next) return;

      setOutputMime(next.outputMime === 'application/pdf' ? 'image/jpeg' : next.outputMime);
      setMinKb(next.minBytes ? Math.round(next.minBytes / 1024) : '');
      setMaxKb(next.maxBytes ? Math.round(next.maxBytes / 1024) : '');
      setDpi(next.dpi ?? DEFAULT_DPI);
      setStampEnabled(Boolean(next.requiresNameDateStamp));

      const size = presetTargetSize(next);
      if (size) {
        const resolution = next.dpi ?? DEFAULT_DPI;
        setTargetWidthMm(Number(pxToMm(size.width, resolution).toFixed(2)));
        setTargetHeightMm(Number(pxToMm(size.height, resolution).toFixed(2)));
      }
      setLockAspect(true);
      if (next.category === 'signature' || next.category === 'photo') {
        setMode(next.category);
        setExampleKind(next.category);
      }
    },
    [],
  );

  /** The pixel size the output is rendered at, or null to keep the crop's own size. */
  const targetSize = useMemo(() => {
    const resolution = typeof dpi === 'number' && dpi > 0 ? dpi : DEFAULT_DPI;
    if (typeof targetWidthMm === 'number' && typeof targetHeightMm === 'number') {
      return {
        width: mmToPx(targetWidthMm, resolution),
        height: mmToPx(targetHeightMm, resolution),
      };
    }
    return null;
  }, [targetWidthMm, targetHeightMm, dpi]);

  const aspect = useMemo(() => {
    if (!lockAspect) return null;
    if (targetSize) return targetSize.width / targetSize.height;
    return preset ? presetAspectRatio(preset) : null;
  }, [lockAspect, targetSize, preset]);

  const sizeWindow = useMemo(
    () => ({
      ...(typeof minKb === 'number' && minKb > 0 ? { minBytes: minKb * 1024 } : {}),
      ...(typeof maxKb === 'number' && maxKb > 0 ? { maxBytes: maxKb * 1024 } : {}),
    }),
    [minKb, maxKb],
  );

  // ---------------------------------------------------------------------------
  // Source
  // ---------------------------------------------------------------------------

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setDecodeError(null);
      try {
        const image = await decodeImage(file);
        setDecoded((previous) => {
          previous?.release();
          return image;
        });
        setQuarterTurns(0);
        setStraighten(0);
        setFlip(false);
        setAdjust(NEUTRAL);
      } catch {
        setDecodeError('documentTools.errors.decodeFailed');
      }
    },
    [],
  );

  useEffect(() => () => decoded?.release(), [decoded]);

  // ---------------------------------------------------------------------------
  // Working canvas — rebuilt only on pixel-level changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!decoded) {
      setWorking(null);
      return;
    }

    const longEdge = Math.max(decoded.width, decoded.height);
    const scale = longEdge > MAX_WORKING_EDGE ? MAX_WORKING_EDGE / longEdge : 1;
    const background = transparentBackground && mode === 'signature' ? null : '#ffffff';

    // `renderImage` sizes the canvas to the rotated bounding box when width and height are
    // omitted, so the straighten angle is applied here and the working-edge cap afterwards.
    const rotated = renderImage(decoded, {
      rotate: quarterTurns * 90 + straighten,
      flipHorizontal: flip,
      background,
    });

    const scaled =
      scale === 1
        ? rotated
        : renderImage(canvasAsSource(rotated), {
            width: Math.round(rotated.width * scale),
            height: Math.round(rotated.height * scale),
            background,
          });

    if (
      adjust.brightness !== 0 ||
      adjust.contrast !== 0 ||
      adjust.clarity !== 0 ||
      adjust.grayscale
    ) {
      applyEnhance(scaled, adjust);
    }

    if (mode === 'signature' && cleanBackground) {
      applyCleanSignature(scaled, {
        strength: cleanStrength,
        background: transparentBackground ? 'transparent' : 'white',
        keepInkColour,
      });
    }

    setWorking(scaled);
  }, [
    decoded,
    quarterTurns,
    straighten,
    flip,
    adjust,
    mode,
    cleanBackground,
    cleanStrength,
    transparentBackground,
    keepInkColour,
  ]);

  // A new working canvas invalidates the crop, so it is re-framed to the current aspect. Keeping
  // stale pixel coordinates after a quarter turn would put the box outside the image.
  useEffect(() => {
    if (!working) return;
    const bounds = { width: working.width, height: working.height };
    setCrop(
      aspect
        ? centredCropForAspect(bounds, aspect)
        : { x: 0, y: 0, width: bounds.width, height: bounds.height },
    );
  }, [working, aspect]);

  const autoTrim = useCallback(() => {
    if (!working) return;
    const rect = findTrimRect(working, { padding: Math.round(working.width * 0.01) });
    if (rect) setCrop(rect);
  }, [working]);

  // ---------------------------------------------------------------------------
  // Output — debounced, because every control feeds it
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!working) {
      setOutput(null);
      return;
    }

    const token = ++renderToken.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        const transparent = mode === 'signature' && transparentBackground;
        const mime: OutputMimeType = transparent ? 'image/png' : outputMime;

        const canvas = renderImage(canvasAsSource(working), {
          crop,
          width: targetSize?.width,
          height: targetSize?.height,
          background: transparent ? null : '#ffffff',
        });

        const stamped = stampEnabled && (stampName.trim() !== '' || stampDate.trim() !== '');
        if (stamped) drawNameDateStamp(canvas, { name: stampName, date: stampDate });

        const encoded = await encodeToWindow(canvas, { mimeType: mime, ...sizeWindow });
        if (token !== renderToken.current) return;

        const recipe = new RecipeBuilder(
          'photo_signature',
          preset?.code ?? null,
        )
          .addIf(quarterTurns !== 0, 'rotate', { degrees: ((quarterTurns * 90) % 360 + 360) % 360 })
          .addIf(straighten !== 0, 'straighten', { degrees: Number(straighten.toFixed(1)) })
          .addIf(flip, 'convert', { flipHorizontal: true })
          .addIf(
            adjust.brightness !== 0 || adjust.contrast !== 0 || adjust.clarity !== 0,
            'enhance',
            {
              brightness: adjust.brightness,
              contrast: adjust.contrast,
              clarity: adjust.clarity,
            },
          )
          .addIf(adjust.grayscale, 'grayscale')
          .addIf(mode === 'signature' && cleanBackground, 'flatten_background', {
            strength: cleanStrength,
            transparent: transparentBackground,
          })
          .add('crop', { width: Math.round(crop.width), height: Math.round(crop.height) })
          .addIf(Boolean(targetSize), 'resize', {
            width: encoded.width,
            height: encoded.height,
            dpi: typeof dpi === 'number' ? dpi : DEFAULT_DPI,
          })
          // The name and the date themselves are customer data and are deliberately not recorded.
          .addIf(stamped, 'name_date_stamp', { stamped: true, position: 'bottom' })
          .addIf(encoded.quality !== null, 'compress', {
            quality: encoded.quality ?? 1,
            scale: encoded.scale,
          })
          .addIf(encoded.padded, 'pad_to_minimum', { bytes: encoded.bytes.byteLength })
          .build({
            mimeType: encoded.mimeType,
            widthPx: encoded.width,
            heightPx: encoded.height,
            dpi: typeof dpi === 'number' ? dpi : null,
            sourceCount: 1,
          });

        const warnings: string[] = [];
        if (encoded.overLimit) warnings.push('documentTools.warnings.overLimit');
        if (encoded.padded) warnings.push('documentTools.warnings.padded');
        if (encoded.scale < 1) warnings.push('documentTools.warnings.downscaled');
        if (encoded.bytes.byteLength > MAX_DERIVATIVE_BYTES) {
          warnings.push('documentTools.warnings.tooLargeToSave');
        }

        setOutput({
          bytes: encoded.bytes,
          mimeType: encoded.mimeType,
          filename: derivativeFilename({
            tool: 'photo_signature',
            presetCode: preset?.code ?? null,
            mimeType: encoded.mimeType,
            date: today,
          }),
          widthPx: encoded.width,
          heightPx: encoded.height,
          recipe,
          window: sizeWindow,
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
    targetSize,
    outputMime,
    sizeWindow,
    stampEnabled,
    stampName,
    stampDate,
    mode,
    transparentBackground,
    cleanBackground,
    cleanStrength,
    adjust,
    flip,
    quarterTurns,
    straighten,
    preset,
    dpi,
    today,
  ]);

  const presetWindowLabel = formatSizeWindow(sizeWindow);

  /** Switching the kind of file also switches the worked examples to match. */
  const chooseMode = (next: Mode) => {
    setMode(next);
    setExampleKind(next);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_auto_1fr]">
      {header ? <div className="min-w-0 xl:col-start-1 xl:row-start-1">{header}</div> : null}

      <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:col-start-1 xl:row-start-2">
        {decoded ? (
          <>
            <CropStage
              canvas={working}
              crop={crop}
              onCropChange={setCrop}
              aspect={aspect}
              transparent={mode === 'signature' && transparentBackground}
              // A passport photo only needs to be big enough to frame a face; anything larger
              // pushes the stamp, result and download below the fold.
              maxHeight={420}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setQuarterTurns((n) => n - 1)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t('documentTools.transform.rotateLeft')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setQuarterTurns((n) => n + 1)}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                {t('documentTools.transform.rotateRight')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFlip((value) => !value)}>
                <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden />
                {t('documentTools.transform.flip')}
              </Button>
              <Button size="sm" variant="ghost" onClick={autoTrim}>
                <Crop className="h-3.5 w-3.5" aria-hidden />
                {t('documentTools.transform.autoTrim')}
              </Button>
              <span className="flex-1" />
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
            </div>
          </>
        ) : (
          <FileDrop
            variant="hero"
            onFiles={onFiles}
            accept={['image/jpeg', 'image/png', 'image/webp']}
            label={
              mode === 'signature'
                ? t('documentTools.studio.chooseSignatureTitle')
                : t('documentTools.studio.chooseTitle')
            }
            hint={t('documentTools.photo.chooseHint')}
            buttonLabel={
              mode === 'signature'
                ? t('documentTools.studio.uploadSignature')
                : t('documentTools.studio.uploadPhoto')
            }
            footer={<FeaturePills />}
          />
        )}

        {decodeError ? <Alert tone="danger">{t(decodeError)}</Alert> : null}

        {/* Worked examples are for the empty state; once a file is in, the stage is the example. */}
        {decoded ? null : <Examples kind={exampleKind} onKindChange={setExampleKind} />}
      </section>

      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-3 xl:row-start-1">
        <ToolSection step={1} title={t('documentTools.photo.mode')}>
          <div className="flex gap-4">
            <div
              role="radiogroup"
              aria-label={t('documentTools.photo.mode')}
              className="flex w-32 shrink-0 flex-col gap-2"
            >
              {(['photo', 'signature'] as const).map((option) => {
                const active = mode === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseMode(option)}
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                      'focus-visible:outline-brand-600',
                      active
                        ? 'bg-brand-100/80 text-brand-700 ring-1 ring-brand-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70',
                    )}
                  >
                    {option === 'photo'
                      ? t('documentTools.photo.modePhoto')
                      : t('documentTools.photo.modeSignature')}
                  </button>
                );
              })}
            </div>
            <ul className="min-w-0 space-y-2 self-center">
              {STUDIO_CHECKLIST_KEYS.map((key) => (
                <li key={key} className="flex items-center gap-2 text-xs text-slate-700">
                  <CircleCheck
                    className="h-4 w-4 shrink-0 fill-emerald-500 text-white"
                    strokeWidth={2.2}
                    aria-hidden
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </ToolSection>

        <ToolSection
          step={2}
          title={t('documentTools.preset.title')}
          hint={t('documentTools.preset.hint')}
        >
          <PresetPicker
            categories={mode === 'signature' ? ['signature'] : ['photo', 'document']}
            value={preset?.code ?? null}
            onChange={applyPreset}
          />
          <PresetNotes preset={preset} />
        </ToolSection>

        <ToolSection step={3} title={t('documentTools.rule.title')} hint={t('documentTools.rule.hint')}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <NumberField
              label={t('documentTools.rule.width')}
              unit="mm"
              min={1}
              step={0.5}
              value={targetWidthMm}
              onValueChange={setTargetWidthMm}
            />
            <NumberField
              label={t('documentTools.rule.height')}
              unit="mm"
              min={1}
              step={0.5}
              value={targetHeightMm}
              onValueChange={setTargetHeightMm}
            />
            <NumberField
              label={t('documentTools.rule.dpi')}
              unit="dpi"
              min={50}
              max={600}
              step={10}
              value={dpi}
              onValueChange={setDpi}
            />
            <div className="flex items-end pb-2">
              <p className="text-xs tabular-nums text-slate-500">
                {targetSize
                  ? `${targetSize.width} × ${targetSize.height} px`
                  : t('documentTools.rule.noSize')}
              </p>
            </div>
            <NumberField
              label={t('documentTools.rule.minKb')}
              unit="KB"
              min={0}
              step={1}
              value={minKb}
              onValueChange={setMinKb}
            />
            <NumberField
              label={t('documentTools.rule.maxKb')}
              unit="KB"
              min={0}
              step={1}
              value={maxKb}
              onValueChange={setMaxKb}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-700">{t('documentTools.rule.format')}</p>
            <div
              role="radiogroup"
              aria-label={t('documentTools.rule.format')}
              className="flex gap-2"
            >
              {(
                [
                  { value: 'image/jpeg', label: 'JPG' },
                  { value: 'image/png', label: 'PNG', title: t('documentTools.rule.pngHint') },
                ] as const
              ).map((option) => {
                const active =
                  (outputMime === 'image/png' ? 'image/png' : 'image/jpeg') === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={'title' in option ? option.title : undefined}
                    onClick={() => setOutputMime(option.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                      'focus-visible:outline-brand-600',
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                    )}
                  >
                    <FileImage
                      className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-slate-400')}
                      aria-hidden
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {outputMime === 'image/png' && presetWindowLabel ? (
              <p className="text-[11px] leading-tight text-amber-700">
                {t('documentTools.rule.pngNoCompression')}
              </p>
            ) : null}
          </div>

          <Switch
            label={t('documentTools.rule.lockAspect')}
            hint={t('documentTools.rule.lockAspectHint')}
            checked={lockAspect}
            onCheckedChange={setLockAspect}
          />
        </ToolSection>

        <ToolSection
          step={4}
          title={t('documentTools.adjust.title')}
          hint={mode === 'signature' ? t('documentTools.signature.hint') : undefined}
        >
          {mode === 'signature' ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">
                {t('documentTools.signature.title')}
              </p>
              <Switch
                label={t('documentTools.signature.clean')}
                hint={t('documentTools.signature.cleanHint')}
                checked={cleanBackground}
                onCheckedChange={setCleanBackground}
              />
              {cleanBackground ? (
                <>
                  <Slider
                    label={t('documentTools.signature.strength')}
                    min={-80}
                    max={80}
                    step={5}
                    defaultValue={0}
                    value={cleanStrength}
                    valueLabel={cleanStrength > 0 ? `+${cleanStrength}` : `${cleanStrength}`}
                    hint={t('documentTools.signature.strengthHint')}
                    onValueChange={setCleanStrength}
                  />
                  <Switch
                    label={t('documentTools.signature.transparent')}
                    hint={t('documentTools.signature.transparentHint')}
                    checked={transparentBackground}
                    onCheckedChange={setTransparentBackground}
                  />
                  <Switch
                    label={t('documentTools.signature.keepInk')}
                    hint={t('documentTools.signature.keepInkHint')}
                    checked={keepInkColour}
                    onCheckedChange={setKeepInkColour}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          <Slider
            inline
            label={t('documentTools.adjust.brightness')}
            min={-60}
            max={60}
            defaultValue={0}
            value={adjust.brightness}
            valueLabel={`${adjust.brightness > 0 ? '+' : ''}${adjust.brightness}`}
            onValueChange={(brightness) => setAdjust((a) => ({ ...a, brightness }))}
          />
          <Slider
            inline
            label={t('documentTools.adjust.contrast')}
            min={-60}
            max={60}
            defaultValue={0}
            value={adjust.contrast}
            valueLabel={`${adjust.contrast > 0 ? '+' : ''}${adjust.contrast}`}
            onValueChange={(contrast) => setAdjust((a) => ({ ...a, contrast }))}
          />
          <Slider
            inline
            label={t('documentTools.adjust.clarity')}
            min={0}
            max={100}
            defaultValue={0}
            value={adjust.clarity}
            valueLabel={`${adjust.clarity}`}
            hint={t('documentTools.adjust.clarityHint')}
            onValueChange={(clarity) => setAdjust((a) => ({ ...a, clarity }))}
          />
          <Slider
            inline
            label={t('documentTools.adjust.straighten')}
            min={-12}
            max={12}
            step={0.2}
            defaultValue={0}
            value={straighten}
            valueLabel={`${straighten > 0 ? '+' : ''}${straighten.toFixed(1)}°`}
            onValueChange={setStraighten}
          />
          <Switch
            label={t('documentTools.adjust.grayscale')}
            checked={adjust.grayscale}
            onCheckedChange={(grayscale) => setAdjust((a) => ({ ...a, grayscale }))}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAdjust(NEUTRAL);
                setStraighten(0);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('documentTools.adjust.reset')}
            </Button>
          </div>
        </ToolSection>
      </div>

      <div className="min-w-0 space-y-4 self-start xl:col-start-1 xl:row-start-3">
        <div className="grid gap-4 md:grid-cols-2">
          <ToolSection
            step={5}
            title={t('documentTools.stamp.title')}
            titleAdornment={
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {t('documentTools.studio.optional')}
              </span>
            }
          >
            <Switch
              label={t('documentTools.stamp.enable')}
              hint={t('documentTools.stamp.hint')}
              checked={stampEnabled}
              onCheckedChange={setStampEnabled}
            />
            {stampEnabled ? (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-slate-700">
                    {t('documentTools.stamp.name')}
                  </span>
                  <input
                    value={stampName}
                    onChange={(event) => setStampName(event.target.value)}
                    maxLength={60}
                    className={cn(
                      'block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm',
                      'text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300',
                      'focus:ring-2 focus:ring-inset focus:ring-brand-600',
                    )}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-slate-700">
                    {t('documentTools.stamp.date')}
                  </span>
                  <input
                    type="date"
                    value={stampDate}
                    onChange={(event) => setStampDate(event.target.value)}
                    className={cn(
                      'block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm',
                      'text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300',
                      'focus:ring-2 focus:ring-inset focus:ring-brand-600',
                    )}
                  />
                </label>
                <p className="text-[11px] leading-tight text-slate-500">
                  {t('documentTools.stamp.privacy')}
                </p>
              </div>
            ) : null}
          </ToolSection>

          <OutputPanel
            step={6}
            output={output}
            busy={rendering && output === null}
            customers={customers}
            defaultCustomerId={defaultCustomerId}
            sourceDocumentId={sourceDocumentId}
            showDownload={false}
            printable
          />
        </div>

        <button
          type="button"
          disabled={!output}
          onClick={() => {
            if (output) downloadBytes(output.bytes, output.filename, output.mimeType);
          }}
          className={cn(
            'flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand-600 px-4 py-3.5',
            'text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            'focus-visible:outline-brand-600',
            'disabled:cursor-not-allowed disabled:bg-brand-600/50',
          )}
        >
          <ImageDown className="h-5 w-5" strokeWidth={2} aria-hidden />
          {mode === 'signature'
            ? t('documentTools.studio.downloadSignature')
            : t('documentTools.studio.downloadPhoto')}
        </button>
      </div>
    </div>
  );
}

const FEATURE_ICONS: Record<StudioFeatureId, LucideIcon> = {
  autoCrop: Crop,
  removeBackground: LayoutGrid,
  enhance: Sun,
  exactSize: FileDigit,
};

/** What the tool can do, shown in the empty dropzone. Not buttons — every one is a control in the rail. */
function FeaturePills() {
  const t = useTranslations();
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {STUDIO_FEATURES.map((feature) => {
        const Icon = FEATURE_ICONS[feature.id];
        return (
          <li
            key={feature.id}
            title={
              feature.id === 'removeBackground'
                ? t('documentTools.studio.features.removeBackgroundHint')
                : undefined
            }
            className="flex flex-col items-center gap-2 text-center text-xs text-slate-600"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
            >
              <Icon className="h-5 w-5" strokeWidth={1.9} />
            </span>
            {t(feature.labelKey)}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Before-and-after examples of the stages a file goes through. Stock artwork only — see
 * `lib/document-tools/studio.ts`.
 */
function Examples({
  kind,
  onKindChange,
}: {
  kind: ExampleKind;
  onKindChange: (kind: ExampleKind) => void;
}) {
  const t = useTranslations();
  const stages = STUDIO_EXAMPLES[kind];

  return (
    <div className="space-y-3 pt-1">
      <h2 className="text-sm font-semibold text-slate-900">
        {t('documentTools.studio.examples.title')}
      </h2>
      <div
        role="tablist"
        aria-label={t('documentTools.studio.examples.title')}
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(EXAMPLE_TAB_KEYS) as ExampleKind[]).map((option) => {
          const active = option === kind;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onKindChange(option)}
              className={cn(
                'rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-brand-600',
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-transparent bg-slate-100 text-slate-600 hover:text-slate-900',
              )}
            >
              {t(EXAMPLE_TAB_KEYS[option])}
            </button>
          );
        })}
      </div>

      <ul role="tabpanel" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.map((stage) => (
          <li
            key={stage.labelKey}
            className="flex flex-col items-center gap-2 rounded-xl bg-brand-50/60 p-2.5"
          >
            <ExampleArtwork stage={stage} kind={kind} />
            <span className="text-center text-[11px] font-medium text-slate-700">
              {t(stage.labelKey)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleArtwork({ stage, kind }: { stage: ExampleStage; kind: ExampleKind }) {
  const landscape = stage.width > stage.height;
  const image = (
    <Image
      src={stage.src}
      alt=""
      width={stage.width}
      height={stage.height}
      sizes="160px"
      className={cn(
        'h-full w-full',
        landscape ? 'object-contain' : 'object-cover',
        stage.multiply && 'mix-blend-multiply',
      )}
    />
  );

  switch (stage.style) {
    case 'plain':
      return (
        <div className="aspect-[4/5] w-full overflow-hidden rounded-md bg-white">{image}</div>
      );

    case 'cutout':
      return (
        <StageBackdrop transparent className="aspect-[4/5] w-full rounded-md">
          {image}
        </StageBackdrop>
      );

    case 'portal':
      return (
        <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-white p-2">
          <div
            className={cn(
              'overflow-hidden border border-slate-400 bg-white shadow-sm',
              // The shapes the captions name: 3.5 × 4.5 cm and 3.5 × 1.5 cm.
              kind === 'photo' ? 'aspect-[35/45] h-full' : 'aspect-[35/15] w-full',
            )}
          >
            {image}
          </div>
        </div>
      );

    case 'custom':
      return (
        <div className="relative aspect-[4/5] w-full rounded-md bg-white p-2.5">
          <div className="relative h-full w-full overflow-hidden border border-slate-700">
            {image}
          </div>
          {/* Resize arrows on the four corners: "any size you set". */}
          <MoveDiagonal2
            aria-hidden
            className="absolute left-0.5 top-0.5 h-3.5 w-3.5 text-slate-700"
          />
          <MoveDiagonal2
            aria-hidden
            className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 text-slate-700"
          />
          <MoveDiagonal
            aria-hidden
            className="absolute right-0.5 top-0.5 h-3.5 w-3.5 text-slate-700"
          />
          <MoveDiagonal
            aria-hidden
            className="absolute bottom-0.5 left-0.5 h-3.5 w-3.5 text-slate-700"
          />
        </div>
      );
  }
}
