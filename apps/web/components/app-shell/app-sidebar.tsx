'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { SIDEBAR_MODES, sidebarModeCookie, type SidebarMode } from '@/lib/app-shell/sidebar-mode';
import { Sidebar } from './sidebar';

const MODE_LABEL_KEYS: Record<SidebarMode, string> = {
  expanded: 'nav.sidebarExpanded',
  collapsed: 'nav.sidebarCollapsed',
  hover: 'nav.sidebarHover',
};

/** Long enough that sweeping the pointer past the rail does not throw the panel open. */
const HOVER_OPEN_DELAY_MS = 120;

/**
 * The desktop sidebar, in one of three modes the operator picks from the control at its foot
 * (see `SidebarMode`).
 *
 * Two boxes: the outer `<aside>` is the space the page is laid out around — full width only in
 * `expanded` — and the inner panel is what is drawn. In `hover` mode the panel widens over the
 * page while the outer box stays a rail, so nothing under it reflows as it opens and closes.
 */
export function AppSidebar({
  permissions,
  initialMode,
}: {
  permissions: string[];
  initialMode: SidebarMode;
}) {
  const [mode, setMode] = useState<SidebarMode>(initialMode);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  const choose = useCallback((next: SidebarMode) => {
    setMode(next);
    try {
      document.cookie = sidebarModeCookie(next);
    } catch {
      // Cookies blocked: the choice still holds for this page, just not the next visit.
    }
  }, []);

  const wide = mode === 'expanded' || (mode === 'hover' && (hovered || focused || menuOpen));
  const floating = mode === 'hover' && wide;

  return (
    <aside
      className={cn(
        'relative hidden shrink-0 transition-[width] duration-200 lg:block',
        mode === 'expanded' ? 'w-56' : 'w-14',
      )}
    >
      <div
        onMouseEnter={() => {
          if (mode !== 'hover') return;
          hoverTimer.current = setTimeout(() => setHovered(true), HOVER_OPEN_DELAY_MS);
        }}
        onMouseLeave={() => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
          setHovered(false);
        }}
        // Keyboard users get the same expansion as pointer users when tabbing into the rail.
        // Keyboard focus only: a clicked link keeps focus after navigating, and that must not
        // hold the panel open once the pointer has left.
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) setFocused(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
        className={cn(
          'absolute inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200',
          wide ? 'w-56' : 'w-14',
          floating && 'shadow-xl shadow-slate-900/10',
        )}
      >
        {/* Clips the labels and the support card while the width animates. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Sidebar permissions={permissions} showFooter collapsed={!wide} />
        </div>
        <SidebarControl mode={mode} onChoose={choose} open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </aside>
  );
}

/** The button at the foot of the rail and its three-way menu. */
function SidebarControl({
  mode,
  onChoose,
  open,
  onOpenChange,
}: {
  mode: SidebarMode;
  onChoose: (mode: SidebarMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(
    (returnFocus: boolean) => {
      onOpenChange(false);
      if (returnFocus) button.current?.focus();
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    items.current[SIDEBAR_MODES.indexOf(mode)]?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // `mode` is left out on purpose: focus the current choice when the menu opens, not each
    // time the choice changes.
  }, [open, close]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const current = items.current.findIndex((item) => item === document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + step + SIDEBAR_MODES.length) % SIDEBAR_MODES.length;
    items.current[next]?.focus();
  };

  return (
    <div ref={root} className="relative shrink-0 border-t border-slate-200 px-2 py-2">
      <button
        ref={button}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={t('nav.sidebarControl')}
        title={t('nav.sidebarControl')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center rounded-md px-3 py-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900',
          open && 'bg-slate-100 text-slate-900',
        )}
      >
        <PanelLeft size={17} strokeWidth={1.8} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('nav.sidebarControl')}
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-2 z-40 mb-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <p className="border-b border-slate-100 px-3 pb-2 pt-1.5 text-xs font-medium text-slate-500">
            {t('nav.sidebarControl')}
          </p>
          <div className="pt-1">
            {SIDEBAR_MODES.map((value, index) => {
              const selected = value === mode;
              return (
                <button
                  key={value}
                  ref={(element) => {
                    items.current[index] = element;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onChoose(value);
                    close(true);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none',
                    selected ? 'font-medium text-slate-900' : 'text-slate-600',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      selected ? 'bg-brand-600' : 'bg-transparent',
                    )}
                  />
                  {t(MODE_LABEL_KEYS[value])}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
