import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';

import { readAppSettings, updateAppSettings } from '../settings/settings-storage';
import { createTranslator, DEFAULT_LOCALE, isLocale, type Locale, type Translate } from './index';

type I18nValue = {
  readonly locale: Locale;
  readonly t: Translate;
  readonly setLocale: (next: Locale) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Best-effort device locale. Expo's `expo-localization` is the eventual home for this; until
 * it is added, read the platform tag and fall back to English on anything unrecognised.
 */
function deviceLocale(): Locale {
  const tag =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale
      : NativeModules.I18nManager?.localeIdentifier;

  const language = typeof tag === 'string' ? tag.slice(0, 2).toLowerCase() : undefined;
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

/**
 * The language: the one the citizen picked in the app, remembered between launches
 * (`lib/settings`), else the phone's. Read synchronously, so the first frame is already in it.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => readAppSettings().locale ?? deviceLocale(),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void updateAppSettings({ locale: next });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useTranslation must be used inside <I18nProvider>.');
  }
  return value;
}
