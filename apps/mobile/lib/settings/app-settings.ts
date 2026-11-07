/**
 * The app's own small settings: whether the citizen has been through onboarding, and the
 * language they picked. Kept so a cold start goes straight into the app, in the citizen's
 * language, instead of replaying onboarding every time.
 *
 * Nothing here is personal data — no name, number or document detail — and it must stay that
 * way: the file is plaintext (`settings-storage.ts`). Anything about the citizen belongs in the
 * encrypted vault, and storing profile details needs product-owner sign-off.
 *
 * Pure, so it is unit tested; reading and writing the file is `settings-storage.ts`.
 */

import { z } from 'zod';

import { LOCALES, type Locale } from '../i18n';

export const APP_SETTINGS_VERSION = 1;

const appSettingsSchema = z.object({
  version: z.literal(APP_SETTINGS_VERSION),
  onboardingComplete: z.boolean(),
  locale: z.enum(LOCALES).nullable(),
});

export type AppSettings = {
  /** The citizen has reached the app once (by finishing or skipping onboarding). */
  readonly onboardingComplete: boolean;
  /** The language picked in the app; null follows the phone's language. */
  readonly locale: Locale | null;
};

/** A first launch: onboarding still to come, the phone's language. */
export const DEFAULT_APP_SETTINGS: AppSettings = { onboardingComplete: false, locale: null };

/**
 * Settings from the file's text. Missing, corrupt or unrecognised content (a newer version, a
 * hand-edited file) gives the defaults rather than an error: the worst case is onboarding once
 * more, never an app that cannot start.
 */
export function parseAppSettings(json: string | null | undefined): AppSettings {
  if (!json) return DEFAULT_APP_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
  const parsed = appSettingsSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_APP_SETTINGS;
  return { onboardingComplete: parsed.data.onboardingComplete, locale: parsed.data.locale };
}

export function serialiseAppSettings(settings: AppSettings): string {
  return JSON.stringify({
    version: APP_SETTINGS_VERSION,
    onboardingComplete: settings.onboardingComplete,
    locale: settings.locale,
  });
}

/** `current` with `change` applied. */
export function withAppSettings(current: AppSettings, change: Partial<AppSettings>): AppSettings {
  return {
    onboardingComplete: change.onboardingComplete ?? current.onboardingComplete,
    locale: change.locale === undefined ? current.locale : change.locale,
  };
}
