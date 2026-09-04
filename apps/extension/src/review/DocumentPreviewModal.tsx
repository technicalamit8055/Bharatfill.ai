import { useEffect, useRef, useState } from 'react';
import type { DocumentCategory, DocumentPresetSummary } from '@assistigo/form-engine';
import { send } from '../shared/send';
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ExternalIcon,
  EyeIcon,
  FileTextIcon,
  ShieldIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../shared/Brand';

export type PreviewTarget = {
  id: string;
  kind: 'derivative' | 'source_document';
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  category: DocumentCategory;
  preset: DocumentPresetSummary | null;
};

type SignedPreview = { url: string; mimeType: string; filename: string };

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  photo: 'Photo',
  signature: 'Signature',
  pdf: 'PDF',
};

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
const FIT_ZOOM = 0 as const;

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** Green "meets requirement" or amber "does not match" — never a hard block, only a hint. */
function CompliancePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`compliance-pill ${ok ? 'compliance-pill-ok' : 'compliance-pill-warn'}`}>
      {ok ? <CheckIcon size={11} /> : <AlertIcon size={11} />}
      {label}
    </span>
  );
}

/**
 * A dedicated preview surface for one of the customer's documents, opened from the "Documents to
 * attach" list in the review panel and from the customer document picker. Bytes never reach this
 * component's own state beyond the `<img>` / iframe src: the background worker mints a
 * short-lived signed URL per open, same as a download.
 *
 * The attach control is optional, because two of the three ways in have nothing to attach to:
 * browsing the customer's vault with no upload box in mind, and looking at a file this
 * particular box would reject. Preview and Download stay available in both cases — being unable
 * to attach a file is no reason to be unable to look at it, and the operator can still upload it
 * by hand.
 */
export function DocumentPreviewModal({
  target,
  customerId,
  attached = false,
  attachDisabledReason = null,
  onToggleAttach,
  onClose,
}: {
  target: PreviewTarget;
  customerId: string | null;
  attached?: boolean;
  /** Why this file cannot go into this box. Set means the control is shown, but disabled. */
  attachDisabledReason?: string | null;
  /** Omitted when there is no upload box in play, which hides the control entirely. */
  onToggleAttach?: () => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<SignedPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'done'>('idle');
  const [zoomIndex, setZoomIndex] = useState<number>(ZOOM_STEPS.indexOf(1));
  const [fit, setFit] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoadError(null);

    void send<SignedPreview>({
      type: 'GET_DOCUMENT_PREVIEW',
      targetId: target.id,
      kind: target.kind,
    }).then((response) => {
      if (cancelled) return;
      if (response.ok) setPreview(response.data);
      else setLoadError('Could not load this preview. You can still download the file.');
    });

    return () => {
      cancelled = true;
    };
  }, [target.id, target.kind]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const zoom = fit ? FIT_ZOOM : (ZOOM_STEPS[zoomIndex] ?? 1);

  const zoomIn = () => {
    setFit(false);
    setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1));
  };
  const zoomOut = () => {
    setFit(false);
    setZoomIndex((index) => Math.max(index - 1, 0));
  };
  const zoomFit = () => {
    setFit(true);
    setPan({ x: 0, y: 0 });
  };
  const zoom100 = () => {
    setFit(false);
    setZoomIndex(ZOOM_STEPS.indexOf(1));
    setPan({ x: 0, y: 0 });
  };

  const onPanStart = (event: React.MouseEvent) => {
    if (fit) return;
    dragState.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
  };
  const onPanMove = (event: React.MouseEvent) => {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
  };
  const onPanEnd = () => {
    dragState.current = null;
  };

  const download = async () => {
    setDownloadState('working');
    const response =
      target.kind === 'derivative'
        ? await send({ type: 'DOWNLOAD_DERIVATIVE', derivativeId: target.id })
        : await send({ type: 'DOWNLOAD_DOCUMENT', documentId: target.id });
    setDownloadState(response.ok ? 'done' : 'idle');
    if (response.ok) setTimeout(() => setDownloadState('idle'), 2500);
  };

  const preset = target.preset;
  const sizeOk = preset
    ? (preset.maxBytes ? target.sizeBytes <= preset.maxBytes : true) &&
      (preset.minBytes ? target.sizeBytes >= preset.minBytes : true)
    : null;
  const dimensionsOk =
    preset && preset.widthPx && preset.heightPx && target.width && target.height
      ? target.width === preset.widthPx && target.height === preset.heightPx
      : null;
  const formatOk = preset ? true : null;

  const documentToolPath = (): string => {
    if (!customerId) return '/document-tools';
    const params = new URLSearchParams({ customerId });
    if (preset?.code) params.set('preset', preset.code);
    const tool = target.category === 'pdf' ? 'pdf-studio' : 'photo-signature';
    return `/document-tools/${tool}?${params.toString()}`;
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${target.filename}`}
      >
        <div className="modal-header">
          <span className="row" style={{ minWidth: 0, gap: 8 }}>
            <span className="modal-header__icon">
              {isImage(target.mimeType) ? <EyeIcon size={14} /> : <FileTextIcon size={14} />}
            </span>
            <span className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
              <span className="strong truncate" style={{ display: 'block' }}>
                {target.filename}
              </span>
              <span className="row tiny muted" style={{ gap: 6 }}>
                <span className="badge badge-brand">{CATEGORY_LABEL[target.category]}</span>
                <span className="badge badge-muted">
                  {target.kind === 'derivative' ? 'Prepared' : 'Original'}
                </span>
                <span>{formatKb(target.sizeBytes)}</span>
              </span>
            </span>
          </span>

          <span className="row" style={{ gap: 4, flexShrink: 0 }}>
            {preview ? (
              <a
                className="btn-ghost tiny"
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                title="Open in new tab"
              >
                <ExternalIcon size={13} />
              </a>
            ) : null}
            <button
              type="button"
              className="btn-ghost tiny"
              aria-label="Close preview"
              onClick={onClose}
            >
              <CloseIcon size={15} />
            </button>
          </span>
        </div>

        <div className="modal-body">
          {loadError ? (
            <div className="notice notice-danger">
              <AlertIcon size={13} />
              <span>{loadError}</span>
            </div>
          ) : !preview ? (
            <div className="preview-loading">
              <span className="spinner spinner-ink" />
              <span className="tiny muted">Loading preview…</span>
            </div>
          ) : isImage(preview.mimeType) ? (
            <>
              <div className="preview-toolbar">
                <button type="button" className="btn-ghost tiny" onClick={zoomFit}>
                  Fit
                </button>
                <button type="button" className="btn-ghost tiny" onClick={zoom100}>
                  100%
                </button>
                <button type="button" className="btn-ghost tiny" onClick={zoomOut} aria-label="Zoom out">
                  <ZoomOutIcon size={13} />
                </button>
                <span className="tiny muted" style={{ minWidth: 34, textAlign: 'center' }}>
                  {fit ? 'Fit' : `${Math.round((ZOOM_STEPS[zoomIndex] ?? 1) * 100)}%`}
                </span>
                <button type="button" className="btn-ghost tiny" onClick={zoomIn} aria-label="Zoom in">
                  <ZoomInIcon size={13} />
                </button>
              </div>

              <div
                className="preview-canvas"
                onMouseDown={onPanStart}
                onMouseMove={onPanMove}
                onMouseUp={onPanEnd}
                onMouseLeave={onPanEnd}
                style={{ cursor: fit ? 'default' : dragState.current ? 'grabbing' : 'grab' }}
              >
                <img
                  src={preview.url}
                  alt={target.filename}
                  draggable={false}
                  style={
                    fit
                      ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                      : {
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          transformOrigin: 'center',
                          maxWidth: 'none',
                          maxHeight: 'none',
                        }
                  }
                />
              </div>
            </>
          ) : (
            <div className="preview-pdf-card">
              <FileTextIcon size={28} />
              <p className="strong">{target.filename}</p>
              <p className="tiny muted">{formatKb(target.sizeBytes)} · PDF document</p>
              <a className="btn-secondary tiny" href={preview.url} target="_blank" rel="noreferrer">
                <ExternalIcon size={12} />
                Open in new tab
              </a>
            </div>
          )}

          {preset ? (
            <div className="stack-sm compliance-list">
              <h2>Portal requirement — {preset.portal}</h2>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {sizeOk !== null ? (
                  <CompliancePill
                    ok={sizeOk}
                    label={`Size ${formatKb(target.sizeBytes)}${
                      preset.maxBytes ? ` / ${formatKb(preset.maxBytes)} max` : ''
                    }`}
                  />
                ) : null}
                {dimensionsOk !== null ? (
                  <CompliancePill
                    ok={dimensionsOk}
                    label={`${target.width}×${target.height}px / ${preset.widthPx}×${preset.heightPx}px`}
                  />
                ) : null}
                {formatOk !== null ? (
                  <CompliancePill ok={formatOk} label={target.mimeType} />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          {onToggleAttach ? (
            <label
              className="row tiny"
              style={{ gap: 6, minWidth: 0 }}
              title={attachDisabledReason ?? undefined}
            >
              <input
                type="checkbox"
                checked={attached}
                disabled={Boolean(attachDisabledReason)}
                onChange={onToggleAttach}
              />
              <span className={attachDisabledReason ? 'muted truncate' : 'truncate'}>
                {attachDisabledReason ?? 'Attach to this field'}
              </span>
            </label>
          ) : (
            <span className="tiny muted truncate">Viewing only — no upload box selected.</span>
          )}

          <span className="row" style={{ gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="btn-secondary tiny"
              onClick={() => void download()}
              disabled={downloadState === 'working'}
            >
              {downloadState === 'working' ? (
                <span className="spinner spinner-ink" />
              ) : downloadState === 'done' ? (
                <CheckIcon size={12} />
              ) : (
                <DownloadIcon size={12} />
              )}
              {downloadState === 'done' ? 'Downloaded' : 'Download'}
            </button>
            {customerId ? (
              <a
                className="btn-ghost tiny"
                href={documentToolPath()}
                onClick={(event) => {
                  event.preventDefault();
                  void send({ type: 'OPEN_DASHBOARD', path: documentToolPath() });
                }}
              >
                Prepare in Studio
              </a>
            ) : null}
          </span>
        </div>

        <div className="notice notice-info modal-footnote">
          <ShieldIcon size={12} />
          <span>Accessed through a short-lived, audited link. It is never stored by the extension.</span>
        </div>
      </div>
    </div>
  );
}
