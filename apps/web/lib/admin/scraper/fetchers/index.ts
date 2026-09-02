import 'server-only';

import type { ScraperFetcher } from '@assistigo/core';
import { manualFetcher } from './manual';
import { fixtureFetcher } from './fixture';
import { httpFetcher } from './http';
import type { Fetcher } from './types';

/** The fetcher registry. A source's `fetcher` column selects one of these and nothing else. */
const FETCHERS: Record<ScraperFetcher, Fetcher> = {
  manual: manualFetcher,
  fixture: fixtureFetcher,
  http: httpFetcher,
};

export function getFetcher(kind: ScraperFetcher): Fetcher {
  return FETCHERS[kind];
}

export { ScraperDisabledError, httpFetchingEnabled, isAllowedSourceUrl, robotsAllows, htmlToText } from './http';
export type { Fetcher, FetchContext, FetchOutcome } from './types';
