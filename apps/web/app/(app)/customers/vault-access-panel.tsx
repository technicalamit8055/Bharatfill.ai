'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Input } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

/**
 * "BharatDoc app" box under a roaming lookup (docs/VAULT_BRIDGE_DESIGN.md §4.1–4.3).
 *
 * Shown for every 10-digit search, with the same words whether or not the number has an app
 * account — the operator never learns who uses the app until the citizen says yes. Two ways in:
 * send a request the citizen approves in the app, or type the 6-digit code they read out from
 * Share → Centre. Either gives a time-boxed grant; the documents are listed and opened inline
 * from the server, with no Download button, and "Done" ends access at once.
 */

type Grant = { id: string; minutesLeft: number; live: boolean };
type VaultDocument = {
  id: string;
  documentType: string;
  title: string;
  mimeType: string;
  pageCount: number;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'waiting'; requestId: string }
  | { kind: 'declined' }
  | { kind: 'open'; grant: Grant; documents: VaultDocument[] };

const POLL_MS = 3000;

async function errorKeyOf(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as {
    error?: { messageKey?: string };
  } | null;
  return json?.error?.messageKey ?? 'errors.internal';
}

export function VaultAccessPanel({ mobile }: { readonly mobile: string }) {
  const t = useTranslations();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'request' | 'code' | 'done' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<VaultDocument | null>(null);
  const grantRef = useRef<string | null>(null);

  const openGrant = useCallback(async (grantId: string) => {
    const response = await fetch(`/api/vault/grants/${grantId}/documents`, { cache: 'no-store' });
    if (!response.ok) {
      setError(await errorKeyOf(response));
      setPhase({ kind: 'idle' });
      return;
    }
    const body = (await response.json()) as {
      data: { grant: Grant; documents: VaultDocument[] };
    };
    grantRef.current = body.data.grant.id;
    setPhase({ kind: 'open', grant: body.data.grant, documents: body.data.documents });
  }, []);

  // A new number is a new customer: forget the previous one's request and access.
  useEffect(() => {
    setPhase({ kind: 'idle' });
    setCode('');
    setError(null);
    setViewing(null);
  }, [mobile]);

  // Poll the request until the citizen answers in the app, or it runs out.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        const response = await fetch(`/api/vault/requests/${phase.requestId}`, {
          cache: 'no-store',
        }).catch(() => null);
        if (stopped || !response) return;
        if (!response.ok) {
          setError(await errorKeyOf(response));
          setPhase({ kind: 'idle' });
          return;
        }
        const body = (await response.json()) as {
          data: { status: 'pending' | 'approved' | 'denied' | 'expired'; grant?: Grant };
        };
        const status = body.data.status;
        if (status === 'approved' && body.data.grant) await openGrant(body.data.grant.id);
        // Denied and expired read the same, so the operator cannot tell "no app" from "no".
        else if (status === 'denied' || status === 'expired') setPhase({ kind: 'declined' });
      })();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [openGrant, phase]);

  // Leaving the page or the customer ends access, as "Done" would.
  useEffect(
    () => () => {
      const id = grantRef.current;
      grantRef.current = null;
      if (id) void fetch(`/api/vault/grants/${id}/end`, { method: 'POST', keepalive: true });
    },
    [mobile],
  );

  async function sendRequest() {
    setBusy('request');
    setError(null);
    try {
      const response = await fetch('/api/vault/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      if (!response.ok) {
        setError(await errorKeyOf(response));
        return;
      }
      const body = (await response.json()) as { data: { requestId: string } };
      setPhase({ kind: 'waiting', requestId: body.data.requestId });
    } catch {
      setError('errors.internal');
    } finally {
      setBusy(null);
    }
  }

  async function unlock() {
    setBusy('code');
    setError(null);
    try {
      const response = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mobile, code }),
      });
      if (!response.ok) {
        setError(await errorKeyOf(response));
        return;
      }
      const body = (await response.json()) as { data: { grant: Grant } };
      setCode('');
      await openGrant(body.data.grant.id);
    } catch {
      setError('errors.internal');
    } finally {
      setBusy(null);
    }
  }

  async function done() {
    if (phase.kind !== 'open') return;
    setBusy('done');
    await fetch(`/api/vault/grants/${phase.grant.id}/end`, { method: 'POST' }).catch(() => null);
    grantRef.current = null;
    setViewing(null);
    setPhase({ kind: 'idle' });
    setBusy(null);
  }

  const fileUrl = (doc: VaultDocument) =>
    phase.kind === 'open' ? `/api/vault/grants/${phase.grant.id}/documents/${doc.id}/file` : '';

  return (
    <section className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        📱 {t('customers.roaming.app.title')}
      </h3>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {t(error)}
        </Alert>
      ) : null}

      {phase.kind === 'open' ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <Badge tone="success">
              {t('customers.roaming.app.openFor', { minutes: phase.grant.minutesLeft })}
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'done'}
              onClick={() => void done()}
            >
              {t('customers.roaming.app.done')}
            </Button>
          </div>
          {phase.documents.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('customers.roaming.app.noDocuments')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {phase.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{doc.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {t('customers.roaming.app.pages', { count: doc.pageCount })}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setViewing(doc)}>
                    {t('customers.roaming.app.view')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {viewing ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="truncate text-sm font-medium text-slate-900">{viewing.title}</p>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  className="text-slate-400 hover:text-slate-700"
                  onClick={() => setViewing(null)}
                >
                  ✕
                </button>
              </div>
              {viewing.mimeType === 'application/pdf' ? (
                <iframe
                  title={viewing.title}
                  src={`${fileUrl(viewing)}#toolbar=0`}
                  className="h-[70vh] w-full"
                />
              ) : (
                <img
                  src={fileUrl(viewing)}
                  alt={viewing.title}
                  className="mx-auto max-h-[70vh]"
                  onContextMenu={(event) => event.preventDefault()}
                />
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">{t('customers.roaming.app.help')}</p>

          {phase.kind === 'waiting' ? (
            <Alert tone="info" className="mt-3">
              {t('customers.roaming.app.waiting')}
            </Alert>
          ) : phase.kind === 'declined' ? (
            <Alert tone="warning" className="mt-3">
              {t('customers.roaming.app.declined')}
            </Alert>
          ) : null}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              loading={busy === 'request'}
              disabled={phase.kind === 'waiting'}
              onClick={() => void sendRequest()}
            >
              {t('customers.roaming.app.sendRequest')}
            </Button>
            <span className="text-xs text-slate-500">{t('customers.roaming.app.or')}</span>
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void unlock();
              }}
            >
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('customers.roaming.app.codePlaceholder')}
                aria-label={t('customers.roaming.app.codeLabel')}
                className="w-32"
              />
              <Button
                size="sm"
                variant="secondary"
                type="submit"
                loading={busy === 'code'}
                disabled={code.length !== 6}
              >
                {t('customers.roaming.app.openWithCode')}
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
