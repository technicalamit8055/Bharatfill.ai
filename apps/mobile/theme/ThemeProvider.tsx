/**
 * Holds the app's colour scheme and memoises the derived presets, so screens never rebuild
 * StyleSheets on every render.
 *
 * The app is light unless the citizen turns dark mode on inside the app. The phone's own
 * dark-mode setting is deliberately ignored (and `app.json` pins native UI to light), so a
 * phone in dark mode still shows the light app. `setScheme` is the switch a Settings toggle
 * calls; it does not persist the choice yet.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { colorsFor, type ColorScheme, type ThemeColors } from './colors';
import { createPresets, navigationPresets, type ThemedPresets } from './presets';

/** The scheme the app starts in, whatever the phone is set to. */
export const DEFAULT_SCHEME: ColorScheme = 'light';

type ThemeValue = {
  readonly scheme: ColorScheme;
  readonly setScheme: (scheme: ColorScheme) => void;
  readonly colors: ThemeColors;
  readonly presets: ThemedPresets;
  readonly navigation: ReturnType<typeof navigationPresets>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<ColorScheme>(DEFAULT_SCHEME);

  const value = useMemo<ThemeValue>(() => {
    const colors = colorsFor(scheme);
    return {
      scheme,
      setScheme,
      colors,
      presets: createPresets(colors),
      navigation: navigationPresets(colors),
    };
  }, [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return value;
}
