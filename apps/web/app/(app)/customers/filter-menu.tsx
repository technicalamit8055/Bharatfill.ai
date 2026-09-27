'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FilterIcon } from './icons';

export type FilterOption = { key: string; label: string; href: string; active: boolean };

/**
 * The toolbar's Filter button: the "added" date windows (spec §7.3.2, created date filter).
 *
 * Each option is a plain link the server resolved, so the filter lives in the URL — shareable,
 * back-button friendly, and read by the page rather than by client state. This component only
 * opens and closes the menu, and closes it on a pick, an outside click, or Escape.
 */
export function FilterMenu({
  buttonLabel,
  heading,
  options,
  isFiltered,
}: {
  buttonLabel: string;
  heading: string;
  options: FilterOption[];
  isFiltered: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-12 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          isFiltered ? 'border-brand-300 text-brand-700' : 'border-slate-200 text-slate-700'
        }`}
      >
        <FilterIcon className="h-4 w-4" />
        {buttonLabel}
        {isFiltered ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-600" /> : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {heading}
          </p>
          <ul>
            {options.map((option) => (
              <li key={option.key}>
                <Link
                  href={option.href}
                  aria-current={option.active ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm ${
                    option.active
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                  {option.active ? (
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
