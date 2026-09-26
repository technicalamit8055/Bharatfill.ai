/**
 * Profile tab view model: the account card, the settings rows in display order and the small
 * pure helpers the screen needs.
 *
 * Nothing fills a profile from real data yet — sign-in and the saved profile are not live (see
 * the Profile route). Keeping the shape here means the account store only has to produce a
 * `ProfileAccount` when it lands; the screen does not change.
 *
 * Only `full_name`, `phone_number` and `avatar_url` have a home in the spec
 * (`docs/CITIZEN_MOBILE_APP_SPEC.md` §5.1). Email and the plan are optional so the screen can
 * show the mockup in development without the app claiming fields — or a paid tier — the product
 * owner has not signed off. Everything here is PII: read for display only, never logged.
 */

import { formatE164ForDisplay, indianMobileSchema } from '../auth/phone';
import { LOCALES, type Locale } from '../i18n';
import { normaliseFullName } from './profile';

/** The settings rows under the account card, in display order. Copy at `profile.menu.<item>`. */
export const PROFILE_MENU_ITEMS = [
  'personal',
  'security',
  'notifications',
  'language',
  'appearance',
  'help',
  'about',
] as const;
export type ProfileMenuItem = (typeof PROFILE_MENU_ITEMS)[number];

/** Plans with copy at `profile.plan.<plan>`. Only shown when the account carries one. */
export const PROFILE_PLANS = ['free'] as const;
export type ProfilePlan = (typeof PROFILE_PLANS)[number];

export type ProfileAccount = {
  readonly fullName: string;
  /** The 10 national digits of the sign-in number. */
  readonly phoneNumber: string;
  /** True once the number has passed OTP verification. */
  readonly phoneVerified: boolean;
  /** Not in the spec's account table; null unless a source for it is agreed. */
  readonly email: string | null;
  /** Null hides the plan card. */
  readonly plan: ProfilePlan | null;
};

/** What the screen shows: an account, or the signed-out prompt. */
export type ProfileState =
  | { readonly status: 'signed_out' }
  | { readonly status: 'signed_in'; readonly account: ProfileAccount };

export const SIGNED_OUT_PROFILE: ProfileState = { status: 'signed_out' };

/** "+91 98765 43210", or null when the digits are not a valid Indian mobile number. */
export function phoneLineOf(phoneNumber: string): string | null {
  return indianMobileSchema.safeParse(phoneNumber).success
    ? formatE164ForDisplay(phoneNumber)
    : null;
}

/** The name as the card shows it, or null when there is nothing but whitespace. */
export function displayNameOf(fullName: string): string | null {
  const name = normaliseFullName(fullName);
  return name.length > 0 ? name : null;
}

/** Translation key for a locale's name in the Language row and picker. */
export function languageLabelKey(locale: Locale): string {
  return `profile.languages.${locale}`;
}

/** Every locale the Language picker offers, in catalogue order. */
export const PROFILE_LANGUAGES: readonly Locale[] = LOCALES;

/** The version for "App version 1.0.0", or null when the build does not report one. */
export function appVersionOf(version: string | null | undefined): string | null {
  const trimmed = version?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
