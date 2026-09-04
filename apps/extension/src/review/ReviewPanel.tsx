import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SKIP_REASON_LABELS,
  buildFillInstructions,
  confidenceBand,
  fileMatchesAccept,
  resolveFillValue,
  type AttachmentKind,
  type DetectedField,
  type DetectionPayload,
  type DocumentCategory,
  type DocumentPresetSummary,
  type DocumentSuggestion,
  type FieldMapping,
  type FileAttachmentRequest,
  type FillResult,
} from '@assistigo/form-engine';
import { send } from '../shared/send';
import { CustomerPicker } from '../shared/CustomerPicker';
import { RoamingAuthBanner } from '../shared/RoamingAuthBanner';
import { DocumentPreviewModal, type PreviewTarget } from './DocumentPreviewModal';
import {
  CustomerDocumentPickerModal,
  attachRejection,
  describeAccept,
  type PickerSlot,
} from './CustomerDocumentPickerModal';
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  DownloadIcon,
  ExternalIcon,
  EyeIcon,
  FolderIcon,
  Header,
  HelpIcon,
  LinkIcon,
  PaperclipIcon,
  RefreshIcon,
  ScanIcon,
  ShieldIcon,
  SparkIcon,
  Wordmark,
} from '../shared/Brand';
import type { CustomerDocument, CustomerSummary, SessionState } from '../shared/messages';

/** Faint dot grids and sparkles behind the connect screen's hero. Purely decorative. */
function ConnectDecor() {
  return (
    <svg className="connect-decor" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="connect-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="-20" y="10" width="90" height="90" fill="url(#connect-dots)" opacity="0.5" />
      <rect x="330" y="120" width="90" height="90" fill="url(#connect-dots)" opacity="0.5" />
      <path
        d="M20 90 Q 90 40 180 55"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.25"
        fill="none"
      />
      <rect
        x="336"
        y="16"
        width="30"
        height="38"
        rx="4"
        fill="none"
        stroke="currentColor"
        opacity="0.3"
      />
      <path
        d="M343 27h16M343 34h16M343 41h10"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
        strokeLinecap="round"
      />
      <path
        d="M56 18l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path d="M300 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="currentColor" opacity="0.3" />
      <path
        d="M250 20l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}

/** How-it-works illustration: profile data flows through a lock to fill the page safely. */
function ConnectIllustration() {
  return (
    <svg
      className="connect-illustration"
      viewBox="0 0 320 150"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="connect-lock-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0066ff" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path
        d="M50 120 Q 90 145 130 128"
        stroke="var(--brand-500)"
        strokeWidth="2"
        strokeDasharray="4 5"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M190 128 Q 230 145 270 120"
        stroke="var(--brand-500)"
        strokeWidth="2"
        strokeDasharray="4 5"
        fill="none"
        opacity="0.6"
      />

      <g>
        <rect
          x="70"
          y="8"
          width="180"
          height="96"
          rx="10"
          fill="var(--surface)"
          stroke="var(--line)"
        />
        <rect x="70" y="8" width="180" height="20" rx="10" fill="var(--line-soft)" />
        <rect x="70" y="18" width="180" height="10" fill="var(--line-soft)" />
        <circle cx="82" cy="18" r="2.5" fill="var(--line)" />
        <circle cx="90" cy="18" r="2.5" fill="var(--line)" />
        <circle cx="98" cy="18" r="2.5" fill="var(--line)" />
        <rect x="86" y="40" width="150" height="8" rx="4" fill="var(--brand-100)" />
        <rect x="86" y="56" width="100" height="8" rx="4" fill="var(--line-soft)" />
        <rect x="86" y="72" width="70" height="8" rx="4" fill="var(--line-soft)" />
        <rect x="86" y="88" width="115" height="8" rx="4" fill="var(--line-soft)" />
      </g>

      <g transform="translate(20,104)">
        <circle cx="20" cy="20" r="22" fill="var(--brand-50)" stroke="var(--brand-100)" />
        <circle cx="20" cy="15" r="6" fill="var(--brand-500)" />
        <path d="M9 30c1.5-6 6-9 11-9s9.5 3 11 9" fill="var(--brand-500)" />
      </g>

      <g transform="translate(138,100)">
        <rect x="0" y="0" width="44" height="44" rx="14" fill="url(#connect-lock-gradient)" />
        <rect x="14" y="21" width="16" height="13" rx="3" fill="#fff" />
        <path d="M17 21v-4a5 5 0 0 1 10 0v4" stroke="#fff" strokeWidth="2.5" fill="none" />
      </g>

      <g transform="translate(258,104)">
        <circle cx="20" cy="20" r="22" fill="var(--brand-50)" stroke="var(--brand-100)" />
        <path
          d="M20 8l11 4v8c0 8-4.7 13.6-11 16-6.3-2.4-11-8-11-16v-8l11-4Z"
          fill="var(--brand-500)"
        />
        <path
          d="m14.5 20 3.6 3.6 7-7"
          stroke="#fff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

type Proposal = {
  fillSessionId: string;
  mappings: FieldMapping[];
  values: Record<string, string>;
  /** Signatures in the order they must be written — parents of dependent dropdowns first. */
  fillOrder?: string[];
  documentSuggestions?: DocumentSuggestion[];
};

const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  photo: 'Photo',
  signature: 'Signature',
  pdf: 'PDF',
};

/**
 * One upload box's chosen file, as the panel holds it before Fill.
 *
 * More than the id, because two things need the rest of it: `APPLY_FILL` needs `kind` to know
 * which signed-URL route reaches the bytes, and a file chosen out of the customer vault has to
 * be nameable in the card even though it appears in no suggestion list. `manual` is what tells
 * the two apart — a ticked suggestion can be described from the suggestion itself, an override
 * cannot.
 */
type AttachmentChoice = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  manual: boolean;
};

/** A file the operator picked out of the vault, in the shape an attachment choice needs. */
function choiceFromDocument(doc: CustomerDocument): AttachmentChoice {
  return {
    id: doc.id,
    kind: doc.kind,
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    manual: true,
  };
}

/** The tool that owns a category, and the path its page reads a preset from (§13.2). */
function documentToolPath(
  category: DocumentCategory,
  customerId: string,
  presetCode: string | null,
): string {
  const params = new URLSearchParams({ customerId });
  if (presetCode) params.set('preset', presetCode);
  const tool = category === 'pdf' ? 'pdf-studio' : 'photo-signature';
  return `/document-tools/${tool}?${params.toString()}`;
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/** "20–50 KB", "up to 50 KB" or "at least 20 KB" — whatever the notice actually stated. */
function formatSizeRange(preset: DocumentPresetSummary): string | null {
  if (preset.minBytes && preset.maxBytes)
    return `${formatKb(preset.minBytes)}–${formatKb(preset.maxBytes)}`;
  if (preset.maxBytes) return `up to ${formatKb(preset.maxBytes)}`;
  if (preset.minBytes) return `at least ${formatKb(preset.minBytes)}`;
  return null;
}

function formatDimensions(preset: DocumentPresetSummary): string | null {
  if (preset.widthPx && preset.heightPx) return `${preset.widthPx}×${preset.heightPx}px`;
  if (preset.widthMm && preset.heightMm) return `${preset.widthMm}×${preset.heightMm}mm`;
  return null;
}

function formatPresetConstraints(preset: DocumentPresetSummary): string {
  return [
    formatSizeRange(preset),
    formatDimensions(preset),
    preset.dpi ? `${preset.dpi} DPI` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The file an operator put into one upload box by hand, named in the card it belongs to.
 *
 * A manual pick has to be shown somewhere: an override for a box that had suggestions is not in
 * the suggestion list, and a box that had none has no list at all. Without this the operator
 * presses Fill with no visible sign of what they chose.
 */
function ChosenFileCard({
  choice,
  badge,
  clearLabel,
  onClear,
}: {
  choice: AttachmentChoice;
  badge: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="attach-chosen">
      <span className="attach-chosen__body">
        <span className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
          <span className="badge badge-brand">{badge}</span>
          <span className="badge badge-muted">
            {choice.kind === 'derivative' ? 'Prepared' : 'Original'}
          </span>
        </span>
        <span className="tiny truncate" style={{ display: 'block', marginTop: 3 }}>
          {choice.filename} · {formatKb(choice.sizeBytes)}
        </span>
      </span>
      <button type="button" className="btn-ghost tiny" onClick={onClear} style={{ flexShrink: 0 }}>
        {clearLabel}
      </button>
    </div>
  );
}

type Stage = 'idle' | 'detecting' | 'reviewing' | 'filling' | 'done';

const BAND_BADGE: Record<ReturnType<typeof confidenceBand>, string> = {
  high: 'badge-ok',
  medium: 'badge-warn',
  low: 'badge-danger',
};

function fieldLabel(field: DetectedField | undefined): string {
  return (
    field?.labelText ?? field?.ariaLabel ?? field?.placeholder ?? field?.name ?? 'Unnamed field'
  );
}

export function ReviewPanel() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [detection, setDetection] = useState<DetectionPayload | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  /**
   * Which file the operator chose for each upload box, keyed by field signature.
   *
   * Starts empty and stays empty unless someone chooses one: a mapped text value is a proposal
   * the engine can defend, but putting a particular document into a particular upload slot is a
   * judgement about what this portal is asking for, so nothing is attached by default (§7.4.5).
   * One file per box, because a portal's upload input takes one.
   */
  const [attachments, setAttachments] = useState<Record<string, AttachmentChoice>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [results, setResults] = useState<FillResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  /** File id → transient state, while a row's own Download button is fetching or just finished. */
  const [downloadStates, setDownloadStates] = useState<Record<string, 'working' | 'done'>>({});
  const [previewTarget, setPreviewTarget] = useState<
    (PreviewTarget & { signature: string }) | null
  >(null);
  /**
   * The document picker, when it is open. `slot` null means the operator opened the customer
   * vault to look around rather than to fill a particular upload box.
   */
  const [picker, setPicker] = useState<{ slot: PickerSlot | null } | null>(null);

  const refreshSession = useCallback(async () => {
    const response = await send<SessionState>({ type: 'GET_SESSION' });
    setSession(response.ok ? response.data : null);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Pairing happens in a dashboard tab; re-check when the panel regains focus.
  useEffect(() => {
    const onFocus = () => void refreshSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSession]);

  // `ui.css` gives Devanagari a taller line-height via `html[lang='hi'] body` (spec §20.3).
  useEffect(() => {
    if (session?.locale) document.documentElement.lang = session.locale;
  }, [session?.locale]);

  const fieldBySignature = useMemo(
    () => new Map((detection?.fields ?? []).map((field) => [field.signature, field])),
    [detection],
  );

  const fillable = useMemo(
    () =>
      (proposal?.mappings ?? []).filter(
        (mapping) =>
          mapping.customerField !== null &&
          (mapping.skipReason === undefined || mapping.skipReason === 'low_confidence'),
      ),
    [proposal],
  );

  const blocked = useMemo(
    () => (proposal?.mappings ?? []).filter((mapping) => mapping.safetyClass !== 'normal'),
    [proposal],
  );

  /**
   * Every upload box the operator can see on this page.
   *
   * Not the same set as `documentSuggestions`: the server only suggests for a box whose category
   * it could infer, and a portal that labels one "any other supporting document" — or labels it
   * in Devanagari the category words do not cover — gets no suggestion card at all. Those boxes
   * still exist, and the operator can still put a file in one by hand, so they are listed too.
   *
   * Invisible file inputs are excluded here as they are server-side: a portal's hidden
   * representative-authorization widget is not something anybody can attach to.
   */
  const uploadFields = useMemo(
    () =>
      (detection?.fields ?? []).filter(
        (field) => field.inputType.toLowerCase() === 'file' && field.visible !== false,
      ),
    [detection],
  );

  const suggestedUploadSignatures = useMemo(
    () => new Set((proposal?.documentSuggestions ?? []).map((suggestion) => suggestion.signature)),
    [proposal],
  );

  const unmatchedUploads = useMemo(
    () => uploadFields.filter((field) => !suggestedUploadSignatures.has(field.signature)),
    [uploadFields, suggestedUploadSignatures],
  );

  const detect = async () => {
    setStage('detecting');
    setError(null);
    setResults(null);
    setReported(false);
    // A fresh reading of the page invalidates edits keyed to the previous detection's signatures.
    setEdits({});
    setAttachments({});
    setPreviewTarget(null);
    setPicker(null);

    const detected = await send<DetectionPayload>({ type: 'DETECT_FIELDS' });
    if (!detected.ok) {
      setError('Could not read this page. Open a form page and try again.');
      setStage('idle');
      return;
    }
    setDetection(detected.data);

    const mapped = await send<Proposal>({ type: 'REQUEST_MAPPING' });
    if (!mapped.ok) {
      setError(
        mapped.error === 'no_customer_selected'
          ? 'Select a customer first.'
          : 'Could not work out what goes where. You can still fill this form by hand.',
      );
      setStage('idle');
      return;
    }

    setProposal(mapped.data);
    // Fields that need review start unticked, so the operator has to look at them.
    setApproved(
      new Set(
        mapped.data.mappings
          .filter(
            (mapping) =>
              mapping.customerField !== null &&
              mapping.skipReason === undefined &&
              !mapping.reviewRequired,
          )
          .map((mapping) => mapping.signature),
      ),
    );
    setStage('reviewing');
  };

  const fill = async () => {
    if (!proposal) return;
    setStage('filling');

    /*
     * Built by the form engine, not here. Hand-rolling the instruction list in this component
     * meant the named transforms never ran on the real fill path: a date of birth reached the
     * portal as 1998-07-14 instead of 14/07/1998, and a gender as "male" instead of "Male".
     * It also skipped the second safety re-check and the dependent-dropdown ordering.
     */
    const instructions = buildFillInstructions(
      proposal.mappings,
      proposal.values,
      approved,
      detection?.fields ?? [],
      { edits, ...(proposal.fillOrder ? { order: proposal.fillOrder } : {}) },
    );

    /*
     * Only chosen files, and only for upload boxes the latest detection still reports — keyed off
     * the detected fields rather than off `documentSuggestions`, because a file picked out of the
     * customer vault can be assigned to a box the server never suggested anything for.
     *
     * `kind` travels with each one: an original upload and a prepared derivative are reached
     * through different signed-URL routes, and the worker cannot tell which is which from a uuid.
     * The bytes are not here and never reach this panel — the worker fetches each file through a
     * signed URL at the moment of the fill.
     */
    const attachableSignatures = new Set(uploadFields.map((field) => field.signature));
    const attachmentRequests: FileAttachmentRequest[] = Object.entries(attachments).flatMap(
      ([signature, choice]) =>
        attachableSignatures.has(signature)
          ? [{ signature, targetId: choice.id, kind: choice.kind }]
          : [],
    );

    const response = await send<{ results: FillResult[] }>({
      type: 'APPLY_FILL',
      instructions,
      ...(attachmentRequests.length > 0 ? { attachments: attachmentRequests } : {}),
    });

    if (!response.ok) {
      setError('The fill did not complete. Nothing was submitted.');
      setStage('reviewing');
      return;
    }

    setResults(response.data.results);
    setStage('done');
  };

  // Re-checks the paired session and, if a page has already been read, re-reads it — so a
  // stale customer selection or a form that changed after detection can be caught without a
  // full disconnect/reconnect.
  const refresh = async () => {
    await refreshSession();
    if (proposal) await detect();
  };

  /** Choosing a second file for the same box replaces the first — an upload input takes one. */
  const chooseAttachment = (signature: string, choice: AttachmentChoice) => {
    setAttachments((current) => {
      const next = { ...current };
      if (next[signature]?.id === choice.id) delete next[signature];
      else next[signature] = choice;
      return next;
    });
  };

  /** Reverts a box to attaching nothing, which is also how an override goes back to auto. */
  const clearAttachment = (signature: string) => {
    setAttachments((current) => {
      if (current[signature] === undefined) return current;
      const next = { ...current };
      delete next[signature];
      return next;
    });
  };

  /** The upload box a picker session is about, described from the latest detection. */
  const slotFor = (
    field: DetectedField | undefined,
    suggestion?: DocumentSuggestion,
  ): PickerSlot | null =>
    field
      ? {
          signature: field.signature,
          label: fieldLabel(field),
          accept: field.accept,
          category: suggestion?.category ?? null,
          preset: suggestion?.preset ?? null,
        }
      : null;

  const downloadFile = async (id: string, kind: 'derivative' | 'source_document') => {
    setDownloadStates((current) => ({ ...current, [id]: 'working' }));
    const response =
      kind === 'derivative'
        ? await send({ type: 'DOWNLOAD_DERIVATIVE', derivativeId: id })
        : await send({ type: 'DOWNLOAD_DOCUMENT', documentId: id });

    if (!response.ok) {
      setDownloadStates((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }

    setDownloadStates((current) => ({ ...current, [id]: 'done' }));
    setTimeout(() => {
      setDownloadStates((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, 2500);
  };

  const toggle = (signature: string) => {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(signature)) next.delete(signature);
      else next.add(signature);
      return next;
    });
  };

  const allSelected = fillable.length > 0 && approved.size === fillable.length;

  const toggleAll = () => {
    setApproved(allSelected ? new Set() : new Set(fillable.map((m) => m.signature)));
  };

  if (!session?.connected) {
    return (
      <div className="app">
        <div className="connect-hero">
          <ConnectDecor />

          <div className="connect-logo">
            <Wordmark height={72} className="connect-logo__image" />
          </div>

          <div className="connect-copy">
            <h1 className="connect-heading">
              Review and fill, <span className="gradient-text">safely</span>
            </h1>
            <p className="small muted">
              Connect your Bharatfill account to fill this page from a saved customer profile.
            </p>
          </div>

          <ConnectIllustration />

          <button
            type="button"
            className="btn-primary btn-block"
            onClick={() => void send({ type: 'CONNECT_ACCOUNT' })}
          >
            <LinkIcon size={16} />
            Connect account
            <ArrowIcon size={14} />
          </button>

          <div className="safety-card">
            <span className="safety-card__icon">
              <ShieldIcon size={17} />
            </span>
            <div className="safety-card__body">
              <p className="strong">Your data is safe with Bharatfill</p>
              <p className="small muted">
                You sign in on the Bharatfill dashboard. Your password is never typed into this
                extension.
              </p>
            </div>
          </div>
        </div>

        <hr className="divider" />

        <div className="connect-footer">
          <button type="button" className="btn-ghost connect-footer__link">
            <HelpIcon size={13} />
            Need help?
          </button>
          <span className="connect-footer__divider" aria-hidden="true" />
          <button
            type="button"
            className="btn-ghost connect-footer__link connect-footer__link--accent"
          >
            Learn more
            <ExternalIcon size={12} />
          </button>
        </div>
      </div>
    );
  }

  const filledCount = results?.filter((result) => result.action === 'filled').length ?? 0;
  const skippedCount = results?.filter((result) => result.action === 'skipped').length ?? 0;
  const failedCount = results?.filter((result) => result.action === 'failed').length ?? 0;
  const totalResults = filledCount + skippedCount + failedCount;

  return (
    <div className="app">
      <Header
        right={
          <div className="row" style={{ minWidth: 0, gap: 6 }}>
            <button
              type="button"
              className="btn-ghost tiny"
              style={{ padding: 6, flexShrink: 0 }}
              title="Refresh"
              aria-label="Refresh"
              disabled={stage === 'detecting' || stage === 'filling'}
              onClick={() => void refresh()}
            >
              <RefreshIcon size={14} className={stage === 'detecting' ? 'icon-spin' : undefined} />
            </button>
            <button
              type="button"
              className="btn-ghost tiny"
              style={{ padding: 6, flexShrink: 0 }}
              title="Open dashboard"
              aria-label="Open dashboard"
              onClick={() => void send({ type: 'OPEN_DASHBOARD' })}
            >
              <ExternalIcon size={14} />
            </button>
            <span className="badge badge-brand truncate">{session.organizationName}</span>
          </div>
        }
      />

      <div className="panel stack">
        <div className="spread">
          <span className="small muted truncate">{session.role}</span>
          <button
            type="button"
            className="btn-danger-ghost tiny"
            onClick={async () => {
              await send({ type: 'DISCONNECT' });
              await refreshSession();
            }}
          >
            Disconnect
          </button>
        </div>

        <CustomerPicker
          selected={session.selectedCustomer}
          onSelect={async (customer: CustomerSummary) => {
            await send({ type: 'SELECT_CUSTOMER', customer });
            await refreshSession();
            setProposal(null);
            setResults(null);
            setStage('idle');
          }}
        />

        {session.selectedCustomer?.isRoaming ? (
          <RoamingAuthBanner
            customer={session.selectedCustomer}
            onChange={() => void refreshSession()}
          />
        ) : null}

        {/*
          * Available before the page has even been read: an operator often wants to check what
          * the citizen already has on file before deciding which form to open. Disabled for a
          * roaming customer until the citizen has consented — their files are not readable yet,
          * and an empty vault would read as "they have none" (migration 0024).
          */}
        {session.selectedCustomer ? (
          <button
            type="button"
            className="btn-ghost tiny btn-block"
            disabled={
              session.selectedCustomer.isRoaming &&
              session.selectedCustomer.accessStatus !== 'granted'
            }
            onClick={() => setPicker({ slot: null })}
          >
            <FolderIcon size={13} />
            Customer vault — all saved documents
          </button>
        ) : null}

        {error ? (
          <div className="notice notice-danger">
            <AlertIcon size={13} />
            <span>{error}</span>
          </div>
        ) : null}

        {stage === 'idle' || stage === 'detecting' ? (
          <>
            {!proposal ? (
              <div className="card empty">
                <div className="empty-art">
                  <ScanIcon size={20} />
                </div>
                <p className="strong">Nothing detected yet</p>
                <p className="tiny muted" style={{ marginTop: 2 }}>
                  Open the form you want to fill, then read the page.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              className="btn-primary btn-block"
              disabled={
                !session.selectedCustomer ||
                stage === 'detecting' ||
                // A roaming customer's fields cannot be read until the citizen has consented —
                // detecting is harmless, but requesting the mapping would just fail server-side,
                // so the button stays disabled until the banner above reports an active session.
                (session.selectedCustomer.isRoaming &&
                  session.selectedCustomer.accessStatus !== 'granted')
              }
              onClick={() => void detect()}
            >
              {stage === 'detecting' ? (
                <>
                  <span className="spinner" />
                  Reading the page…
                </>
              ) : (
                <>
                  <ScanIcon size={15} />
                  Detect fields
                </>
              )}
            </button>
          </>
        ) : null}

        {proposal && stage !== 'done' ? (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-value">{detection?.fields.length ?? 0}</div>
                <div className="stat-label">detected</div>
              </div>
              <div className="stat">
                <div className="stat-value">{fillable.length}</div>
                <div className="stat-label">mappable</div>
              </div>
              <div className="stat">
                <div className="stat-value gradient-text">{approved.size}</div>
                <div className="stat-label">selected</div>
              </div>
            </div>

            {blocked.length > 0 ? (
              <div className="notice notice-warn">
                <ShieldIcon size={13} />
                <span>
                  {blocked.length} field{blocked.length === 1 ? '' : 's'} must be filled by you:{' '}
                  {blocked
                    .map((mapping) => SKIP_REASON_LABELS[mapping.skipReason ?? 'no_mapping'].en)
                    .join(', ')}
                  .
                </span>
              </div>
            ) : null}

            {proposal.documentSuggestions && proposal.documentSuggestions.length > 0 ? (
              <>
                <h2>Documents to attach</h2>
                <div className="card card-flush">
                  {proposal.documentSuggestions.map((suggestion) => {
                    const docField = fieldBySignature.get(suggestion.signature);
                    const chosen = attachments[suggestion.signature];
                    const constraints = suggestion.preset
                      ? formatPresetConstraints(suggestion.preset)
                      : null;

                    return (
                      <div key={suggestion.signature} className="field-row">
                        <span className="spread">
                          <span className="strong truncate">{fieldLabel(docField)}</span>
                          <span className="badge badge-brand">
                            {DOCUMENT_CATEGORY_LABEL[suggestion.category]}
                          </span>
                        </span>

                        {suggestion.preset ? (
                          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                            {suggestion.preset.portal} · {suggestion.preset.label}
                            {constraints ? ` · ${constraints}` : ''}
                          </p>
                        ) : null}

                        {suggestion.suggestions.length > 0 ? (
                          <div className="stack-sm" style={{ marginTop: 7 }}>
                            {suggestion.suggestions.map((file) => {
                              // The box's own `accept` decides. A file it would reject can still
                              // be downloaded, but not ticked for attaching.
                              const accepted = fileMatchesAccept(docField?.accept, file);
                              const ticked = chosen?.id === file.id;
                              const downloadState = downloadStates[file.id];
                              const kind = file.kind ?? 'derivative';

                              return (
                                <div key={file.id} className="spread">
                                  <label
                                    className="tiny truncate grow"
                                    style={{
                                      minWidth: 0,
                                      display: 'flex',
                                      gap: 6,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={ticked}
                                      disabled={!accepted}
                                      onChange={() =>
                                        chooseAttachment(suggestion.signature, {
                                          id: file.id,
                                          kind,
                                          filename: file.filename,
                                          sizeBytes: file.sizeBytes,
                                          mimeType: file.mimeType,
                                          manual: false,
                                        })
                                      }
                                    />
                                    <span className="badge badge-muted" style={{ flexShrink: 0 }}>
                                      {kind === 'derivative' ? 'Prepared' : 'Original'}
                                    </span>
                                    <span className="truncate">
                                      {file.filename} · {formatKb(file.sizeBytes)}
                                      {file.matchesPreset ? ' · matches this portal' : ''}
                                      {accepted ? '' : ' · this box does not accept this type'}
                                    </span>
                                  </label>
                                  <span className="row" style={{ gap: 4, flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      className="btn-ghost tiny"
                                      onClick={() =>
                                        setPreviewTarget({
                                          signature: suggestion.signature,
                                          id: file.id,
                                          kind,
                                          filename: file.filename,
                                          sizeBytes: file.sizeBytes,
                                          width: file.width,
                                          height: file.height,
                                          mimeType: file.mimeType,
                                          category: suggestion.category,
                                          preset: suggestion.preset,
                                        })
                                      }
                                    >
                                      <EyeIcon size={12} />
                                      Preview
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-ghost tiny"
                                      disabled={downloadState === 'working'}
                                      onClick={() => void downloadFile(file.id, kind)}
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
                                  </span>
                                </div>
                              );
                            })}
                            <p className="tiny muted" style={{ margin: '2px 0 0' }}>
                              Tick a file to attach it to this upload box when you press Fill.
                            </p>
                          </div>
                        ) : (
                          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                            No prepared file on this customer&rsquo;s profile yet.
                          </p>
                        )}

                        {/*
                         * An override is not in the list above, so it is named here or nowhere.
                         * Reverting drops back to no attachment, which is where a suggestion
                         * card starts — the suggestions themselves are still right there to tick.
                         */}
                        {chosen?.manual ? (
                          <ChosenFileCard
                            choice={chosen}
                            badge="Override"
                            clearLabel="Use a suggestion instead"
                            onClear={() => clearAttachment(suggestion.signature)}
                          />
                        ) : null}

                        {session.selectedCustomer ? (
                          <div className="stack-sm" style={{ marginTop: 7 }}>
                            <button
                              type="button"
                              className="btn-ghost tiny btn-block"
                              disabled={!docField}
                              onClick={() => setPicker({ slot: slotFor(docField, suggestion) })}
                            >
                              <PaperclipIcon size={12} />
                              Choose another file from customer profile…
                            </button>
                            <button
                              type="button"
                              className="btn-secondary tiny btn-block"
                              onClick={() =>
                                void send({
                                  type: 'OPEN_DASHBOARD',
                                  path: documentToolPath(
                                    suggestion.category,
                                    session.selectedCustomer!.id,
                                    suggestion.preset?.code ?? null,
                                  ),
                                })
                              }
                            >
                              <ExternalIcon size={12} />
                              Prepare in Document Tools Studio
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {/*
              * Upload boxes the server had nothing to say about — an unlabelled input, a label
              * in a script the category words do not cover, or a portal's own catch-all "any
              * other supporting document". There is no suggestion to offer, but the operator can
              * still put a file in one, and cannot do that at all if the box is never listed.
              */}
            {unmatchedUploads.length > 0 && session.selectedCustomer ? (
              <>
                <h2>Other upload boxes</h2>
                <div className="card card-flush">
                  {unmatchedUploads.map((field) => {
                    const chosen = attachments[field.signature];
                    const acceptPhrase = describeAccept(field.accept);

                    return (
                      <div key={field.signature} className="field-row">
                        <span className="spread">
                          {/* Host-page text, rendered as text — never as markup (§19.6). */}
                          <span className="strong truncate">{fieldLabel(field)}</span>
                          <span className="badge badge-muted">Upload</span>
                        </span>

                        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                          Nothing suggested for this one
                          {acceptPhrase ? ` — it accepts ${acceptPhrase}` : ''}. Pick a file
                          yourself if the portal asks for one.
                        </p>

                        {chosen ? (
                          <ChosenFileCard
                            choice={chosen}
                            badge="Selected"
                            clearLabel="Remove"
                            onClear={() => clearAttachment(field.signature)}
                          />
                        ) : null}

                        <button
                          type="button"
                          className="btn-secondary tiny btn-block"
                          style={{ marginTop: 7 }}
                          onClick={() => setPicker({ slot: slotFor(field) })}
                        >
                          <PaperclipIcon size={12} />
                          {chosen
                            ? 'Choose a different file…'
                            : 'Choose a file from customer profile…'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {fillable.length > 0 ? (
              <div className="spread">
                <h2>Fields to fill</h2>
                <button type="button" className="btn-ghost tiny" onClick={toggleAll}>
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
            ) : null}

            <div className="card card-flush">
              {fillable.length === 0 ? (
                <div className="empty">
                  <div className="empty-art">
                    <SparkIcon size={20} />
                  </div>
                  <p className="strong">No matches on this page</p>
                  <p className="tiny muted" style={{ marginTop: 2 }}>
                    Nothing here matches this customer&rsquo;s saved details. Report the form and it
                    can be supported.
                  </p>
                </div>
              ) : (
                fillable.map((mapping) => {
                  const field = fieldBySignature.get(mapping.signature);
                  const band = confidenceBand(mapping.confidence);
                  const ticked = approved.has(mapping.signature);
                  // What will actually be typed, transform included — not the raw profile value.
                  const value = resolveFillValue(mapping, proposal.values, edits) ?? '';

                  const rowClass = [
                    'field-row',
                    mapping.reviewRequired ? 'field-row-review' : '',
                    ticked ? '' : 'field-row-off',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div key={mapping.signature} className={rowClass}>
                      <label className="field-head">
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() => toggle(mapping.signature)}
                          style={{ marginTop: 2 }}
                        />
                        <span className="grow">
                          <span className="spread">
                            {/* Host-page text, rendered as text — never as markup (§19.6). */}
                            <span className="strong truncate">{fieldLabel(field)}</span>
                            <span className={`badge ${BAND_BADGE[band]}`}>
                              {Math.round(mapping.confidence * 100)}%
                            </span>
                          </span>
                          <span className="field-key truncate" style={{ display: 'block' }}>
                            {mapping.customerField} · {mapping.source}
                          </span>
                        </span>
                      </label>

                      <input
                        type="text"
                        value={value}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [mapping.signature]: event.target.value,
                          }))
                        }
                        style={{ marginTop: 7 }}
                        aria-label={`Value for ${fieldLabel(field)}`}
                      />

                      {mapping.reviewRequired ? (
                        <p
                          className="tiny row"
                          style={{ color: 'var(--warn)', margin: '5px 0 0', gap: 5 }}
                        >
                          <AlertIcon size={12} />
                          Check this one before filling.
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="btn-primary btn-block"
              disabled={approved.size === 0 || stage === 'filling'}
              onClick={() => void fill()}
            >
              {stage === 'filling' ? (
                <>
                  <span className="spinner" />
                  Filling…
                </>
              ) : (
                <>
                  <CheckIcon size={15} />
                  {`Fill ${approved.size} field${approved.size === 1 ? '' : 's'}`}
                </>
              )}
            </button>

            <div className="notice notice-info">
              <ShieldIcon size={13} />
              <span>
                Bharatfill fills the fields you ticked. Check the form, complete any CAPTCHA or OTP
                yourself, then press the portal&rsquo;s own submit button.
              </span>
            </div>
          </>
        ) : null}

        {stage === 'done' && results ? (
          <>
            <div className="card-glow stack">
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-value" style={{ color: 'var(--ok)' }}>
                    {filledCount}
                  </div>
                  <div className="stat-label">filled</div>
                </div>
                <div className="stat">
                  <div className="stat-value muted">{skippedCount}</div>
                  <div className="stat-label">skipped</div>
                </div>
                <div className="stat">
                  <div
                    className="stat-value"
                    style={{ color: failedCount > 0 ? 'var(--danger)' : undefined }}
                  >
                    {failedCount}
                  </div>
                  <div className="stat-label">failed</div>
                </div>
              </div>

              <div
                className="meter"
                role="img"
                aria-label={`${filledCount} of ${totalResults} fields filled`}
              >
                <span
                  style={{
                    width: totalResults === 0 ? '0%' : `${(filledCount / totalResults) * 100}%`,
                  }}
                />
              </div>

              <div className="notice notice-warn">
                <ShieldIcon size={13} />
                <span>Nothing has been submitted. Review the form and press submit yourself.</span>
              </div>

              {results.some((result) => result.action === 'skipped' && result.skipReason) ? (
                <div className="stack-sm">
                  <h2>Skipped</h2>
                  {results
                    .filter((result) => result.action === 'skipped' && result.skipReason)
                    .map((result) => (
                      <p key={result.signature} className="tiny muted truncate">
                        {fieldLabel(fieldBySignature.get(result.signature))} —{' '}
                        {SKIP_REASON_LABELS[result.skipReason!].en}
                      </p>
                    ))}
                </div>
              ) : null}

              {/*
               * A failed row is mostly an upload box whose file could not be attached. Naming it
               * matters more than the count does: a ticked document the operator hears nothing
               * about reads as attached, and the application goes in incomplete.
               */}
              {results.some((result) => result.action === 'failed') ? (
                <div className="stack-sm">
                  <h2>Not filled</h2>
                  {results
                    .filter((result) => result.action === 'failed')
                    .map((result) => (
                      <p
                        key={result.signature}
                        className="tiny truncate"
                        style={{ color: 'var(--danger)' }}
                      >
                        {fieldLabel(fieldBySignature.get(result.signature))} — do this one by hand
                      </p>
                    ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="btn-secondary btn-block"
              onClick={() =>
                void send({
                  type: 'CREATE_APPLICATION',
                  title: detection?.page.title?.slice(0, 160) ?? 'Application',
                })
              }
            >
              Save as an application
            </button>

            <button
              type="button"
              className="btn-ghost small btn-block"
              onClick={() => setStage('reviewing')}
            >
              Back to review
            </button>
          </>
        ) : null}

        {proposal ? (
          <>
            <hr className="divider" />
            <button
              type="button"
              className="btn-ghost tiny btn-block"
              disabled={reported}
              onClick={async () => {
                const response = await send({
                  type: 'REPORT_FORM',
                  note: 'Reported from the review panel',
                  includeScreenshot: false,
                });
                if (response.ok) setReported(true);
              }}
            >
              {reported ? 'Reported — thank you' : 'Report this form'}
            </button>
          </>
        ) : null}
      </div>

      {previewTarget ? (
        <DocumentPreviewModal
          target={previewTarget}
          customerId={session.selectedCustomer?.id ?? null}
          attached={attachments[previewTarget.signature]?.id === previewTarget.id}
          attachDisabledReason={attachRejection(
            fieldBySignature.get(previewTarget.signature)?.accept,
            previewTarget,
          )}
          onToggleAttach={() =>
            chooseAttachment(previewTarget.signature, {
              id: previewTarget.id,
              kind: previewTarget.kind,
              filename: previewTarget.filename,
              sizeBytes: previewTarget.sizeBytes,
              mimeType: previewTarget.mimeType,
              manual: false,
            })
          }
          onClose={() => setPreviewTarget(null)}
        />
      ) : null}

      {picker && session.selectedCustomer ? (
        <CustomerDocumentPickerModal
          customerId={session.selectedCustomer.id}
          slot={picker.slot}
          selectedId={picker.slot ? (attachments[picker.slot.signature]?.id ?? null) : null}
          onSelect={(doc) => {
            if (!picker.slot) return;
            const { signature } = picker.slot;
            /*
             * A pick that happens to be one of this box's own suggestions is not an override —
             * it ticks the row already on screen. Marking it manual anyway would name the same
             * file twice, once in the list and once in an "Override" card above it.
             */
            const suggested = (proposal?.documentSuggestions ?? [])
              .find((suggestion) => suggestion.signature === signature)
              ?.suggestions.some((file) => file.id === doc.id);
            chooseAttachment(signature, {
              ...choiceFromDocument(doc),
              manual: suggested !== true,
            });
          }}
          onClear={() => {
            if (picker.slot) clearAttachment(picker.slot.signature);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
