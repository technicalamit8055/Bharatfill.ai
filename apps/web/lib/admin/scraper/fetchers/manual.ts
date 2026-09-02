import 'server-only';

import { z } from 'zod';
import { readNotificationWindow, scrapedCandidateSchema, validationFailed } from '@assistigo/core';
import { candidateFromWindow } from '../window-candidate';
import type { Fetcher, FetchContext, FetchOutcome } from './types';

/**
 * The manual fetcher: a human read the notification, and this stages what they read.
 *
 * It is the default for a reason. Most of what a scraper would do here — decide that a page is
 * about SSC GD Constable, decide that "31.03.2026" is the closing date and not the exam date — a
 * person does correctly in ten seconds and a parser does wrongly often enough to matter. This
 * path keeps the *pipeline* (staging, diff, review, audit, publish) while leaving the reading to
 * someone accountable.
 *
 * Two input shapes:
 *
 *   `{ candidates: [...] }`  a fully-formed candidate, which is what the admin form submits.
 *   `{ schemeSlug, text }`   paste the notification against an existing scheme; the dates are
 *                            read out of it and everything else is carried over unchanged.
 *
 * The second is the common case — a window moved, nothing else did — and it produces a candidate
 * that can only differ from the live scheme in its schedule.
 */

const pastedSchema = z.object({
  schemeSlug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug'),
  /** The notification text. Never stored — only the dates read out of it are. */
  text: z.string().min(1).max(200_000),
  sourceUrl: z.string().url(),
});

const directSchema = z.object({
  candidates: z.array(scrapedCandidateSchema).min(1).max(50),
});

const manualInputSchema = z.union([directSchema, pastedSchema]);

export const manualFetcher: Fetcher = {
  kind: 'manual',

  async fetch(context: FetchContext): Promise<FetchOutcome> {
    const parsed = manualInputSchema.safeParse(context.input);
    if (!parsed.success) {
      throw validationFailed({ fields: { input: 'admin.scrapers.manualInputInvalid' } });
    }

    if ('candidates' in parsed.data) {
      return { candidates: parsed.data.candidates, warnings: [] };
    }

    const { schemeSlug, text, sourceUrl } = parsed.data;
    const live = context.lookupScheme(schemeSlug);
    if (!live) {
      // Pasting text against a scheme that does not exist cannot produce a candidate: there is
      // nothing to carry the title, eligibility and pitch over from, and inventing them is not
      // this fetcher's job.
      return { candidates: [], warnings: [`unknown-scheme:${schemeSlug}`] };
    }

    const candidate = candidateFromWindow(live, readNotificationWindow(text), {
      sourceUrl,
      // A human chose the source and the scheme; only the date extraction is mechanical.
      confidence: 0.8,
      note: 'dates read from pasted notification text',
    });

    if (!candidate) return { candidates: [], warnings: [`no-dates-found:${schemeSlug}`] };
    return { candidates: [candidate], warnings: [] };
  },
};
