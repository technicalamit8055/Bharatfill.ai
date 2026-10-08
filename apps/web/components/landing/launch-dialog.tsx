'use client';

import { createContext, useCallback, useContext, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { LaunchNotice } from '@/components/launch/launch-notice';
import { useTranslations } from '@/lib/i18n/client';

/** Opens the launch dialog; null when sign-ups are open and CTAs behave as plain links. */
const LaunchDialogContext = createContext<(() => void) | null>(null);

/**
 * Pre-launch mode for the landing page. While sign-ups are closed every install / sign-up CTA
 * opens one shared dialog instead of going to the Chrome Web Store or /sign-up. With sign-ups
 * open this renders nothing of its own and the CTAs are ordinary links again.
 */
export function LaunchDialogProvider({
  signupsOpen,
  channelUrl,
  children,
}: {
  signupsOpen: boolean;
  channelUrl: string | null;
  children: ReactNode;
}) {
  const t = useTranslations();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const open = useCallback(() => dialog.current?.showModal(), []);
  const close = useCallback(() => dialog.current?.close(), []);

  if (signupsOpen) return <>{children}</>;

  return (
    <LaunchDialogContext.Provider value={open}>
      {children}
      {/* Native <dialog>: showModal() gives focus trapping, Escape to close and inert background. */}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // A click that lands on the dialog element itself is a click on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[520px] overflow-y-auto rounded-[28px] bg-white p-0 shadow-2xl shadow-slate-900/25 backdrop:bg-slate-950/55 backdrop:backdrop-blur-sm"
      >
        <div className="relative overflow-hidden bg-gradient-to-b from-white via-white to-slate-50/80 px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
          {/* Soft blue wash behind the illustration, top right. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-10 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t('launch.close')}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/90 text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] sm:h-11 sm:w-11"
          >
            <X aria-hidden size={20} />
          </button>
          <div className="relative">
            <LaunchNotice channelUrl={channelUrl} titleId={titleId} />
          </div>
        </div>
      </dialog>
    </LaunchDialogContext.Provider>
  );
}

/**
 * A landing CTA. In pre-launch mode it is a button that opens the launch dialog; otherwise it is
 * the link it always was — an off-site tab for the Chrome Web Store, a route for /sign-up.
 */
export function LaunchCta({
  href,
  external = false,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(LaunchDialogContext);

  if (open) {
    return (
      <button type="button" onClick={open} aria-haspopup="dialog" className={className}>
        {children}
      </button>
    );
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
