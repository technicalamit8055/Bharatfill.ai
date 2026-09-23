/**
 * Resolves the device colour scheme once and memoises the derived presets, so screens never
 * rebuild StyleSheets on every render.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { colorsFor, type ColorScheme, type ThemeColors } from './colors';
import { createPresets, navigationPresets, type ThemedPresets } from './presets';

type ThemeValue = {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly presets: ThemedPresets;
  readonly navigation: ReturnType<typeof navigationPresets>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeValue>(() => {
    const colors = colorsFor(scheme);
    return {
      scheme,
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
