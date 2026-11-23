'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@assistigo/ui';
import { PROFILE_EDIT_PARAM, TAB_PARAM, isCustomerTab, type CustomerTab } from './detail-card';

/**
 * The customer page as a workspace of tabs instead of one long scroll of twelve cards.
 *
 * Every panel stays mounted and is only hidden, so a half-finished paste review or an open portal
 * login form survives the operator glancing at another tab. The active tab is mirrored into the
 * URL with `history.replaceState` — a refresh or a shared link reopens the same tab, and switching
 * never costs a server round trip.
 */

const WORKSPACE_ANCHOR = 'customer-workspace';

type SelectOptions = {
  /** Open the profile form, at this section (or `'1'` for the top). */
  edit?: string;
  /** An element id to scroll to once the tab shows. */
  anchor?: string;
};

type TabsContextValue = {
  active: CustomerTab;
  available: ReadonlySet<CustomerTab>;
  select: (tab: CustomerTab, options?: SelectOptions) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useCustomerTabs(): TabsContextValue {
  const value = useContext(TabsContext);
  if (!value) throw new Error('Customer tab components must sit inside <CustomerTabsProvider>.');
  return value;
}

export function CustomerTabsProvider({
  initialTab,
  available,
  children,
}: {
  initialTab: CustomerTab;
  available: readonly CustomerTab[];
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const availableSet = useMemo(() => new Set(available), [available]);
  const fallback = available[0] ?? 'profile';
  const [active, setActive] = useState<CustomerTab>(
    availableSet.has(initialTab) ? initialTab : fallback,
  );

  // Follow the URL when something other than this provider changes it — the browser's back
  // button, or a plain link carrying `?edit=` from elsewhere in the app.
  const tabParam = searchParams.get(TAB_PARAM);
  const editParam = searchParams.get(PROFILE_EDIT_PARAM);
  useEffect(() => {
    if (editParam && availableSet.has('profile')) setActive('profile');
    else if (isCustomerTab(tabParam) && availableSet.has(tabParam)) setActive(tabParam);
  }, [tabParam, editParam, availableSet]);

  const select = useCallback(
    (tab: CustomerTab, options: SelectOptions = {}) => {
      if (!availableSet.has(tab)) return;
      setActive(tab);

      const params = new URLSearchParams(window.location.search);
      params.set(TAB_PARAM, tab);
      if (options.edit) params.set(PROFILE_EDIT_PARAM, options.edit);
      else params.delete(PROFILE_EDIT_PARAM);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);

      // Wait a frame so the panel is visible before measuring where to scroll. A profile edit
      // scrolls itself to the section once its form renders, so leave that one alone.
      if (options.edit && options.edit !== '1') return;
      requestAnimationFrame(() => {
        const target =
          (options.anchor && document.getElementById(options.anchor)) ||
          document.getElementById(WORKSPACE_ANCHOR);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    },
    [availableSet],
  );

  const value = useMemo(
    () => ({ active, available: availableSet, select }),
    [active, availableSet, select],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export type CustomerTabItem = {
  value: CustomerTab;
  label: string;
  /** Shown as a small pill; `null` hides it. */
  count?: number | null;
};

/**
 * The tab strip, pinned to the top of the scrolling `<main>` (just under the app header) so it
 * is always one tap away. `-scroll-mt-5` cancels main's scroll padding, so jumping to it parks
 * it flush at the top where it sticks.
 */
export function CustomerTabBar({
  items,
  ariaLabel,
}: {
  items: CustomerTabItem[];
  ariaLabel: string;
}) {
  const { active, select } = useCustomerTabs();

  return (
    <div
      id={WORKSPACE_ANCHOR}
      className="sticky top-0 z-10 -mx-1 -scroll-mt-5 bg-slate-50/95 px-1 pt-1 backdrop-blur"
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {items.map((item) => {
          const isActive = item.value === active;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`customer-tab-${item.value}`}
              aria-selected={isActive}
              aria-controls={`customer-panel-${item.value}`}
              onClick={() => select(item.value)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {item.label}
              {item.count != null ? (
                <span
                  className={cn(
                    'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold leading-5',
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerTabPanel({ value, children }: { value: CustomerTab; children: ReactNode }) {
  const { active } = useCustomerTabs();
  return (
    <div
      role="tabpanel"
      id={`customer-panel-${value}`}
      aria-labelledby={`customer-tab-${value}`}
      hidden={active !== value}
      className="space-y-4"
    >
      {children}
    </div>
  );
}

/**
 * A button that jumps to another tab — used by the next-steps checklist and the header actions,
 * which are server-rendered but need to switch tabs without reloading the page.
 */
export function TabLink({
  tab,
  edit,
  anchor,
  className,
  children,
}: {
  tab: CustomerTab;
  edit?: string;
  anchor?: string;
  className?: string;
  children: ReactNode;
}) {
  const { available, select } = useCustomerTabs();
  if (!available.has(tab)) return null;
  return (
    <button type="button" onClick={() => select(tab, { edit, anchor })} className={className}>
      {children}
    </button>
  );
}
