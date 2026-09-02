import 'server-only';

import {
  scrapedCandidateSchema,
  type NotificationWindow,
  type ScrapedCandidate,
  type SchemeDefinition,
} from '@assistigo/core';

/**
 * Builds a candidate that changes nothing but a scheme's application window.
 *
 * Shared by the `manual` and `http` fetchers, which do exactly this and differ only in where the
 * text came from and how much they trust it. Worth one function rather than two copies: the merge
 * rules below are subtle enough that two copies would eventually disagree, and a disagreement
 * here means a deadline that is right on one path and wrong on the other.
 *
 * Returns `null` when the read window says nothing at all, so a caller can report "no dates
 * found" rather than staging a candidate identical to what is already live.
 */
export function candidateFromWindow(
  live: SchemeDefinition,
  window: NotificationWindow,
  meta: { sourceUrl: string; confidence: number; note: string },
): ScrapedCandidate | null {
  if (!window.applicationStartDate && !window.applicationEndDate && !window.examDate) return null;

  const { id: _id, ...rest } = live;

  // Parsed rather than constructed. It re-validates the merged result — which matters, because
  // the merge can produce a combination neither input had, such as a start date now later than
  // the end date — and it is also what converts the live scheme's `readonly` criteria arrays into
  // the mutable shape a candidate carries.
  return scrapedCandidateSchema.parse({
    scheme: {
      ...rest,
      schedule: {
        // A date the text did not state leaves the live value alone. "Not mentioned" is not
        // "cleared": a notification that only names a closing date must not wipe the start date.
        applicationStartDate: window.applicationStartDate ?? live.schedule.applicationStartDate,
        applicationEndDate: window.applicationEndDate ?? live.schedule.applicationEndDate,
        examDate: window.examDate ?? live.schedule.examDate,
        // A scheme that has just been given a closing date is no longer open all year; the two
        // cannot both be true (0020, schemes_catalog_evergreen_has_no_end).
        isAlwaysOpen: window.applicationEndDate ? false : live.schedule.isAlwaysOpen,
      },
    },
    sourceUrl: meta.sourceUrl,
    confidence: meta.confidence,
    note: meta.note,
  });
}
