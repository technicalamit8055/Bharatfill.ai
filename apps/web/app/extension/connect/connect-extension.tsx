'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Briefcase, Info } from 'lucide-react';
import { Alert } from '@assistigo/ui';

/**
 * The pairing gesture.
 *
 * Two steps, both of which must succeed:
 *   1. POST /api/extension/pairing-code — mints a one-time code against this browser session.
 *   2. chrome.runtime.sendMessage(extensionId, { code }) — hands it to the service worker,
 *      which redeems it at /api/extension/pair.
 *
 * The code is never rendered, never logged and never put in the URL. It exists in this
 * component for the length of one function call.
 *
 * Pairing is behind a button rather than running on mount: granting an extension your session
 * is an authorisation, and an authorisation should be something the operator did on purpose.
 */

type Stage = 'idle' | 'pairing' | 'done' | 'error';

/** Minimal shape of the message channel a web page gets from `externally_connectable`. */
type ExternallyConnectable = {
  runtime?: {
    sendMessage?: (
      extensionId: string,
      message: unknown,
      callback: (response?: { ok?: boolean; error?: string }) => void,
    ) => void;
    lastError?: { message?: string };
  };
};

const NOT_INSTALLED =
  'The Bharatfill extension did not answer. Check that it is installed and enabled, then try again.';

export function ConnectExtension({
  extensionId,
  organizationName,
  email,
}: {
  extensionId: string;
  organizationName: string;
  email: string | null;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const pair = async () => {
    setStage('pairing');
    setMessage(null);

    let code: string;
    try {
      const response = await fetch('/api/extension/pairing-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extensionId }),
      });
      if (!response.ok) throw new Error('mint_failed');
      const body = (await response.json()) as { data?: { code?: string } };
      if (!body.data?.code) throw new Error('mint_failed');
      code = body.data.code;
    } catch {
      setStage('error');
      setMessage('Could not start pairing. Reload this page and try again.');
      return;
    }

    const chromeApi = (globalThis as { chrome?: ExternallyConnectable }).chrome;
    const sendMessage = chromeApi?.runtime?.sendMessage;

    if (!sendMessage) {
      setStage('error');
      setMessage(NOT_INSTALLED);
      return;
    }

    // Callback form rather than the promise form: on a web page, a missing or disabled
    // extension surfaces as chrome.runtime.lastError with an undefined response, not a
    // rejection.
    sendMessage(extensionId, { code }, (response) => {
      if (chromeApi?.runtime?.lastError || !response) {
        setStage('error');
        setMessage(NOT_INSTALLED);
        return;
      }
      if (!response.ok) {
        setStage('error');
        setMessage('The extension refused the connection. Try again from the toolbar icon.');
        return;
      }
      setStage('done');
    });
  };

  const pairing = stage === 'pairing';

  return (
    <section className="w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.25)]">
      <Image
        src="/extension/connect-browser-white.jpg"
        alt=""
        width={1376}
        height={768}
        priority
        className="h-auto w-full"
      />

      <div className="space-y-5 px-5 pb-6 pt-2 sm:px-8 sm:pb-8">
        {stage === 'done' ? (
          <Alert tone="success" title="Extension connected">
            Bharatfill is now linked to <strong>{organizationName}</strong>. Close this tab, open
            the form you want to fill, then use the extension&rsquo;s side panel.
          </Alert>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Connect your browser extension
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
                The extension will be able to read forms you open and fill them from a customer
                profile you select. It can never submit a form for you.
              </p>
            </div>

            <dl className="grid rounded-2xl border border-slate-200/80 p-3.5 sm:grid-cols-2">
              <div
                className={`flex min-w-0 items-center gap-3 ${
                  email
                    ? 'border-b border-slate-200 pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4'
                    : ''
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50">
                  <Briefcase className="h-5 w-5 text-[#0066FF]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Workspace</dt>
                  <dd className="truncate font-bold text-slate-900">{organizationName}</dd>
                </div>
              </div>
              {email ? (
                <div className="min-w-0 pt-3 sm:pl-5 sm:pt-0 sm:self-center">
                  <dt className="text-xs text-slate-500">Signed in as</dt>
                  <dd className="truncate font-bold text-slate-900" title={email}>
                    {email}
                  </dd>
                </div>
              ) : null}
            </dl>

            {stage === 'error' && message ? (
              <Alert tone="danger" title="Not connected">
                {message}
              </Alert>
            ) : null}

            <button
              type="button"
              onClick={() => void pair()}
              disabled={pairing}
              aria-busy={pairing}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#0066FF] to-cyan-500 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                <Image src="/chrome.png" alt="" width={20} height={20} className="h-5 w-5" />
              </span>
              {pairing ? 'Connecting…' : 'Connect this extension'}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </button>

            <p className="flex items-start justify-center gap-2 text-xs text-slate-500">
              <Info className="mt-px h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>
                Not you, or not expecting this? Close this tab — nothing is connected until you
                press the button.
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
