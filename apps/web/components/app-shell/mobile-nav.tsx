'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { Sidebar } from './sidebar';

/**
 * The sidebar below `lg`: a menu button in the header that opens the same `Sidebar` as a
 * drawer. Replaces the old nav bar at the foot of the page, which scrolled away with the
 * content — on a display-scaled laptop that was the only nav an operator got.
 */
export function MobileNav({ permissions }: { permissions: string[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // A link was followed: the drawer has done its job.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        openButton.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={openButton}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('header.openMenu')}
        aria-expanded={open}
        className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
      >
        <Menu size={20} strokeWidth={1.8} aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('header.closeMenu')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="relative flex h-full w-64 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl">
            <div className="flex h-[72px] shrink-0 items-center justify-end border-b border-slate-200 px-3">
              <button
                ref={closeButton}
                type="button"
                onClick={() => {
                  setOpen(false);
                  openButton.current?.focus();
                }}
                aria-label={t('header.closeMenu')}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} strokeWidth={1.8} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar permissions={permissions} showFooter />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
