import { useCallback, useEffect, useRef, useState } from 'react';
import { base64ToBytes } from './bytes';
import type { VaultDocumentView, VaultGrantView, VaultRequestStatus } from './messages';
import { send } from './send';

/**
 * "BharatDoc app" box under a network (roaming) search (docs/VAULT_BRIDGE_DESIGN.md §4.1–4.3).
 *
 * The same words for every number: nothing here says whether the person uses the app until they
 * approve the request on their phone or read out the 6-digit code from Share with centre. Either
 * opens a time-boxed grant; documents are previewed from memory (a blob URL revoked on close),
 * never downloaded or stored. Done — or closing the panel — ends access at once.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'waiting'; requestId: string }
  | { kind: 'declined' }
  | { kind: 'open'; grant: VaultGrantView; documents: VaultDocumentView[] };

type Preview = { doc: VaultDocumentView; url: string; mimeType: string };

const POLL_MS = 3000;

const MESSAGES: Record<string, string> = {
  'errors.vault.code_wrong': 'That code did not work. Ask the customer to show a new one.',
  'errors.vault.code_paused': 'Too many wrong codes. Wait a few minutes and try again.',
  'errors.vault.lookup_limited': 'Too many requests from this counter. Wait a few minutes.',
  'errors.vault.grant_missing': 'Access has ended. Ask the customer again.',
  'errors.vault.document_missing': 'That document is no longer in the customer’s vault.',
  'errors.permission_denied': 'Your role cannot open customer vaults.',
};
const say = (messageKey: string | undefined) =>
  (messageKey && MESSAGES[messageKey]) ?? 'Could not reach Assistigo right now. Try again.';

export function VaultAppBox({ mobile }: { mobile: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'request' | 'code' | 'done' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const grantRef = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const openGrant = useCallback(async (grantId: string) => {
    const response = await send<{ grant: VaultGrantView; documents: VaultDocumentView[] }>({
      type: 'VAULT_LIST_DOCUMENTS',
      grantId,
    });
    if (!response.ok) {
      setError(say(response.messageKey));
      setPhase({ kind: 'idle' });
      return;
    }
    grantRef.current = response.data.grant.id;
    setPhase({ kind: 'open', grant: response.data.grant, documents: response.data.documents });
  }, []);

  // A different number is a different person: end the last one's access and start over.
  useEffect(() => {
    setPhase({ kind: 'idle' });
    setCode('');
    setError(null);
    return () => {
      closePreview();
      const id = grantRef.current;
      grantRef.current = null;
      if (id) void send({ type: 'VAULT_END_GRANT', grantId: id });
    };
  }, [mobile, closePreview]);

  // Wait for the citizen's answer in the app.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        const response = await send<VaultRequestStatus>({
          type: 'VAULT_REQUEST_STATUS',
          requestId: phase.requestId,
        });
        if (stopped) return;
        if (!response.ok) {
          setError(say(response.messageKey));
          setPhase({ kind: 'idle' });
          return;
        }
        const status = response.data;
        if (status.status === 'approved') await openGrant(status.grant.id);
        // Denied and expired read the same: "no app" and "no" must look alike.
        else if (status.status !== 'pending') setPhase({ kind: 'declined' });
      })();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [openGrant, phase]);

  const sendRequest = async () => {
    setBusy('request');
    setError(null);
    const response = await send<{ requestId: string }>({ type: 'VAULT_REQUEST', mobile });
    setBusy(null);
    if (response.ok) setPhase({ kind: 'waiting', requestId: response.data.requestId });
    else setError(say(response.messageKey));
  };

  const unlock = async () => {
    setBusy('code');
    setError(null);
    const response = await send<{ grant: VaultGrantView }>({ type: 'VAULT_UNLOCK', mobile, code });
    setBusy(null);
    if (!response.ok) {
      setError(say(response.messageKey));
      return;
    }
    setCode('');
    await openGrant(response.data.grant.id);
  };

  const done = async () => {
    if (phase.kind !== 'open') return;
    setBusy('done');
    closePreview();
    await send({ type: 'VAULT_END_GRANT', grantId: phase.grant.id });
    grantRef.current = null;
    setBusy(null);
    setPhase({ kind: 'idle' });
  };

  const view = async (doc: VaultDocumentView) => {
    if (phase.kind !== 'open') return;
    setBusy(doc.id);
    setError(null);
    const response = await send<{ mimeType: string; dataBase64: string }>({
      type: 'VAULT_VIEW_DOCUMENT',
      grantId: phase.grant.id,
      documentId: doc.id,
    });
    setBusy(null);
    if (!response.ok) {
      setError(say(response.messageKey));
      return;
    }
    closePreview();
    const blob = new Blob([base64ToBytes(response.data.dataBase64).buffer as ArrayBuffer], {
      type: response.data.mimeType,
    });
    setPreview({ doc, url: URL.createObjectURL(blob), mimeType: response.data.mimeType });
  };

  return (
    <div className="card stack-sm">
      <div className="strong small">📱 BharatDoc app</div>

      {error ? (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      {phase.kind === 'open' ? (
        <>
          <div className="spread">
            <span className="badge badge-ok">Open for {phase.grant.minutesLeft} min</span>
            <button
              type="button"
              className="btn-ghost tiny"
              disabled={busy === 'done'}
              onClick={() => void done()}
            >
              {busy === 'done' ? <span className="spinner spinner-ink" /> : 'Done'}
            </button>
          </div>

          {phase.documents.length === 0 ? (
            <p className="tiny muted">The customer has no documents in their cloud vault.</p>
          ) : (
            <div className="card card-flush result-list">
              {phase.documents.map((doc) => (
                <div key={doc.id} className="result-item spread">
                  <span className="grow truncate">
                    {/* Citizen-entered text, rendered as text — never as markup. */}
                    {doc.title}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost tiny"
                    disabled={busy === doc.id}
                    onClick={() => void view(doc)}
                  >
                    {busy === doc.id ? <span className="spinner spinner-ink" /> : 'View'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {preview ? (
            <div className="card stack-sm">
              <div className="spread">
                <span className="strong small truncate">{preview.doc.title}</span>
                <button
                  type="button"
                  className="btn-ghost tiny"
                  aria-label="Close preview"
                  onClick={closePreview}
                >
                  ✕
                </button>
              </div>
              {preview.mimeType === 'application/pdf' ? (
                <iframe
                  title={preview.doc.title}
                  src={`${preview.url}#toolbar=0`}
                  style={{ width: '100%', height: 420, border: 0 }}
                />
              ) : (
                <img
                  src={preview.url}
                  alt={preview.doc.title}
                  style={{ maxWidth: '100%' }}
                  draggable={false}
                  onContextMenu={(event) => event.preventDefault()}
                />
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="tiny muted">
            If this customer uses the BharatDoc app, send a request to their phone, or ask them to
            open Share with centre and read you the 6-digit code.
          </p>

          {phase.kind === 'waiting' ? (
            <div className="notice notice-info tiny">
              <span className="spinner spinner-ink" />
              <span>Request sent. Ask the customer to open BharatDoc and tap Approve.</span>
            </div>
          ) : phase.kind === 'declined' ? (
            <div className="notice notice-warn tiny">
              <span>No approval came. They can try again, or read you the code from the app.</span>
            </div>
          ) : null}

          <button
            type="button"
            className="btn-secondary btn-block tiny"
            disabled={busy === 'request' || phase.kind === 'waiting'}
            onClick={() => void sendRequest()}
          >
            {busy === 'request' ? <span className="spinner spinner-ink" /> : 'Send request to app'}
          </button>

          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <input
              className="grow"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="6-digit code from app"
              aria-label="Code from the customer's app"
            />
            <button
              type="submit"
              className="btn-primary tiny"
              disabled={code.length !== 6 || busy === 'code'}
            >
              {busy === 'code' ? <span className="spinner" /> : 'Open'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
