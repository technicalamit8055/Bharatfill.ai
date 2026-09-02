import 'server-only';

import type { ScrapedCandidate, SchemeDefinition } from '@assistigo/core';
import type { ScraperSourceRow } from '../../../supabase/database.types';

/**
 * The fetcher contract.
 *
 * A fetcher's only job is to turn a source into *candidates*. It does not decide what is new,
 * does not diff, does not write anything and cannot publish — that is all in ../run.ts, behind
 * human review. Keeping the contract this narrow is what lets a risky fetcher (`http`) sit beside
 * a safe one (`manual`) without the risk spreading.
 */

export type FetchContext = {
  source: ScraperSourceRow;
  /**
   * Per-invocation input. The `manual` fetcher receives the candidate an employee submitted; the
   * others ignore it.
   */
  input?: unknown;
  /**
   * The currently published global scheme for a slug, or null.
   *
   * Passed in rather than queried, so a fetcher stays pure enough to test with a stub and cannot
   * quietly acquire a database of its own.
   */
  lookupScheme: (slug: string) => SchemeDefinition | null;
};

export type FetchOutcome = {
  candidates: ScrapedCandidate[];
  /**
   * Non-fatal notes: a page that parsed but yielded no dates, a source whose scheme slug is not
   * in the catalogue. Shown on the run record.
   *
   * Must never quote page content. A government page can carry a name or a roll number in a
   * results table, and a warning is the easiest place for that to end up on disk.
   */
  warnings: string[];
};

export interface Fetcher {
  readonly kind: ScraperSourceRow['fetcher'];
  fetch(context: FetchContext): Promise<FetchOutcome>;
}
