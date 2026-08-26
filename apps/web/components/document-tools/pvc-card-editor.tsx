'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Select, Slider, cn } from '@assistigo/ui';
import {
  CARD_PRINT_DPI,
  CR80_ASPECT,
  CR80_HEIGHT_MM,
  CR80_WIDTH_MM,
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

  const [sheetCount, setSheetCount] = useState(2);
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);

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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          {(['front', 'back'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setFace(side)}
              aria-pressed={face === side}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                face === side
                  ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
              )}
            >
              {side === 'front' ? t('documentTools.card.front') : t('documentTools.card.back')}
              {working[side] ? (
                <Badge tone="success" className="ml-1.5 text-[9px]">
                  ✓
                </Badge>
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
          <div className="space-y-2">
            <FileDrop
              onFiles={onImageFiles}
              accept={['image/jpeg', 'image/png', 'image/webp']}
              label={t('documentTools.card.chooseImage', {
                face: face === 'front' ? t('documentTools.card.front') : t('documentTools.card.back'),
              })}
              compact
            />
            <FileDrop
              onFiles={onPdfFile}
              accept={['application/pdf']}
              label={t('documentTools.card.chooseEAadhaar')}
              hint={t('documentTools.card.chooseEAadhaarHint')}
              compact
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
      </div>

      <div className="min-w-0 space-y-3">
        <ToolSection
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

        <ToolSection title={t('documentTools.card.sheet')}>
          <Slider
            label={t('documentTools.card.copies')}
            min={1}
            max={4}
            step={1}
            defaultValue={2}
            value={sheetCount}
            valueLabel={`${sheetCount}`}
            hint={t('documentTools.card.copiesHint')}
            onValueChange={setSheetCount}
          />
        </ToolSection>

        <OutputPanel
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

