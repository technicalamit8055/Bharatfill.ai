import { useEffect, useMemo, useState } from 'react';
import {
  fileMatchesAccept,
  type DocumentCategory,
  type DocumentPresetSummary,
} from '@assistigo/form-engine';
import { send } from '../shared/send';
import { DocumentPreviewModal, type PreviewTarget } from './DocumentPreviewModal';
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  SearchIcon,
  ShieldIcon,
} from '../shared/Brand';
import type { CustomerDocument } from '../shared/messages';

/**
 * The upload box a pick is being made for, or `null` to browse the vault with nothing to attach
 * to. Everything here is metadata the latest detection already reported — `accept` is the
 * portal's own word on what it will take, and it is the only thing that can veto a manual pick.
 */
export type PickerSlot = {
  signature: string;
  label: string;
  accept: string | null;
  /** What the matcher inferred this box wants, when it could infer anything. */
  category: DocumentCategory | null;
  preset: DocumentPresetSummary | null;
};

/**
 * English labels for `documents.document_type`.
 *
 * Deliberately a local copy of the English half of `DOCUMENT_TYPE_LABELS` rather than an import
 * from `@assistigo/core`: that barrel is also the customer schema, the billing plans and the
 * scheme catalogue, and the extension currently pulls it in as types only. A label map is not
 * worth putting all of that into the side panel bundle — the same reasoning as the subpath
 * import in `shared/messages.ts`.
 */
const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  aadhaar_like: 'Aadhaar-like ID',
  pan: 'PAN card',
  voter_id: 'Voter ID',
  marksheet_10: 'Class 10 marksheet',
  marksheet_12: 'Class 12 marksheet',
  marksheet_graduation: 'Graduation marksheet',
  caste_certificate: 'Caste certificate',
  income_certificate: 'Income certificate',
  residence_certificate: 'Residence certificate',
  photo: 'Photograph',
  signature: 'Signature',
  receipt: 'Receipt',
  application_pdf: 'Application PDF',
  generic: 'Other document',
  unknown: 'Unclassified',
};

const TOOL_TYPE_LABEL: Record<string, string> = {
  photo: 'Prepared photo',
  signature: 'Prepared signature',
  pdf: 'Prepared PDF',
};

const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'identity', label: 'Identity & address' },
  { key: 'education', label: 'Educational' },
  { key: 'media', label: 'Photos & signatures' },
  { key: 'other', label: 'Other' },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];
type FileGroupKey = Exclude<GroupKey, 'all'>;

const IDENTITY_TYPES = new Set([
  'aadhaar_like',
  'pan',
  'voter_id',
  'residence_certificate',
  'caste_certificate',
  'income_certificate',
]);
const EDUCATION_TYPES = new Set(['marksheet_10', 'marksheet_12', 'marksheet_graduation']);

/**
 * Which chip a file sits under.
 *
 * `documentType` wins over `toolType` when both are known: a passport photo cropped out of an
 * Aadhaar scan carries `toolType: 'photo'` but belongs under Identity, which is where an
 * operator looking for the customer's Aadhaar will look for it.
 */
function documentGroup(doc: CustomerDocument): FileGroupKey {
  const type = doc.documentType;
  if (type) {
    if (IDENTITY_TYPES.has(type)) return 'identity';
    if (EDUCATION_TYPES.has(type)) return 'education';
    if (type === 'photo' || type === 'signature') return 'media';
    return 'other';
  }
  if (doc.toolType === 'photo' || doc.toolType === 'signature') return 'media';
  return 'other';
}

/** What the file is, in the operator's words: its classified type, or what tool prepared it. */
function documentTypeLabel(doc: CustomerDocument): string {
  const fromType = doc.documentType ? DOCUMENT_TYPE_LABEL[doc.documentType] : undefined;
  if (fromType) return fromType;
  const fromTool = doc.toolType ? TOOL_TYPE_LABEL[doc.toolType] : undefined;
  return fromTool ?? 'Document';
}

const MIME_GROUP_NOUN: Record<string, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audio files',
  application: 'files',
};

/**
 * The file types an upload box says it takes, read back as a phrase: "images", "PDF",
 * "JPG or PNG". Null when the attribute says nothing usable — which is also exactly when
 * `fileMatchesAccept` accepts everything, so there is nothing to report to the operator.
 */
export function describeAccept(accept: string | null | undefined): string | null {
  const tokens = (accept ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const names: string[] = [];
  for (const token of tokens) {
    if (token === '*' || token === '*/*') return null;
    if (token.endsWith('/*')) {
      const group = token.slice(0, -2);
      names.push(MIME_GROUP_NOUN[group] ?? `${group} files`);
    } else if (token.startsWith('.')) {
      names.push(token.slice(1).toUpperCase());
    } else if (token.includes('/')) {
      names.push((token.split('/')[1] ?? '').replace(/^x-/, '').toUpperCase());
    }
    // Anything else is a malformed token, which `fileMatchesAccept` also ignores.
  }

  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0]!;
  return `${unique.slice(0, -1).join(', ')} or ${unique[unique.length - 1]!}`;
}

/**
 * Why an upload box would refuse this file, in the operator's words — or null when it would take
 * it. The box's own `accept` attribute is the authority, here and again in the content script.
 */
export function attachRejection(
  accept: string | null | undefined,
  file: { filename: string; mimeType: string },
): string | null {
  if (fileMatchesAccept(accept, file)) return null;
  const phrase = describeAccept(accept);
  return phrase ? `This box accepts ${phrase} only` : 'This box does not accept this file type';
}

/** Which preview surface a file gets. The slot's own category breaks a tie between image kinds. */
function previewCategory(
  doc: CustomerDocument,
  slotCategory: DocumentCategory | null,
): DocumentCategory {
  if (doc.toolType === 'photo' || doc.toolType === 'signature') return doc.toolType;
  if (doc.documentType === 'photo' || doc.documentType === 'signature') return doc.documentType;
  if (doc.mimeType.startsWith('image/')) {
    return slotCategory === 'signature' ? 'signature' : 'photo';
  }
  return 'pdf';
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Customer document picker and manual fallback (spec §7.4.5).
 *
 * The automated matcher ranks a handful of files per upload box and is right most of the time.
 * This is the other times: the citizen would rather use their Voter ID than the Aadhaar that
 * ranked first, the box is labelled "any other supporting document" so no category could be
 * inferred and no suggestion was offered at all, or the operator is on a step of a multi-page
 * form the matcher never saw. Every file on the profile is listed, and any of them can be put
 * into any detected upload box.
 *
 * The one thing the operator cannot override is the portal's own `accept` attribute. A file the
 * box would reject stays listed, previewable and downloadable — it can still be uploaded by hand
 * — but it cannot be ticked, because attaching it would only produce a `file_type_rejected` skip
 * at fill time, and the operator would find that out after pressing Fill instead of before.
 */
export function CustomerDocumentPickerModal({
  customerId,
  slot,
  selectedId,
  onSelect,
  onClear,
  onClose,
}: {
  customerId: string;
  /** Null browses the vault read-only, with no upload box to assign anything to. */
  slot: PickerSlot | null;
  selectedId: string | null;
  onSelect: (doc: CustomerDocument) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<CustomerDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupKey>('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, 'working' | 'done'>>({});

  useEffect(() => {
    let cancelled = false;
    setDocuments(null);
    setLoadError(null);

    void send<{ documents: CustomerDocument[] }>({
      type: 'LIST_CUSTOMER_DOCUMENTS',
      customerId,
    }).then((response) => {
      if (cancelled) return;
      if (response.ok) {
        setDocuments(response.data.documents);
        return;
      }
      // Told apart because they ask different things of the operator: a locked roaming customer
      // needs the citizen's consent, everything else needs another try.
      setLoadError(
        response.error === 'roaming_access_locked'
          ? 'This customer is registered at another centre. Ask them to approve access first.'
          : 'Could not load this customer’s documents. Check the connection and try again.',
      );
    });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // The preview sits on top of this dialog, so it is what Escape closes first.
      if (preview) setPreview(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, preview]);

  const counts = useMemo(() => {
    const tally = new Map<GroupKey, number>();
    for (const doc of documents ?? []) {
      tally.set('all', (tally.get('all') ?? 0) + 1);
      const key = documentGroup(doc);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return tally;
  }, [documents]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (documents ?? []).filter((doc) => {
      if (group !== 'all' && documentGroup(doc) !== group) return false;
      if (needle === '') return true;
      return (
        doc.filename.toLowerCase().includes(needle) ||
        documentTypeLabel(doc).toLowerCase().includes(needle)
      );
    });
  }, [documents, group, query]);

  const acceptPhrase = slot ? describeAccept(slot.accept) : null;

  /** Why this file cannot go into this box, or null when it can — and in vault mode, never. */
  const rejectionFor = (doc: CustomerDocument): string | null =>
    slot ? attachRejection(slot.accept, doc) : null;

  const download = async (doc: CustomerDocument) => {
    setDownloadStates((current) => ({ ...current, [doc.id]: 'working' }));
    const response =
      doc.kind === 'derivative'
        ? await send({ type: 'DOWNLOAD_DERIVATIVE', derivativeId: doc.id })
        : await send({ type: 'DOWNLOAD_DOCUMENT', documentId: doc.id });

    if (!response.ok) {
      setDownloadStates((current) => {
        const next = { ...current };
        delete next[doc.id];
        return next;
      });
      return;
    }

    setDownloadStates((current) => ({ ...current, [doc.id]: 'done' }));
    setTimeout(() => {
      setDownloadStates((current) => {
        const next = { ...current };
        delete next[doc.id];
        return next;
      });
    }, 2500);
  };

  const previewedDocument = preview
    ? ((documents ?? []).find((doc) => doc.id === preview.id) ?? null)
    : null;
  const previewRejection = previewedDocument ? rejectionFor(previewedDocument) : null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={slot ? `Choose a file for ${slot.label}` : 'Customer documents'}
      >
        <div className="modal-header">
          <span className="row" style={{ minWidth: 0, gap: 8 }}>
            <span className="modal-header__icon">
              <FolderIcon size={14} />
            </span>
            <span className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
              <span className="strong truncate" style={{ display: 'block' }}>
                {slot ? 'Choose a file for this upload box' : 'Customer vault'}
              </span>
              {/* Host-page text, rendered as text — never as markup (§19.6). */}
              <span className="tiny muted truncate" style={{ display: 'block' }}>
                {slot ? slot.label : 'Every file saved on this customer’s profile'}
              </span>
            </span>
          </span>

          <button
            type="button"
            className="btn-ghost tiny"
            aria-label="Close document picker"
            onClick={onClose}
            style={{ flexShrink: 0 }}
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="picker-controls">
          <label className="picker-search">
            <SearchIcon size={13} />
            <input
              type="search"
              value={query}
              placeholder="Search by file name or type"
              aria-label="Search this customer's documents"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="picker-chips" role="tablist" aria-label="Document groups">
            {GROUPS.map((entry) => {
              const count = counts.get(entry.key) ?? 0;
              // Empty groups are noise; "All" stays put so the row never collapses to nothing.
              if (entry.key !== 'all' && count === 0) return null;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={group === entry.key}
                  className={`picker-chip${group === entry.key ? ' picker-chip-on' : ''}`}
                  onClick={() => setGroup(entry.key)}
                >
                  {entry.label}
                  <span className="picker-chip__count">{count}</span>
                </button>
              );
            })}
          </div>

          {slot && acceptPhrase ? (
            <p className="tiny muted" style={{ margin: 0 }}>
              This upload box accepts {acceptPhrase}.
            </p>
          ) : null}
        </div>

        <div className="modal-body">
          {loadError ? (
            <div className="notice notice-danger">
              <AlertIcon size={13} />
              <span>{loadError}</span>
            </div>
          ) : documents === null ? (
            <div className="preview-loading">
              <span className="spinner spinner-ink" />
              <span className="tiny muted">Loading this customer&rsquo;s documents…</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty">
              <div className="empty-art">
                <FolderIcon size={20} />
              </div>
              <p className="strong">No documents on this profile</p>
              <p className="tiny muted" style={{ marginTop: 2 }}>
                Upload the citizen&rsquo;s documents on the dashboard, then read this page again.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="empty-art">
                <SearchIcon size={20} />
              </div>
              <p className="strong">Nothing matches that</p>
              <p className="tiny muted" style={{ marginTop: 2 }}>
                Clear the search, or pick a different group.
              </p>
            </div>
          ) : (
            <div className="picker-list">
              {visible.map((doc) => {
                const rejection = rejectionFor(doc);
                const chosen = selectedId === doc.id;
                const downloadState = downloadStates[doc.id];
                const image = doc.mimeType.startsWith('image/');

                return (
                  <div
                    key={`${doc.kind}:${doc.id}`}
                    className={`picker-row${chosen ? ' picker-row-on' : ''}${
                      rejection ? ' picker-row-off' : ''
                    }`}
                  >
                    <span className="picker-row__icon" aria-hidden="true">
                      {image ? <ImageIcon size={15} /> : <FileTextIcon size={15} />}
                    </span>

                    <span className="picker-row__body">
                      <span className="strong truncate" style={{ display: 'block' }}>
                        {doc.filename}
                      </span>
                      <span className="row tiny muted" style={{ gap: 5, flexWrap: 'wrap' }}>
                        <span className="badge badge-muted">
                          {doc.kind === 'derivative' ? 'Prepared' : 'Original'}
                        </span>
                        <span className="truncate">{documentTypeLabel(doc)}</span>
                        <span>· {formatKb(doc.sizeBytes)}</span>
                        {doc.width && doc.height ? (
                          <span>
                            · {doc.width}×{doc.height}px
                          </span>
                        ) : null}
                        <span>· {formatDate(doc.createdAt)}</span>
                      </span>
                      {rejection ? (
                        <span
                          className="row tiny"
                          style={{ color: 'var(--warn)', gap: 4, marginTop: 3 }}
                        >
                          <AlertIcon size={11} />
                          {rejection}
                        </span>
                      ) : null}
                    </span>

                    <span className="picker-row__actions">
                      {slot ? (
                        <button
                          type="button"
                          className={chosen ? 'btn-secondary tiny' : 'btn-primary tiny'}
                          disabled={Boolean(rejection)}
                          title={rejection ?? undefined}
                          onClick={() => (chosen ? onClear() : onSelect(doc))}
                        >
                          {chosen ? (
                            <>
                              <CheckIcon size={12} />
                              Selected
                            </>
                          ) : (
                            'Use this file'
                          )}
                        </button>
                      ) : null}

                      <span className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="btn-ghost tiny"
                          onClick={() =>
                            setPreview({
                              id: doc.id,
                              kind: doc.kind,
                              filename: doc.filename,
                              sizeBytes: doc.sizeBytes,
                              width: doc.width,
                              height: doc.height,
                              mimeType: doc.mimeType,
                              category: previewCategory(doc, slot?.category ?? null),
                              preset: slot?.preset ?? null,
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
                          onClick={() => void download(doc)}
                        >
                          {downloadState === 'working' ? (
                            <span className="spinner spinner-ink" />
                          ) : downloadState === 'done' ? (
                            <CheckIcon size={12} />
                          ) : (
                            <DownloadIcon size={12} />
                          )}
                          {downloadState === 'done' ? 'Saved' : 'Download'}
                        </button>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="tiny muted truncate">
            {documents === null ? '' : `${visible.length} of ${documents.length} files`}
          </span>
          <span className="row" style={{ gap: 6, flexShrink: 0 }}>
            {slot && selectedId ? (
              <button
                type="button"
                className="btn-ghost tiny"
                onClick={() => {
                  onClear();
                  onClose();
                }}
              >
                Clear selection
              </button>
            ) : null}
            <button type="button" className="btn-secondary tiny" onClick={onClose}>
              Done
            </button>
          </span>
        </div>

        <div className="notice notice-info modal-footnote">
          <ShieldIcon size={12} />
          <span>
            Nothing is attached until you press Fill, and nothing is ever submitted for you.
          </span>
        </div>
      </div>

      {preview && previewedDocument ? (
        <DocumentPreviewModal
          target={preview}
          customerId={customerId}
          attached={selectedId === previewedDocument.id}
          attachDisabledReason={previewRejection}
          {...(slot
            ? {
                onToggleAttach: () =>
                  selectedId === previewedDocument.id ? onClear() : onSelect(previewedDocument),
              }
            : {})}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
