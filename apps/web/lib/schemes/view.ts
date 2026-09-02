/**
 * The serialisable view model the scheme UI receives.
 *
 * Deliberately not `SchemeMatchResult` itself. That type carries `Set`s and the full scheme
 * definition, neither of which survives the server→client boundary cleanly, and shipping the whole
 * record to the browser would send a customer's eligibility *reasoning* somewhere it is not
 * needed. The server picks the locale, resolves every code to a translated string, and sends
 * across only what is rendered.
 *
 * No `server-only` here: the types are shared with client components, and `whatsappLink` runs in
 * the browser.
 */

import type {
  DocumentChecklistState,
  SchemeLifecycleStatus,
  SchemeMatchStatus,
} from '@assistigo/core';

export type SchemeChecklistItemView = {
  key: string;
  label: string;
  state: DocumentChecklistState;
};

export type SchemeRequirementView = {
  kind: 'profile_field' | 'document' | 'operator_confirmation';
  label: string;
};

export type SchemeMatchView = {
  slug: string;
  title: string;
  shortDescription: string;
  benefitHighlight: string;
  portalName: string;
  status: SchemeMatchStatus;
  /** Where the window stands today, so the row can show a countdown instead of a guess. */
  lifecycleStatus: SchemeLifecycleStatus;
  estimatedFee: number;
  daysRemaining: number | null;
  daysUntilOpen: number | null;
  appliedRelaxationYears: number;
  documentChecklist: SchemeChecklistItemView[];
  missingRequirements: SchemeRequirementView[];
  /** Both locales, so the operator can flip the pitch language without a round trip. */
  pitch: { en: string; hi: string };
  /**
   * The pitch with the document checklist appended — what actually gets sent on WhatsApp. For an
   * upcoming scheme this is the pre-collect message: come in with these papers before the rush.
   */
  outreachMessage: { en: string; hi: string };
  /** Where "Apply now" goes: the mapped portal form, or the portal itself. */
  applyHref: string;
};

export type SchemeReportView = {
  /** Open today. */
  activeOpportunities: SchemeMatchView[];
  /** Announced but not open yet — the document-collection list. */
  upcomingOpportunities: SchemeMatchView[];
  /** Blocked on one certificate or one unanswered question. */
  actionableMissingDocs: SchemeMatchView[];
  totalPotentialFee: number;
  topPitchScript: { en: string; hi: string } | null;
};

/**
 * A `wa.me` deep link the operator's own device opens.
 *
 * Nothing is sent from here: this composes a URL, and the operator's browser hands it to
 * WhatsApp. The number never reaches an Assistigo server as part of this action and is never
 * logged (docs/SECURITY.md §4). Indian mobiles are stored as bare ten digits, so the 91 country
 * code is added; anything that is not ten digits is refused rather than guessed at, because a
 * mistyped number would send a citizen's details to a stranger.
 */
export function whatsappLink(mobile: string, message: string): string | null {
  const digits = mobile.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `https://wa.me/91${national}?text=${encodeURIComponent(message)}`;
}
