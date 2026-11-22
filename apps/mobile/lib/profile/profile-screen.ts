/**
 * Profile tab view model: the account card, the settings rows in display order and the small
 * pure helpers the screen needs.
 *
 * Signed in, `signedInProfile` builds the card from the cloud account (`lib/cloud/account.ts`):
 * the name and the number it signed in with — all the account keeps
 * (docs/VAULT_BRIDGE_DESIGN.md D10). Email and the plan stay optional so development builds can
 * still show the mockup's sample account without the app claiming fields — or a paid tier — the
 * product owner has not signed off. Everything here is PII: read for display only, never logged.
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

/**
 * The card for a signed-in citizen, from what the cloud account holds (design D10: a name and a
 * language — no email, photo or plan). The number came through OTP, so it is verified whenever
 * it is known. Either may be missing while offline; the card then leaves that line out.
 */
export function signedInProfile(input: {
  readonly displayName: string | null;
  readonly phoneNumber: string | null;
}): ProfileState {
  return {
    status: 'signed_in',
    account: {
      fullName: input.displayName ?? '',
      phoneNumber: input.phoneNumber ?? '',
      phoneVerified: input.phoneNumber !== null,
      email: null,
      plan: null,
    },
  };
}

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
