import 'server-only';

import { z } from 'zod';
import { scrapedCandidateSchema } from '@assistigo/core';
import type { Fetcher, FetchContext, FetchOutcome } from './types';

/**
 * The fixture fetcher: candidates come from the source's own `config.items`.
 *
 * Exists so the pipeline can be exercised end to end — staged, diffed, reviewed, published —
 * without a network, in a test, in a seed, and in a demo. A source configured this way is
 * inert: it produces exactly what somebody wrote into its config and nothing else.
 *
 * A malformed item is skipped rather than failing the run, so one bad fixture does not hide the
 * good ones behind an error.
 */

const configSchema = z.object({
  items: z.array(z.unknown()).max(200).default([]),
});

export const fixtureFetcher: Fetcher = {
  kind: 'fixture',

  async fetch(context: FetchContext): Promise<FetchOutcome> {
    const config = configSchema.safeParse(context.source.config);
    if (!config.success) return { candidates: [], warnings: ['config-invalid'] };

    const candidates = [];
    const warnings: string[] = [];

    for (const [index, item] of config.data.items.entries()) {
      const parsed = scrapedCandidateSchema.safeParse(item);
      if (!parsed.success) {
        // Index and failing paths only. The item is scheme reference data, but the habit of not
        // echoing unvalidated input into a log is worth keeping everywhere.
        warnings.push(
          `item-invalid:${index}:${parsed.error.issues.map((i) => i.path.join('.')).join('|')}`,
        );
        continue;
      }
      candidates.push(parsed.data);
    }

    return { candidates, warnings };
  },
};
