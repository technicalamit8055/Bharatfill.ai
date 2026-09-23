import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';

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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(deviceLocale);

  const value = useMemo<I18nValue>(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale],
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
