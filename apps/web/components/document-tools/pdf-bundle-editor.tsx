'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, CircleCheck, Files, Layers, Plus, Shrink, Trash2 } from 'lucide-react';
import {
  DOCUMENT_TYPE_LABELS,
  isDocumentType,
  sanitizeFilename,
  type DocumentType,
} from '@assistigo/core';
import { Alert, Button, NumberField, Select, Spinner, cn } from '@assistigo/ui';
import {
  BUNDLE_DOCUMENT_TYPES,
  BUNDLE_SIZE_CHOICES_KB,
  BUNDLE_TEMPLATES,
  DEFAULT_TOOL_PREFERENCES,
  MAX_DERIVATIVE_BYTES,
  RecipeBuilder,
  bundleTargetBytes,
  findBundleTemplate,
  isBundleableMime,
  matchBundleSlots,
  type BundleCandidate,
} from '@assistigo/document-tools';
import {
  PdfPasswordRequiredError,
  buildPdfBundle,
  decryptPdf,
  loadPdf,
  type BundlePart,
} from '@assistigo/document-tools/browser/pdf';
import { readToolPreferences } from '@/lib/document-tools/preferences';
import { useI18n } from '@/lib/i18n/client';
import { OutputPanel, type CustomerOption, type ToolOutput } from './output-panel';
import { ToolSection } from './tool-shell';

/**
 * PDF bundle: several of one customer's stored documents, in order, as one PDF under a size
 * limit. Master spec §13.2 ("Merge PDFs/images", "Compress PDF").
 *
 * The documents' bytes are fetched only when the operator presses Build, one audited signed URL
 * per document (docs/SECURITY.md §4), and the PDF is put together in this browser. Nothing goes
 * back to the server unless the operator saves the result through the output panel.
 */

type StoredDocument = BundleCandidate & { filename: string };

type Slot = {
  key: string;
  documentType: DocumentType;
  documentId: string | null;
  included: boolean;
};

type ListResponse = {
  data?: {
    documents: {
      id: string;
      filename: string | null;
      mimeType: string | null;
      documentType: string | null;
      status: string | null;
      createdAt: string | null;
    }[];
  };
};

let slotCounter = 0;
function slotKey(): string {
  slotCounter += 1;
  return `slot-${slotCounter}`;
}

async function fetchDocumentBytes(documentId: string): Promise<Uint8Array> {
  const response = await fetch(`/api/documents/${documentId}/signed-url`, { method: 'POST' });
  if (response.status === 403) throw new Error('documentTools.bundle.errors.noPermission');
  const json = (await response.json()) as { data?: { url?: string } };
  if (!response.ok || !json.data?.url) throw new Error('documentTools.bundle.errors.fetchFailed');
  const file = await fetch(json.data.url);
  if (!file.ok) throw new Error('documentTools.bundle.errors.fetchFailed');
  return new Uint8Array(await file.arrayBuffer());
}

export function PdfBundleEditor({
  header,
  customers,
  defaultCustomerId,
  canReadDocuments,
  today,
}: {
  header?: ReactNode;
  customers: readonly CustomerOption[];
  defaultCustomerId: string | null;
  /** The caller holds both `document.view` and `document.download`. Checked again by each route. */
  canReadDocuments: boolean;
  today: string;
}) {
  const { t, locale } = useI18n();
  const typeLabel = (type: DocumentType) => DOCUMENT_TYPE_LABELS[type][locale === 'hi' ? 'hi' : 'en'];

  const [customerId, setCustomerId] = useState<string | null>(defaultCustomerId);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [setCode, setSetCode] = useState<string>(BUNDLE_TEMPLATES[0]?.code ?? 'custom');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [maxKb, setMaxKb] = useState<number | ''>(
    Math.round((BUNDLE_TEMPLATES[0]?.maxBytes ?? 500 * 1024) / 1024),
  );
  const [allowRasterise, setAllowRasterise] = useState(DEFAULT_TOOL_PREFERENCES.pdf.allowRasterise);
  useEffect(() => {
    setAllowRasterise(readToolPreferences().pdf.allowRasterise);
  }, []);

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [summary, setSummary] = useState<{ documents: number; pages: number; images: number } | null>(
    null,
  );
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  /**
   * Bytes already fetched (and, for an e-Aadhaar, already unlocked), so a reorder or a new size
   * limit does not open every document a second time. Held in memory for this page only, and
   * dropped the moment the customer changes.
   */
  const ready = useRef(new Map<string, BundlePart>());
  const raw = useRef(new Map<string, Uint8Array>());
  const passwords = useRef(new Map<string, string>());
  const [passwordWrong, setPasswordWrong] = useState(false);

  // Load the customer's documents whenever the customer changes.
  useEffect(() => {
    ready.current.clear();
    raw.current.clear();
    passwords.current.clear();
    setDocuments([]);
    setListError(null);
    setPasswordFor(null);
    if (!customerId || !canReadDocuments) return;

    let cancelled = false;
    setLoadingDocuments(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/documents?customerId=${encodeURIComponent(customerId)}&limit=100`,
        );
        if (!response.ok) throw new Error('list_failed');
        const json = (await response.json()) as ListResponse;
        if (cancelled) return;
        setDocuments(
          (json.data?.documents ?? [])
            .filter((row) => isBundleableMime(row.mimeType))
            .map((row) => ({
              id: row.id,
              filename: row.filename ?? '',
              mimeType: row.mimeType ?? '',
              documentType: isDocumentType(row.documentType) ? row.documentType : 'unknown',
              status: row.status ?? 'uploaded',
              createdAt: row.createdAt ?? '',
            })),
        );
      } catch {
        if (!cancelled) setListError('documentTools.bundle.errors.listFailed');
      } finally {
        if (!cancelled) setLoadingDocuments(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, canReadDocuments]);

  // A set, or a fresh document list, re-picks every slot from scratch.
  useEffect(() => {
    const template = findBundleTemplate(setCode);
    if (!template) {
      // A custom order keeps its types; only the documents behind them are picked again, so a
      // new customer never inherits the last customer's document ids.
      setSlots((previous) => {
        const matches = matchBundleSlots(
          previous.map((slot) => slot.documentType),
          documents,
        );
        return previous.map((slot, index) => ({
          ...slot,
          documentId: matches[index]?.documentId ?? null,
        }));
      });
      return;
    }
    setSlots(
      matchBundleSlots(template.documentTypes, documents).map((match) => ({
        key: slotKey(),
        documentType: match.documentType,
        documentId: match.documentId,
        included: true,
      })),
    );
  }, [setCode, documents]);

  // Any change to what goes in makes the last result stale.
  useEffect(() => {
    setOutput(null);
    setSummary(null);
    setBuildError(null);
  }, [slots, maxKb, allowRasterise, customerId]);

  function chooseSet(code: string) {
    setSetCode(code);
    const template = findBundleTemplate(code);
    if (template) setMaxKb(Math.round(template.maxBytes / 1024));
  }

  function updateSlots(next: (previous: Slot[]) => Slot[]) {
    setSlots(next);
    setSetCode('custom');
  }

  function addSlot(documentType: DocumentType) {
    updateSlots((previous) => {
      const used = new Set(previous.map((slot) => slot.documentId).filter(Boolean));
      const [match] = matchBundleSlots(
        [documentType],
        documents.filter((document) => !used.has(document.id)),
      );
      return [
        ...previous,
        { key: slotKey(), documentType, documentId: match?.documentId ?? null, included: true },
      ];
    });
  }

  function move(index: number, delta: -1 | 1) {
    updateSlots((previous) => {
      const target = index + delta;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  }

  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );

  async function preparePart(document: StoredDocument): Promise<BundlePart | 'needs_password'> {
    const cached = ready.current.get(document.id);
    if (cached) return cached;

    // Kept between a password prompt and its retry, so unlocking does not open the file twice.
    let bytes = raw.current.get(document.id);
    if (!bytes) {
      bytes = await fetchDocumentBytes(document.id);
      raw.current.set(document.id, bytes);
    }
    let part: BundlePart = { bytes, mimeType: document.mimeType };
    if (document.mimeType === 'application/pdf') {
      const known = passwords.current.get(document.id);
      try {
        await loadPdf(bytes, known);
        // pdf-lib cannot decrypt; an encrypted PDF only becomes usable as its decrypted copy.
        if (known) part = { bytes: await decryptPdf(bytes, known), mimeType: 'application/pdf' };
      } catch (error) {
        if (error instanceof PdfPasswordRequiredError) {
          passwords.current.delete(document.id);
          setPasswordWrong(error.wrongPassword);
          return 'needs_password';
        }
        throw error;
      }
    }
    raw.current.delete(document.id);
    ready.current.set(document.id, part);
    return part;
  }

  async function build() {
    setBuildError(null);
    setOutput(null);
    setPasswordFor(null);

    const chosen = slots
      .filter((slot) => slot.included && slot.documentId)
      .map((slot) => documentById.get(slot.documentId ?? ''))
      .filter((document): document is StoredDocument => Boolean(document));
    if (chosen.length === 0) {
      setBuildError('documentTools.bundle.errors.nothingSelected');
      return;
    }

    setBuilding(true);
    try {
      const parts: BundlePart[] = [];
      for (const document of chosen) {
        const part = await preparePart(document);
        if (part === 'needs_password') {
          setPasswordFor(document.id);
          setPassword('');
          return;
        }
        parts.push(part);
      }

      const maxBytes = bundleTargetBytes(maxKb, MAX_DERIVATIVE_BYTES);
      const result = await buildPdfBundle(parts, { maxBytes, allowRasterise });
      const compression = result.compression;
      const decrypted = chosen.filter((document) => passwords.current.has(document.id)).length;

      const recipe = new RecipeBuilder('pdf_studio', null)
        .add('merge', { files: chosen.length, set: setCode })
        .addIf(result.imageParts > 0, 'image_to_pdf', { files: result.imageParts })
        .addIf(decrypted > 0, 'decrypt', { files: decrypted })
        .addIf(Boolean(compression?.rasterised), 'rasterise', {
          dpi: compression?.dpi ?? 0,
          quality: compression?.jpegQuality ?? 0,
        })
        .addIf(maxBytes !== null, 'compress', { maxBytes: maxBytes ?? 0 })
        .build({
          mimeType: 'application/pdf',
          pageCount: result.pageCount,
          sourceCount: chosen.length,
        });

      const warnings: string[] = [];
      if (compression?.overLimit) warnings.push('documentTools.warnings.overLimit');
      if (compression?.rasterised) warnings.push('documentTools.pdf.rasterisedWarning');
      if (result.bytes.byteLength > MAX_DERIVATIVE_BYTES) {
        warnings.push('documentTools.warnings.tooLargeToSave');
      }

      setSummary({ documents: chosen.length, pages: result.pageCount, images: result.imageParts });
      setOutput({
        bytes: result.bytes,
        mimeType: 'application/pdf',
        // No customer name, as with every generated filename (see `derivativeFilename`).
        filename: sanitizeFilename(`document-bundle-${today.slice(0, 10)}.pdf`),
        widthPx: null,
        heightPx: null,
        recipe,
        window: maxBytes !== null ? { maxBytes } : {},
        warnings,
      });
    } catch (error) {
      const key = error instanceof Error ? error.message : '';
      setBuildError(
        key.startsWith('documentTools.') ? key : 'documentTools.errors.assembleFailed',
      );
    } finally {
      setBuilding(false);
    }
  }

  function submitPassword() {
    if (!passwordFor || password === '') return;
    passwords.current.set(passwordFor, password);
    setPassword('');
    void build();
  }

  const lockedDocument = passwordFor ? documentById.get(passwordFor) : null;
  const uploadHref = customerId
    ? `/documents/upload?customerId=${encodeURIComponent(customerId)}`
    : '/documents/upload';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr]">
      {header ? <div className="min-w-0 xl:col-start-1 xl:row-start-1">{header}</div> : null}

      <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-2">
        <ToolSection step={1} title={t('documentTools.bundle.customer')} hint={t('documentTools.bundle.customerHint')}>
          <Select
            aria-label={t('documentTools.bundle.customer')}
            value={customerId ?? ''}
            onChange={(event) => setCustomerId(event.target.value || null)}
          >
            <option value="">{t('documentTools.bundle.chooseCustomer')}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </Select>
          {!canReadDocuments ? (
            <Alert tone="warning">{t('documentTools.bundle.errors.noPermission')}</Alert>
          ) : null}
          {loadingDocuments ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner />
              {t('documentTools.bundle.loadingDocuments')}
            </div>
          ) : null}
          {listError ? <Alert tone="danger">{t(listError)}</Alert> : null}
        </ToolSection>

        <ToolSection step={2} icon={Layers} title={t('documentTools.bundle.set')} hint={t('documentTools.bundle.setHint')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('documentTools.bundle.set')}>
            {BUNDLE_TEMPLATES.map((template) => (
              <button
                key={template.code}
                type="button"
                role="radio"
                aria-checked={setCode === template.code}
                onClick={() => chooseSet(template.code)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors',
                  setCode === template.code
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                {locale === 'hi' ? template.labelHi : template.label}
              </button>
            ))}
            <span
              aria-hidden={setCode !== 'custom'}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium',
                setCode === 'custom'
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-dashed border-slate-200 text-slate-400',
              )}
            >
              {t('documentTools.bundle.custom')}
            </span>
          </div>
        </ToolSection>

        <ToolSection step={3} icon={Files} title={t('documentTools.bundle.documents')} hint={t('documentTools.bundle.documentsHint')}>
          {slots.length === 0 ? (
            <p className="text-sm text-slate-500">{t('documentTools.bundle.empty')}</p>
          ) : (
            <ol className="space-y-2">
              {slots.map((slot, index) => {
                const sameType = documents.filter((document) => document.documentType === slot.documentType);
                const others = documents.filter((document) => document.documentType !== slot.documentType);
                return (
                  <li
                    key={slot.key}
                    className={cn(
                      'flex flex-wrap items-center gap-2 rounded-xl border p-2.5 sm:flex-nowrap',
                      slot.included ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70',
                    )}
                  >
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-800">
                      {index + 1}
                    </span>
                    <input
                      type="checkbox"
                      checked={slot.included}
                      aria-label={`${t('documentTools.bundle.include')}: ${typeLabel(slot.documentType)}`}
                      onChange={(event) =>
                        updateSlots((previous) =>
                          previous.map((item) =>
                            item.key === slot.key ? { ...item, included: event.target.checked } : item,
                          ),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-slate-900">{typeLabel(slot.documentType)}</p>
                      {documents.length === 0 && !loadingDocuments ? (
                        <p className="text-xs text-amber-700">
                          {t('documentTools.bundle.notOnFile')} ·{' '}
                          <Link href={uploadHref} className="font-medium underline">
                            {t('documentTools.bundle.uploadMissing')}
                          </Link>
                        </p>
                      ) : (
                        <>
                          <Select
                            aria-label={`${t('documentTools.bundle.chooseDocument')}: ${typeLabel(slot.documentType)}`}
                            value={slot.documentId ?? ''}
                            onChange={(event) =>
                              updateSlots((previous) =>
                                previous.map((item) =>
                                  item.key === slot.key
                                    ? { ...item, documentId: event.target.value || null }
                                    : item,
                                ),
                              )
                            }
                            className="text-xs"
                          >
                            <option value="">
                              {slot.documentId ? t('documentTools.bundle.chooseDocument') : t('documentTools.bundle.notOnFile')}
                            </option>
                            {sameType.map((document) => (
                              <option key={document.id} value={document.id}>
                                {document.filename} · {document.createdAt.slice(0, 10)}
                              </option>
                            ))}
                            {others.length > 0 ? (
                              <optgroup label={t('documentTools.bundle.otherDocuments')}>
                                {others.map((document) => (
                                  <option key={document.id} value={document.id}>
                                    {typeLabel(document.documentType)} · {document.filename}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </Select>
                          {!slot.documentId ? (
                            <Link href={uploadHref} className="text-xs font-medium text-brand-700 underline">
                              {t('documentTools.bundle.uploadMissing')}
                            </Link>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton label={t('documentTools.bundle.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t('documentTools.bundle.moveDown')}
                        disabled={index === slots.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t('documentTools.bundle.remove')}
                        onClick={() => updateSlots((previous) => previous.filter((item) => item.key !== slot.key))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Plus className="h-4 w-4 text-brand-600" aria-hidden />
            <Select
              aria-label={t('documentTools.bundle.addDocument')}
              value=""
              onChange={(event) => {
                if (isDocumentType(event.target.value)) addSlot(event.target.value);
              }}
              className="max-w-xs text-xs"
            >
              <option value="">{t('documentTools.bundle.addDocument')}</option>
              {BUNDLE_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </Select>
          </label>
        </ToolSection>
      </div>

      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <ToolSection step={4} icon={Shrink} title={t('documentTools.bundle.targetSize')} hint={t('documentTools.bundle.targetHint')}>
          <div className="flex flex-wrap gap-1.5">
            {BUNDLE_SIZE_CHOICES_KB.map((kb) => (
              <button
                key={kb}
                type="button"
                aria-pressed={maxKb === kb}
                onClick={() => setMaxKb(kb)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  maxKb === kb
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
              </button>
            ))}
          </div>
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

          {lockedDocument ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                {t('documentTools.bundle.passwordFor', { name: lockedDocument.filename })}
              </p>
              <div className="flex items-end gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={t('documentTools.card.password')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitPassword();
                  }}
                  className="block w-full flex-1 rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
                />
                <Button size="sm" onClick={submitPassword}>
                  {t('documentTools.card.unlock')}
                </Button>
              </div>
              {passwordWrong ? (
                <p className="text-xs text-red-700">{t('documentTools.card.passwordIncorrect')}</p>
              ) : null}
            </div>
          ) : null}

          <Button
            className="w-full"
            loading={building}
            disabled={!customerId || !canReadDocuments || slots.length === 0}
            onClick={() => void build()}
          >
            {building ? t('documentTools.bundle.building') : t('documentTools.bundle.build')}
          </Button>
          {buildError ? <Alert tone="danger">{t(buildError)}</Alert> : null}
          {summary ? (
            <p className="text-xs text-slate-600">
              {t('documentTools.bundle.summary', { documents: summary.documents, pages: summary.pages })}
              {summary.images > 0 ? ` · ${t('documentTools.bundle.imagePagesNote')}` : ''}
            </p>
          ) : null}
          <p className="text-[11px] leading-snug text-slate-500">{t('documentTools.bundle.privacy')}</p>
        </ToolSection>

        <OutputPanel
          key={customerId ?? 'none'}
          step={5}
          icon={CircleCheck}
          previewable
          output={output}
          busy={building && output === null}
          customers={customers}
          defaultCustomerId={customerId}
        />
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
