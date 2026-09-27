'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { signOutAction } from '@/app/(auth)/actions';

/**
 * The account block at the right of the header: who is signed in, in which role, and the menu
 * that holds everything that used to crowd the bar — the centre's name, settings, the staff
 * console and sign out.
 *
 * Sign out stays a real `<form>` posting the server action, so it works before hydration and
 * cannot be skipped by a click handler that failed to attach.
 */
export function UserMenu({
  displayName,
  email,
  roleLabel,
  organizationName,
  isStaff,
}: {
  displayName: string;
  email: string | null;
  roleLabel: string;
  organizationName: string;
  /** Discoverability only — /admin re-checks the roster on the server. */
  isStaff: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('header.accountMenu')}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white"
        >
          {initial}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold text-slate-900">
            {displayName}
          </span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden
          className={cn('text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fade-in-up"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{organizationName}</p>
            {email ? <p className="mt-0.5 truncate text-xs text-slate-500">{email}</p> : null}
          </div>

          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Settings size={16} strokeWidth={1.8} aria-hidden className="text-slate-400" />
              {t('nav.settings')}
            </Link>
            {isStaff ? (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <ShieldCheck size={16} strokeWidth={1.8} aria-hidden className="text-slate-400" />
                {t('admin.title')}
              </Link>
            ) : null}
          </div>

          <form action={signOutAction} className="border-t border-slate-100 py-1">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
            >
              <LogOut size={16} strokeWidth={1.8} aria-hidden />
              {t('common.signOut')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
