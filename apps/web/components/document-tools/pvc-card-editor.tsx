'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  Crop,
  Fingerprint,
  ImageIcon,
  LayoutGrid,
  Printer,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Button, Select, Slider, cn } from '@assistigo/ui';
import {
  CARD_COPIES_MAX,
  CARD_COPIES_MIN,
  CARD_PRINT_DPI,
  CR80_ASPECT,
  CR80_HEIGHT_MM,
  CR80_WIDTH_MM,
  DEFAULT_TOOL_PREFERENCES,
  RecipeBuilder,
  aadhaarMaskDefault,
  centredCropForAspect,
  derivativeFilename,
  isMeaningfulRedaction,
  planCardSheet,
  type Rect,
} from '@assistigo/document-tools';
import {
  canvasAsSource,
  composeCardSheet,
  decodeImage,
  drawRedactions,
  encodeToWindow,
  renderImage,
  type DecodedImage,
  type RedactionBox,
} from '@assistigo/document-tools/browser/image';
import {
  PdfPasswordRequiredError,
  decryptPdf,
  loadPdf,
  renderPdfPage,
} from '@assistigo/document-tools/browser/pdf';
import { useTranslations } from '@/lib/i18n/client';
import { readToolPreferences } from '@/lib/document-tools/preferences';
import { CARD_ARTWORK, CARD_FEATURES, type CardFeatureId } from '@/lib/document-tools/pvc-card';
import { CropStage } from './crop-stage';
import { FileDrop } from './file-drop';
import { OutputPanel, type CustomerOption, type ToolOutput } from './output-panel';
import { RedactionLayer } from './redaction-layer';
import { ToolSection } from './tool-shell';

/**
 * PVC wallet-card layout and Aadhaar/PAN/voter-ID redaction.
 * Master spec §13.2 — "PVC Card Layout & Aadhaar Redaction Tool".
 *
 * Two faces, one card. The front is framed to the CR-80 crop and, when the source is an
 * Aadhaar-class document, carries a redaction the operator must place before either face can be
 * saved to the CRM — enforced by `isMeaningfulRedaction`, not by trusting a checkbox.
 *
 * The e-Aadhaar path (encrypted PDF → password → rasterised page) exists because that PDF is
 * frequently the *only* copy of the card a customer has on their phone. Rasterising happens
 * client-side; the password is used once, in memory, and never leaves the browser.
 */

const MAX_WORKING_EDGE = 2000;
const RENDER_DEBOUNCE_MS = 220;
const MIN_COPIES = CARD_COPIES_MIN;
const MAX_COPIES = CARD_COPIES_MAX;
const DEFAULT_COPIES = DEFAULT_TOOL_PREFERENCES.card.copies;

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const PDF_TYPES = ['application/pdf'] as const;

const FEATURE_ICONS: Record<CardFeatureId, { icon: LucideIcon; tone: string }> = {
  autoCrop: { icon: Crop, tone: 'bg-violet-100 text-violet-600' },
  privacy: { icon: ShieldCheck, tone: 'bg-emerald-100 text-emerald-600' },
  quality: { icon: ImageIcon, tone: 'bg-orange-100 text-orange-500' },
  pvc: { icon: Printer, tone: 'bg-brand-100 text-brand-600' },
};

type Face = 'front' | 'back';
type SourceKind = 'unknown' | 'aadhaar_like';

export function PvcCardEditor({
  customers,
  defaultCustomerId,
  today,
}: {
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
  today: string;
}) {
  const t = useTranslations();

  const [face, setFace] = useState<Face>('front');
  const [sources, setSources] = useState<Record<Face, DecodedImage | null>>({
    front: null,
    back: null,
  });
  const [working, setWorking] = useState<Record<Face, HTMLCanvasElement | null>>({
    front: null,
    back: null,
  });
  const [crop, setCrop] = useState<Record<Face, Rect>>({
    front: { x: 0, y: 0, width: 1, height: 1 },
    back: { x: 0, y: 0, width: 1, height: 1 },
  });
  const [redaction, setRedaction] = useState<Record<Face, RedactionBox | null>>({
    front: null,
    back: null,
  });
  const [sourceKind, setSourceKind] = useState<SourceKind>('unknown');

  const [decodeError, setDecodeError] = useState<string | null>(null);

  // e-Aadhaar unlock
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [sheetCount, setSheetCount] = useState(DEFAULT_COPIES);
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);

  // The operator's own starting value (Settings → My preferences). Read after mount: it lives in
  // this browser, and the server-rendered first paint has to match the built-in default.
  useEffect(() => {
    setSheetCount(readToolPreferences().card.copies);
  }, []);

  const decoded = sources[face];
  const canvas = working[face];

  const setSourceFor = useCallback((target: Face, image: DecodedImage | null) => {
    setSources((previous) => {
      previous[target]?.release();
      return { ...previous, [target]: image };
    });
  }, []);

  useEffect(
    () => () => {
      sources.front?.release();
      sources.back?.release();
    },
    [sources],
  );

  const onImageFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setDecodeError(null);
      try {
        const image = await decodeImage(file);
        setSourceFor(face, image);
      } catch {
        setDecodeError('documentTools.errors.decodeFailed');
      }
    },
    [face, setSourceFor],
  );

  const onPdfFile = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setDecodeError(null);
    setPasswordError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
      await loadPdf(bytes);
      // Opened without a password: not the e-Aadhaar case. Render page 1 straight through.
      const rendered = await renderPdfPage(bytes, 1, { dpi: 200 });
      setSourceFor(face, canvasAsSource(rendered));
    } catch (error) {
      if (error instanceof PdfPasswordRequiredError) {
        setPdfBytes(bytes);
        return;
      }
      setDecodeError('documentTools.errors.decodeFailed');
    }
  }, [face, setSourceFor]);

  // The photo zone also takes a PDF — a scan saved as PDF is common — and hands it to the same
  // path as the e-Aadhaar zone, so a locked PDF dropped here still reaches the unlock step.
  const onPhotoZoneFiles = useCallback(
    (files: File[]) => {
      if (files[0]?.type === 'application/pdf') void onPdfFile(files);
      else void onImageFiles(files);
    },
    [onImageFiles, onPdfFile],
  );

  async function unlock() {
    if (!pdfBytes) return;
    setUnlocking(true);
    setPasswordError(null);
    try {
      const rasterised = await decryptPdf(pdfBytes, password);
      const rendered = await renderPdfPage(rasterised, 1, { dpi: 200 });
      setSourceFor(face, canvasAsSource(rendered));
      setSourceKind('aadhaar_like');
      setPdfBytes(null);
      setPassword('');
    } catch (error) {
      setPasswordError(
        error instanceof PdfPasswordRequiredError
          ? 'documentTools.card.passwordIncorrect'
          : 'documentTools.errors.decodeFailed',
      );
    } finally {
      setUnlocking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Working canvas per face
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (['front', 'back'] as const).forEach((side) => {
      const source = sources[side];
      if (!source) {
        setWorking((previous) => ({ ...previous, [side]: null }));
        return;
      }
      const longEdge = Math.max(source.width, source.height);
      const scale = longEdge > MAX_WORKING_EDGE ? MAX_WORKING_EDGE / longEdge : 1;
      const rendered = renderImage(source, {
        width: Math.round(source.width * scale),
        height: Math.round(source.height * scale),
      });
      setWorking((previous) => ({ ...previous, [side]: rendered }));
    });
  }, [sources]);

  useEffect(() => {
    (['front', 'back'] as const).forEach((side) => {
      const target = working[side];
      if (!target) return;
      setCrop((previous) => ({
        ...previous,
        [side]: centredCropForAspect({ width: target.width, height: target.height }, CR80_ASPECT),
      }));
    });
    // Only re-frame when a working canvas newly appears, not on every crop tweak.
  }, [working.front, working.back]);

  // Aadhaar redaction defaults once the crop is known, only for the front face.
  useEffect(() => {
    if (sourceKind !== 'aadhaar_like' || face !== 'front') return;
    const cropSize = { width: crop.front.width, height: crop.front.height };
    setRedaction((previous) =>
      previous.front ? previous : { ...previous, front: aadhaarMaskDefault(cropSize) },
    );
    // Placed once per crop appearing; the operator drags it from there.
  }, [sourceKind, face, crop.front.width, crop.front.height]);

  const needsRedaction = sourceKind === 'aadhaar_like';
  const frontMasked =
    !needsRedaction ||
    (redaction.front !== null &&
      isMeaningfulRedaction(redaction.front, { width: crop.front.width, height: crop.front.height }));

  // ---------------------------------------------------------------------------
  // Card faces + sheet render
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const hasAny = working.front || working.back;
    if (!hasAny) {
      setOutput(null);
      return;
    }

    const token = ++renderToken.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        const faces: HTMLCanvasElement[] = [];
        const steps: { side: Face; redacted: boolean }[] = [];

        for (const side of ['front', 'back'] as const) {
          const source = working[side];
          if (!source) continue;
          const cardWidthPx = Math.round((CR80_WIDTH_MM / 25.4) * CARD_PRINT_DPI);
          const cardHeightPx = Math.round((CR80_HEIGHT_MM / 25.4) * CARD_PRINT_DPI);
          const rendered = renderImage(canvasAsSource(source), {
            crop: crop[side],
            width: cardWidthPx,
            height: cardHeightPx,
          });

          const box = redaction[side];
          const masked = side === 'front' && needsRedaction && box && frontMasked;
          if (masked && box) {
            // Scale the box from crop space to the rendered card's pixel space.
            const scaleX = cardWidthPx / crop[side].width;
            const scaleY = cardHeightPx / crop[side].height;
            drawRedactions(rendered, [
              {
                ...box,
                x: box.x * scaleX,
                y: box.y * scaleY,
                width: box.width * scaleX,
                height: box.height * scaleY,
                style: 'crosses',
              },
            ]);
          }
          faces.push(rendered);
          steps.push({ side, redacted: Boolean(masked) });
        }

        if (faces.length === 0) {
          setOutput(null);
          return;
        }

        const layout = planCardSheet({
          sheetWidthMm: 101.6,
          sheetHeightMm: 152.4,
          count: sheetCount,
        });
        const composed = composeCardSheet(faces, layout, { cutMarks: true });
        const encoded = await encodeToWindow(composed, { mimeType: 'image/jpeg' });
        if (token !== renderToken.current) return;

        const recipe = new RecipeBuilder('pvc_card', null)
          .addIf(steps.length > 0, 'crop', { faces: steps.length })
          .addIf(
            steps.some((step) => step.redacted),
            'redact',
            { boxes: steps.filter((step) => step.redacted).length, style: 'crosses' },
          )
          .add('card_layout', { faces: steps.length, sheetCount, dpi: CARD_PRINT_DPI })
          .add('compress', { quality: encoded.quality ?? 1 })
          .build({
            mimeType: encoded.mimeType,
            widthPx: encoded.width,
            heightPx: encoded.height,
            dpi: CARD_PRINT_DPI,
            sourceCount: faces.length,
          });

        const warnings: string[] = [];
        if (needsRedaction && !frontMasked) warnings.push('documentTools.card.redactionRequired');

        setOutput({
          bytes: encoded.bytes,
          mimeType: encoded.mimeType,
          filename: derivativeFilename({
            tool: 'pvc_card',
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
  }, [working.front, working.back, crop, redaction, sheetCount, needsRedaction, frontMasked, today]);

  const faceLabel = face === 'front' ? t('documentTools.card.front') : t('documentTools.card.back');

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          {(['front', 'back'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setFace(side)}
              aria-pressed={face === side}
              className={cn(
                'inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg border px-5 py-2 text-sm font-medium transition-colors',
                face === side
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
              )}
            >
              {side === 'front' ? t('documentTools.card.front') : t('documentTools.card.back')}
              {working[side] ? (
                <Check
                  className={cn('h-3.5 w-3.5', face === side ? 'text-white' : 'text-emerald-600')}
                  strokeWidth={2.6}
                  aria-hidden
                />
              ) : null}
            </button>
          ))}
        </div>

        {decoded ? (
          <CropStage
            canvas={canvas}
            crop={crop[face]}
            onCropChange={(next) => setCrop((previous) => ({ ...previous, [face]: next }))}
            aspect={CR80_ASPECT}
          >
            {({ scale, bounds }) =>
              face === 'front' && needsRedaction && redaction.front ? (
                <RedactionLayer
                  bounds={bounds}
                  scale={scale}
                  box={redaction.front}
                  onBoxChange={(box) =>
                    setRedaction((previous) => ({ ...previous, front: box }))
                  }
                  label={t('documentTools.card.redactionHandle')}
                />
              ) : null
            }
          </CropStage>
        ) : pdfBytes ? (
          <ToolSection title={t('documentTools.card.unlockTitle')} hint={t('documentTools.card.unlockHint')}>
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
              <Button size="sm" loading={unlocking} onClick={unlock}>
                {t('documentTools.card.unlock')}
              </Button>
            </div>
            {passwordError ? <Alert tone="danger">{t(passwordError)}</Alert> : null}
          </ToolSection>
        ) : (
          <div className="space-y-3">
            <FileDrop
              variant="tile"
              onFiles={onPhotoZoneFiles}
              accept={PHOTO_TYPES}
              label={t('documentTools.card.chooseImage', { face: faceLabel })}
              buttonLabel={t('documentTools.card.chooseFile')}
              artwork={<ZoneArtwork src={CARD_ARTWORK.uploadPhoto} />}
            />
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('documentTools.card.or')}
              </span>
              <span aria-hidden className="h-px flex-1 bg-slate-200" />
            </div>
            {/* Not pasteable: the photo zone above already takes a pasted PDF down the same path. */}
            <FileDrop
              variant="tile"
              onFiles={onPdfFile}
              accept={PDF_TYPES}
              pasteable={false}
              label={t('documentTools.card.chooseEAadhaar')}
              hint={t('documentTools.card.chooseEAadhaarHint')}
              buttonLabel={t('documentTools.card.chooseFile')}
              artwork={<ZoneArtwork src={CARD_ARTWORK.uploadPdf} />}
            />
          </div>
        )}

        {decodeError ? <Alert tone="danger">{t(decodeError)}</Alert> : null}

        {decoded ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSourceFor(face, null);
              setRedaction((previous) => ({ ...previous, [face]: null }));
            }}
          >
            {t('documentTools.transform.changeFile')}
          </Button>
        ) : null}

        <ul className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 2xl:grid-cols-4">
          {CARD_FEATURES.map((feature) => {
            const { icon: Icon, tone } = FEATURE_ICONS[feature.id];
            return (
              <li key={feature.id} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{t(feature.titleKey)}</p>
                  <p className="text-[11px] text-slate-500">{t(feature.hintKey)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-w-0 space-y-4">
        <ToolSection
          step={1}
          icon={Fingerprint}
          title={t('documentTools.card.documentKind')}
          hint={t('documentTools.card.documentKindHint')}
        >
          <Select
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value as SourceKind)}
            className="py-1.5 text-sm"
          >
            <option value="unknown">{t('documentTools.card.kindOther')}</option>
            <option value="aadhaar_like">{t('documentTools.card.kindAadhaar')}</option>
          </Select>
          {needsRedaction ? (
            <Alert tone={frontMasked ? 'success' : 'warning'}>
              {frontMasked
                ? t('documentTools.card.maskedConfirmed')
                : t('documentTools.card.maskRequired')}
            </Alert>
          ) : null}
        </ToolSection>

        <ToolSection step={2} icon={LayoutGrid} title={t('documentTools.card.sheet')}>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Slider
                label={t('documentTools.card.copies')}
                min={MIN_COPIES}
                max={MAX_COPIES}
                step={1}
                defaultValue={DEFAULT_COPIES}
                value={sheetCount}
                onValueChange={setSheetCount}
              />
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_COPIES}
              max={MAX_COPIES}
              step={1}
              value={sheetCount}
              aria-label={t('documentTools.card.copies')}
              onChange={(event) => {
                const next = Number(event.target.value);
                // Ignore the empty and out-of-range states a keyboard passes through mid-edit.
                if (Number.isInteger(next) && next >= MIN_COPIES && next <= MAX_COPIES) {
                  setSheetCount(next);
                }
              }}
              className="block w-16 shrink-0 rounded-md border-0 bg-white py-1.5 text-center text-sm tabular-nums text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            />
          </div>
          <p className="text-[11px] leading-tight text-slate-500">
            {t('documentTools.card.copiesHint')}
          </p>
        </ToolSection>

        <OutputPanel
          step={3}
          icon={ImageIcon}
          output={output}
          busy={rendering && output === null}
          customers={customers}
          defaultCustomerId={defaultCustomerId}
          saveBlockedReason={needsRedaction && !frontMasked ? 'documentTools.card.maskRequired' : null}
          printable
        />
      </div>
    </div>
  );
}

/** Drop-zone illustration. SVGs from `public/` skip the optimiser, which would reject them. */
function ZoneArtwork({ src }: { src: string }) {
  return (
    <Image src={src} alt="" width={112} height={112} unoptimized className="h-28 w-28 select-none" />
  );
}

