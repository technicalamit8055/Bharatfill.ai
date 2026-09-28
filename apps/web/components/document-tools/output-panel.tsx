'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Alert, Badge, Button, Select, SizeMeter, Spinner, cn } from '@assistigo/ui';
import {
  formatKb,
  formatSizeWindow,
  judgeSize,
  sizeWindowPosition,
  stepLabelKey,
  type DerivativeRecipe,
  type OutputMimeType,
} from '@assistigo/document-tools';
import { useTranslations } from '@/lib/i18n/client';
import { formatBytes } from '@/lib/documents/format';
import { downloadBytes, printImage, saveDerivative } from '@/lib/document-tools/save';
import { ToolSection } from './tool-shell';

export type ToolOutput = {
  bytes: Uint8Array;
  mimeType: OutputMimeType;
  filename: string;
  widthPx: number | null;
  heightPx: number | null;
  recipe: DerivativeRecipe;
  /** Portal window the result is judged against. */
  window: { minBytes?: number; maxBytes?: number };
  /** Set when the tool could not meet the maximum, or had to pad to reach the minimum. */
  warnings?: string[];
};

export type CustomerOption = { id: string; label: string };

/**
 * What happens to a finished file.
 *
 * Download first, save second, and that order is the product decision: the file's destination is
 * a portal upload box in the operator's other tab, and every copy of a customer's photograph that
 * lands on a server is a liability the organization now carries. So the CRM copy is opt-in
 * (§13.3 — "tool outputs *can* be attached to customer or application").
 *
 * The size meter is the other half of the panel. An operator's real question is not "is it done"
 * but "will the portal take it", and that is a comparison against a window, which is what the
 * meter shows.
 */
export function OutputPanel({
  output,
  busy,
  customers,
  defaultCustomerId,
  sourceDocumentId,
  /** Blocks saving to the CRM until a condition is met — the Aadhaar mask gate uses this. */
  saveBlockedReason,
  printable = false,
  step,
  showDownload = true,
  className,
}: {
  output: ToolOutput | null;
  busy?: boolean;
  customers: readonly CustomerOption[];
  defaultCustomerId?: string | null;
  sourceDocumentId?: string | null;
  saveBlockedReason?: string | null;
  printable?: boolean;
  /** Renders the panel as a numbered step card (see `ToolSection`). */
  step?: number;
  /** Off when the page puts its own download button elsewhere. */
  showDownload?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // One object URL per result, revoked when the result changes. Without the cleanup an operator
  // adjusting a slider for two minutes leaks a few hundred blobs.
  useEffect(() => {
    if (!output || output.mimeType === 'application/pdf') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([output.bytes.slice()], { type: output.mimeType }),
    );
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  // A new result invalidates the last "saved" confirmation: the file on the server is no longer
  // the file on screen, and leaving the tick up would say otherwise.
  useEffect(() => {
    setSaved(null);
    setError(null);
  }, [output]);

  const verdict = output ? judgeSize(output.bytes.byteLength, output.window) : 'unknown';
  const windowLabel = output ? formatSizeWindow(output.window) : null;

  const recipeSteps = useMemo(
    () => output?.recipe.steps.map((step) => t(stepLabelKey(step))) ?? [],
    [output, t],
  );

  async function save() {
    if (!output) return;
    setSaving(true);
    setError(null);
    const result = await saveDerivative({
      bytes: output.bytes,
      mimeType: output.mimeType,
      filename: output.filename,
      widthPx: output.widthPx,
      heightPx: output.heightPx,
      customerId: customerId === '' ? null : customerId,
      sourceDocumentId: sourceDocumentId ?? null,
      recipe: output.recipe,
    });
    setSaving(false);
    if (result.ok) setSaved(result.filename);
    else setError(result.messageKey);
  }

  return (
    <ToolSection
      title={t('documentTools.output.title')}
      step={step}
      className={cn(step === undefined && 'border-slate-300', className)}
    >
      {busy ? (
        <div className="flex items-center justify-center py-6">
          <Spinner label={t('documentTools.output.working')} />
        </div>
      ) : !output ? (
        step !== undefined ? (
          <div className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-5 text-center">
            <ImageIcon className="h-7 w-7 text-slate-400" strokeWidth={1.6} aria-hidden />
            <p className="text-xs text-slate-500">{t('documentTools.output.empty')}</p>
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-slate-500">
            {t('documentTools.output.empty')}
          </p>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
              {previewUrl ? (
                // operator's own machine; next/image would try to optimise it on the server.
                <img
                  src={previewUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-[10px] font-semibold uppercase text-slate-400">PDF</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate font-mono text-[11px] text-slate-600">{output.filename}</p>
              <SizeMeter
                position={sizeWindowPosition(output.bytes.byteLength, output.window)}
                verdict={verdict}
                windowLabel={windowLabel}
                valueLabel={formatKb(output.bytes.byteLength)}
                verdictLabel={
                  verdict === 'ok' && windowLabel
                    ? t('documentTools.output.fits')
                    : verdict === 'too_large'
                      ? t('documentTools.output.tooLarge')
                      : verdict === 'too_small'
                        ? t('documentTools.output.tooSmall')
                        : undefined
                }
              />
              <p className="text-[11px] tabular-nums text-slate-500">
                {output.widthPx && output.heightPx
                  ? `${output.widthPx} × ${output.heightPx} px · `
                  : ''}
                {formatBytes(output.bytes.byteLength)}
                {output.recipe.output.pageCount
                  ? ` · ${t('documentTools.output.pages', { count: output.recipe.output.pageCount })}`
                  : ''}
              </p>
            </div>
          </div>

          {output.warnings?.length ? (
            <Alert tone="warning">
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                {output.warnings.map((warning) => (
                  <li key={warning}>{t(warning)}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {showDownload || (printable && output.mimeType !== 'application/pdf') ? (
            <div className="flex flex-wrap gap-2">
              {showDownload ? (
                <Button
                  size="sm"
                  onClick={() => downloadBytes(output.bytes, output.filename, output.mimeType)}
                >
                  {t('documentTools.output.download')}
                </Button>
              ) : null}
              {printable && output.mimeType !== 'application/pdf' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => printImage(output.bytes, output.mimeType, output.filename)}
                >
                  {t('documentTools.output.print')}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block text-xs font-medium text-slate-700">
              {t('documentTools.output.saveTo')}
            </label>
            <Select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="py-1.5 text-sm"
              aria-label={t('documentTools.output.saveTo')}
            >
              <option value="">{t('documentTools.output.noCustomer')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </Select>

            {saveBlockedReason ? (
              <Alert tone="warning">{t(saveBlockedReason)}</Alert>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={saving}
                onClick={save}
                className="w-full"
              >
                {t('documentTools.output.save')}
              </Button>
            )}

            {saved ? (
              <Alert tone="success">{t('documentTools.output.saved')}</Alert>
            ) : null}
            {error ? <Alert tone="danger">{t(error)}</Alert> : null}
          </div>

          {recipeSteps.length > 0 ? (
            <details className="border-t border-slate-100 pt-2">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-500">
                {t('documentTools.output.recipe')}
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {recipeSteps.map((step, index) => (
                  <Badge key={`${step}-${index}`} tone="neutral" className="text-[10px]">
                    {step}
                  </Badge>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </ToolSection>
  );
}
