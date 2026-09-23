/**
 * Hindi / English localisation for the citizen app.
 *
 * Deliberately mirrors `apps/web/lib/i18n` rather than pulling in an i18n framework: two
 * locales, no route segments, and a missing Hindi string must fall back to English rather than
 * render a raw key at a citizen mid-application.
 */

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
};

type Messages = typeof en;

const DICTIONARIES: Record<Locale, Messages> = {
  en,
  hi: hi as Messages,
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function lookup(dictionary: unknown, path: readonly string[]): unknown {
  let current: unknown = dictionary;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export type TranslateValues = Record<string, string | number>;

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

export type Translate = (key: string, values?: TranslateValues) => string;

/**
 * Returns a `t(key, values?)` function for the locale.
 *
 * Resolution order: requested locale, then English, then the key itself. The key is returned
 * only when the string is missing from both catalogues, which is a bug worth seeing in dev.
 */
export function createTranslator(locale: Locale): Translate {
  const primary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const fallback = DICTIONARIES[DEFAULT_LOCALE];

  return (key, values) => {
    const path = key.split('.');
    const hit = lookup(primary, path) ?? lookup(fallback, path);
    return typeof hit === 'string' ? interpolate(hit, values) : key;
  };
}
