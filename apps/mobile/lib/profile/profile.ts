/**
 * The citizen profile collected at step 2 of registration ("Tell Us About Yourself"): full
 * name, date of birth, gender, state and preferred language.
 *
 * Only the name has a home in the spec (`citizen_accounts.full_name`,
 * `docs/CITIZEN_MOBILE_APP_SPEC.md` §5.1). Where the other fields are stored, and for how long,
 * is a product-owner decision that has not been made, so the profile is validated here and the
 * route decides what happens to it. Nothing here logs or persists it — it is PII.
 *
 * Vocabularies come from `@assistigo/core` so the operator dashboard reads the same values:
 * states are core's `IndianStateCode`, and every gender here is also a value of core's
 * `genderSchema`.
 */

import { INDIAN_STATE_CODES, INDIAN_STATES, type IndianStateCode } from '@assistigo/core';
import { z } from 'zod';

import { LOCALES, type Locale } from '../i18n';
import { dateOfBirthStatus, type DateOfBirthStatus } from './date-of-birth';

/** The three choices on the screen. */
export const PROFILE_GENDERS = ['male', 'female', 'other'] as const;
export type ProfileGender = (typeof PROFILE_GENDERS)[number];

/** Core's `fullName` limits, so the name syncs to the customer profile unchanged. */
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 160;

/**
 * Letters in any script with their combining marks (Devanagari matras are marks), plus the
 * space, full stop, apostrophe and hyphen that real names use. Starts with a letter.
 */
const FULL_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export const citizenProfileSchema = z.object({
  fullName: z.string().min(FULL_NAME_MIN_LENGTH).max(FULL_NAME_MAX_LENGTH).regex(FULL_NAME_PATTERN),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(PROFILE_GENDERS),
  state: z.enum(INDIAN_STATE_CODES),
  language: z.enum(LOCALES),
});

export type CitizenProfile = z.infer<typeof citizenProfileSchema>;

/** The form while the citizen is filling it in. */
export type ProfileDraft = {
  readonly fullName: string;
  /** ISO `YYYY-MM-DD`. */
  readonly dateOfBirth: string | null;
  readonly gender: ProfileGender | null;
  readonly state: IndianStateCode | null;
  readonly language: Locale;
};

export type FullNameError = 'missing' | 'too_short' | 'too_long' | 'invalid_characters';

/** One entry per field that still needs attention; a field with no problem has no key. */
export type ProfileErrors = {
  fullName?: FullNameError;
  dateOfBirth?: 'missing' | Exclude<DateOfBirthStatus, 'valid'>;
  gender?: 'missing';
  state?: 'missing';
};

/** Trims and collapses runs of whitespace: "  Sample   Citizen " → "Sample Citizen". */
export function normaliseFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function fullNameError(raw: string): FullNameError | null {
  const name = normaliseFullName(raw);
  if (name.length === 0) return 'missing';
  if (name.length < FULL_NAME_MIN_LENGTH) return 'too_short';
  if (name.length > FULL_NAME_MAX_LENGTH) return 'too_long';
  if (!FULL_NAME_PATTERN.test(name)) return 'invalid_characters';
  return null;
}

/** Every field that still needs attention, as of `now` (the date of birth depends on it). */
export function profileErrors(draft: ProfileDraft, now: Date): ProfileErrors {
  const errors: ProfileErrors = {};

  const fullName = fullNameError(draft.fullName);
  if (fullName) errors.fullName = fullName;

  const dateOfBirth = draft.dateOfBirth ? dateOfBirthStatus(draft.dateOfBirth, now) : 'missing';
  if (dateOfBirth !== 'valid') errors.dateOfBirth = dateOfBirth;

  if (!draft.gender) errors.gender = 'missing';
  if (!draft.state) errors.state = 'missing';

  return errors;
}

export function hasProfileErrors(errors: ProfileErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The finished, normalised profile, or `null` while any field still has an error. */
export function toCitizenProfile(draft: ProfileDraft, now: Date): CitizenProfile | null {
  if (hasProfileErrors(profileErrors(draft, now))) return null;

  const parsed = citizenProfileSchema.safeParse({
    ...draft,
    fullName: normaliseFullName(draft.fullName),
  });
  return parsed.success ? parsed.data : null;
}

export type StateOption = { readonly value: IndianStateCode; readonly label: string };

/** Every state and union territory, named and sorted in the citizen's language. */
export function stateOptions(locale: Locale): StateOption[] {
  return INDIAN_STATES.map((state) => ({ value: state.code, label: state.name[locale] })).sort(
    (a, b) => a.label.localeCompare(b.label, locale),
  );
}

/**
 * What cloud sign-up actually keeps (docs/VAULT_BRIDGE_DESIGN.md D10): the name as on the
 * citizen's documents and their language. Date of birth, gender and state are not asked for.
 */
export type SignupProfile = { readonly fullName: string; readonly language: Locale };

/** The normalised sign-up profile, or the name's error. */
export function toSignupProfile(
  rawName: string,
  language: Locale,
): { ok: true; profile: SignupProfile } | { ok: false; error: FullNameError } {
  const error = fullNameError(rawName);
  if (error) return { ok: false, error };
  return { ok: true, profile: { fullName: normaliseFullName(rawName), language } };
}
