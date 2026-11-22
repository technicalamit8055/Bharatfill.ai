/**
 * What the citizen has entered so far during sign-up, held in memory between the registration
 * screens rather than in route params (which can be logged by navigation tooling) or on disk.
 * Cleared as soon as the account is created or the citizen leaves the flow.
 */

import type { Locale } from '../i18n';

export type RegistrationDraft = {
  readonly displayName: string;
  readonly preferredLocale: Locale;
};

let draft: RegistrationDraft | null = null;

export function setRegistrationDraft(next: RegistrationDraft): void {
  draft = next;
}

export function registrationDraft(): RegistrationDraft | null {
  return draft;
}

export function clearRegistrationDraft(): void {
  draft = null;
}
