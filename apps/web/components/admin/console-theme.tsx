'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { CONSOLE_THEMES, CONSOLE_THEME_COOKIE, type ConsoleTheme } from '@/lib/admin/console-theme';
import { useTranslations } from '@/lib/i18n/client';

/**
 * Light / dark / system for the staff console and its sign-in pages.
 *
 * `ConsoleThemeRoot` is the element that carries `data-console-theme`; every themed colour inside
 * it resolves through the variables tailwind.config.ts defines for that attribute. Switching is a
 * state change plus a cookie write — no reload, and the next server render already agrees.
 */

type ThemeContextValue = { theme: ConsoleTheme; setTheme: (theme: ConsoleTheme) => void };

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => undefined,
});

export function ConsoleThemeRoot({
  initialTheme,
  className,
  children,
}: {
  initialTheme: ConsoleTheme;
  className?: string;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ConsoleTheme>(initialTheme);

  const setTheme = useCallback((next: ConsoleTheme) => {
    setThemeState(next);
    try {
      // One year, lax, readable: a display preference, and it must survive a closed browser.
      document.cookie = `${CONSOLE_THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch {
      // Blocked cookies just mean the choice lasts until the tab closes.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <div data-console-theme={theme} className={className}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useConsoleTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const ICONS: Record<ConsoleTheme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

/** Three-way segmented control: System, Light, Dark. */
export function ConsoleThemeSwitch({ className }: { className?: string }) {
  const t = useTranslations();
  const { theme, setTheme } = useConsoleTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('admin.theme.label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-slate-900 p-0.5 ring-1 ring-inset ring-slate-800',
        className,
      )}
    >
      {CONSOLE_THEMES.map((option) => {
        const Icon = ICONS[option];
        const active = option === theme;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(`admin.theme.${option}`)}
            onClick={() => setTheme(option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
              active
                ? 'bg-slate-700/70 text-slate-50 shadow-sm'
                : 'text-slate-400 hover:text-slate-100',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">{t(`admin.theme.${option}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One icon button that steps through the three modes — for the console's top bar. */
export function ConsoleThemeToggle() {
  const t = useTranslations();
  const { theme, setTheme } = useConsoleTheme();
  const Icon = ICONS[theme];
  const next =
    CONSOLE_THEMES[(CONSOLE_THEMES.indexOf(theme) + 1) % CONSOLE_THEMES.length] ?? 'system';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={t('admin.theme.toggle', { theme: t(`admin.theme.${theme}`) })}
      title={t('admin.theme.toggle', { theme: t(`admin.theme.${theme}`) })}
      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}
