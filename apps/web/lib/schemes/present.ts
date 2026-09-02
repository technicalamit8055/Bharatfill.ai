import 'server-only';

import type { CustomerSchemeReport, SchemeDefinition, SchemeMatchResult } from '@assistigo/core';
import { LOCALES, createTranslator, localised, type Locale } from '../i18n';
import type { SchemeMatchView, SchemeReportView, SchemeRequirementView } from './view';

/**
 * Turns evaluator output into the strings the UI renders.
 *
 * This is the one place a `SchemeUnknownReason` or a `SchemeIneligibilityCode` becomes a sentence.
 * Keeping it on the server means the domain layer never carries display text and the client never
 * carries the translation tables for reasons it will not show.
 */

/**
 * Where "Apply now" should take the operator.
 *
 * A scheme wired to a portal adapter goes through the form library, where the extension can
 * autofill it. Everything else opens the government portal in a new tab — which is also why this
 * never auto-starts anything: the operator submits, the software does not (master spec §14.6).
 */
export function applyHref(scheme: SchemeDefinition, customerId?: string): string {
  if (!scheme.adapterSlug) return scheme.portalUrl;
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
  return `/form-library/${scheme.adapterSlug}${query}`;
}

/**
 * The message the operator actually sends: the pitch, then the papers to bring.
 *
 * Built in both locales rather than the page's one, because the widget lets the operator switch
 * language on the spot — a customer who reads Hindi should not get an English document list
 * because the operator happens to run the dashboard in English.
 *
 * Documents already on file are still listed. The customer has to carry the originals to the
 * counter whatever the CRM holds, and a list that silently omits half of them sends them home
 * again.
 */
export function outreachMessage(result: SchemeMatchResult): { en: string; hi: string } {
  const message = {} as Record<Locale, string>;

  for (const locale of LOCALES) {
    const pitch = result.pitch[locale];
    if (result.documentChecklist.length === 0) {
      message[locale] = pitch;
      continue;
    }
    const t = createTranslator(locale);
    const items = result.documentChecklist
      .map((item) => `• ${localised(item.label, locale)}`)
      .join('\n');
    message[locale] = `${pitch}\n\n${t('schemes.outreachDocsHeader')}\n${items}`;
  }

  return { en: message.en, hi: message.hi };
}

export function toMatchView(
  result: SchemeMatchResult,
  locale: Locale,
  t: (key: string, values?: Record<string, string | number>) => string,
  customerId?: string,
): SchemeMatchView {
  const relaxationYears = Object.values(result.appliedRelaxations).reduce<number>(
    (sum, years) => sum + (years ?? 0),
    0,
  );

  return {
    slug: result.scheme.slug,
    title: localised(result.scheme.title, locale),
    shortDescription: localised(result.scheme.shortDescription, locale),
    benefitHighlight: localised(result.scheme.benefitHighlight, locale),
    portalName: result.scheme.portalName,
    status: result.status,
    lifecycleStatus: result.lifecycleStatus,
    estimatedFee: result.estimatedFee,
    daysRemaining: result.daysRemaining,
    daysUntilOpen: result.daysUntilOpen,
    appliedRelaxationYears: relaxationYears,
    documentChecklist: result.documentChecklist.map((item) => ({
      key: item.key,
      label: localised(item.label, locale),
      state: item.state,
    })),
    missingRequirements: result.missingRequirements.map((requirement): SchemeRequirementView => ({
      kind: requirement.kind,
      label:
        requirement.kind === 'operator_confirmation'
          ? t('schemes.confirmTrait', { trait: localised(requirement.label, locale) })
          : localised(requirement.label, locale),
    })),
    pitch: result.pitch,
    outreachMessage: outreachMessage(result),
    applyHref: applyHref(result.scheme, customerId),
  };
}

export function toReportView(
  report: CustomerSchemeReport,
  locale: Locale,
  t: (key: string, values?: Record<string, string | number>) => string,
  customerId?: string,
): SchemeReportView {
  const view = (results: SchemeMatchResult[]) =>
    results.map((result) => toMatchView(result, locale, t, customerId));

  return {
    activeOpportunities: view(report.activeOpportunities),
    upcomingOpportunities: view(report.upcomingOpportunities),
    actionableMissingDocs: view(report.actionableMissingDocs),
    totalPotentialFee: report.totalPotentialFee,
    topPitchScript: report.topPitchScript,
  };
}

/** Human-readable reason a customer does not qualify, for the scheme detail breakdown. */
export function ineligibilityText(
  result: SchemeMatchResult,
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  return result.ineligibilityReasons.map((reason) =>
    t(`schemes.reasons.${reason.code}`, reason.values ?? {}),
  );
}
