'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { KeyboardIcon } from './icons';

/** The id of the dashboard's customer search input (customer-jump-search.tsx). */
export const CUSTOMER_SEARCH_INPUT_ID = 'dashboard-customer-jump';

type Shortcut = { keys: string; labelKey: string; run: () => void };

/**
 * Single-key shortcuts for the counter (spec §16.2, "keyboard-friendly customer lookup").
 *
 * `/` jumps to customer search, `N` starts a new customer, `D` opens the walk-in drop, `?` shows
 * this list. Keys are ignored while the operator is typing in a field or holding a modifier, so
 * a name containing "n" never navigates away, and browser shortcuts (Ctrl+D) keep working.
 * Each shortcut exists only when the operator could reach the same action by clicking.
 */
export function DashboardShortcuts({
  canSearchCustomers,
  canCreateCustomer,
  canOpenDocumentDrop,
}: {
  canSearchCustomers: boolean;
  canCreateCustomer: boolean;
  canOpenDocumentDrop: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const shortcuts: Shortcut[] = [];
  if (canSearchCustomers) {
    shortcuts.push({
      keys: '/',
      labelKey: 'dashboard.shortcuts.search',
      run: () => document.getElementById(CUSTOMER_SEARCH_INPUT_ID)?.focus(),
    });
  }
  if (canCreateCustomer) {
    shortcuts.push({
      keys: 'N',
      labelKey: 'dashboard.shortcuts.newCustomer',
      run: () => router.push('/customers/new'),
    });
  }
  if (canOpenDocumentDrop) {
    shortcuts.push({
      keys: 'D',
      labelKey: 'dashboard.shortcuts.drop',
      // The drop dialog opens from this search param, the same route the tools card uses.
      run: () => router.push('/dashboard?drop=1', { scroll: false }),
    });
  }

  // Kept in a ref so the listener is attached once, yet always runs the current shortcuts.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      const match = shortcutsRef.current.find(
        (shortcut) => shortcut.keys.toLowerCase() === event.key.toLowerCase(),
      );
      if (!match) return;
      event.preventDefault();
      setOpen(false);
      match.run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A click outside closes the list, as any popover does.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (shortcuts.length === 0) return null;

  return (
    <div ref={panelRef} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('dashboard.shortcuts.title')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        <KeyboardIcon className="h-4 w-4" />
        <span className="sr-only">{t('dashboard.shortcuts.title')}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('dashboard.shortcuts.title')}
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-slate-500">
            {t('dashboard.shortcuts.title')}
          </p>
          <ul>
            {shortcuts.map((shortcut) => (
              <li key={shortcut.keys}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    shortcut.run();
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t(shortcut.labelKey)}
                  <Kbd>{shortcut.keys}</Kbd>
                </button>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500">
              {t('dashboard.shortcuts.help')}
              <Kbd>?</Kbd>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[11px] font-medium text-slate-500">
      {children}
    </kbd>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
