import { describe, expect, it } from 'vitest';
import type { SchemeDefinition } from '../schemes/types';
import {
  QUEUE_ITEM_STATUSES,
  candidateContentHash,
  canTransitionQueueItem,
  diffScheme,
  isTerminalRunStatus,
  scrapedCandidateSchema,
  scraperSourceInputSchema,
  type CandidateScheme,
} from './scraper';

const LIVE: SchemeDefinition = {
  id: 'row-1',
  slug: 'ssc-gd-constable',
  title: { en: 'SSC GD Constable', hi: 'एसएससी जीडी कांस्टेबल' },
  shortDescription: { en: 'Constable in CAPF.', hi: 'सीएपीएफ में कांस्टेबल।' },
  benefitsSummary: { en: 'Central government job.', hi: 'केंद्र सरकार की नौकरी।' },
  benefitHighlight: { en: '₹21,700+ starting pay', hi: '₹21,700+ प्रारंभिक वेतन' },
  category: 'recruitment',
  portalName: 'Staff Selection Commission',
  portalUrl: 'https://ssc.gov.in/',
  officialNotificationUrl: 'https://ssc.gov.in/notice',
  schedule: {
    applicationStartDate: '2026-01-15',
    applicationEndDate: '2026-02-28',
    isAlwaysOpen: false,
    examDate: null,
  },
  estimatedOperatorFee: 100,
  eligibility: {
    minAge: 18,
    maxAge: 23,
    ageRelaxations: { obc: 3, sc: 5, st: 5 },
    minEducationLevel: 'class10',
    requiredDocuments: ['aadhaar', 'marksheet_10th'],
  },
  pitchTemplate: { en: 'Apply now, {name}.', hi: '{name}, अभी आवेदन करें।' },
  upcomingPitchTemplate: { en: 'Opens in {days} days.', hi: '{days} दिनों में खुलेगा।' },
};

/**
 * The live scheme as a candidate — identical content, no id.
 *
 * Overrides are untyped because the result is parsed: `SchemeDefinition` carries `readonly`
 * criteria arrays that a candidate does not, so a `Partial<CandidateScheme>` parameter would
 * reject `{ ...LIVE.eligibility }` for a variance reason with nothing to do with what is being
 * tested. Parsing is also what the real fetchers do.
 */
function candidateFrom(overrides: Record<string, unknown> = {}): CandidateScheme {
  const { id: _id, ...rest } = LIVE;
  return scrapedCandidateSchema.shape.scheme.parse({ ...rest, ...overrides });
}

describe('diffScheme', () => {
  it('reports a scheme the catalogue has never seen as new, with no field rows', () => {
    const diff = diffScheme(null, candidateFrom());
    expect(diff.changeKind).toBe('new');
    expect(diff.changes).toHaveLength(0);
    expect(diff.scheduleOnly).toBe(false);
  });

  it('reports no change when the candidate matches what is published', () => {
    const diff = diffScheme(LIVE, candidateFrom());
    expect(diff.changeKind).toBe('no_change');
    expect(diff.changes).toHaveLength(0);
  });

  it('classifies a moved closing date as deadline_only', () => {
    const diff = diffScheme(
      LIVE,
      candidateFrom({
        schedule: { ...LIVE.schedule, applicationEndDate: '2026-03-15' },
      }),
    );

    expect(diff.changeKind).toBe('deadline_only');
    expect(diff.scheduleOnly).toBe(true);
    expect(diff.changes).toEqual([
      {
        path: 'schedule.applicationEndDate',
        group: 'schedule',
        before: '2026-02-28',
        after: '2026-03-15',
      },
    ]);
  });

  it('classifies an eligibility change as an update, not a deadline', () => {
    const diff = diffScheme(
      LIVE,
      candidateFrom({ eligibility: { ...LIVE.eligibility, maxAge: 25 } }),
    );

    expect(diff.changeKind).toBe('update');
    expect(diff.scheduleOnly).toBe(false);
    expect(diff.changes.map((change) => change.path)).toEqual(['eligibility']);
  });

  it('classifies a mixed change as an update', () => {
    const diff = diffScheme(
      LIVE,
      candidateFrom({
        schedule: { ...LIVE.schedule, applicationEndDate: '2026-03-15' },
        estimatedOperatorFee: 150,
      }),
    );

    expect(diff.changeKind).toBe('update');
    expect(diff.scheduleOnly).toBe(false);
    expect(diff.changes.map((change) => change.path).sort()).toEqual([
      'estimatedOperatorFee',
      'schedule.applicationEndDate',
    ]);
  });

  /**
   * The noise guard. A fetcher that emits criteria in a different key order must not fill the
   * inbox with rows that say nothing changed — an inbox nobody trusts is an inbox nobody reads.
   */
  it('ignores object key order', () => {
    const reordered = candidateFrom({
      eligibility: {
        requiredDocuments: ['aadhaar', 'marksheet_10th'],
        minEducationLevel: 'class10',
        ageRelaxations: { st: 5, sc: 5, obc: 3 },
        maxAge: 23,
        minAge: 18,
      },
    });
    expect(diffScheme(LIVE, reordered).changeKind).toBe('no_change');
  });

  it('does not ignore array order', () => {
    // Order is meaningful in a document checklist, so this genuinely is a change.
    const reordered = candidateFrom({
      eligibility: { ...LIVE.eligibility, requiredDocuments: ['marksheet_10th', 'aadhaar'] },
    });
    expect(diffScheme(LIVE, reordered).changeKind).toBe('update');
  });

  it('treats an absent optional field and a null one as the same', () => {
    const withoutAdapter = diffScheme(LIVE, candidateFrom());
    expect(withoutAdapter.changes.some((change) => change.path === 'adapterSlug')).toBe(false);
  });

  it('detects a newly set optional field', () => {
    const diff = diffScheme(LIVE, candidateFrom({ adapterSlug: 'ssc-online' }));
    expect(diff.changes).toEqual([
      { path: 'adapterSlug', group: 'identity', before: null, after: 'ssc-online' },
    ]);
  });

  it('detects a localised copy change on either language', () => {
    const diff = diffScheme(
      LIVE,
      candidateFrom({ title: { en: 'SSC GD Constable 2026', hi: LIVE.title.hi } }),
    );
    expect(diff.changeKind).toBe('update');
    expect(diff.changes[0]?.group).toBe('content');
  });

  it('detects a scheme becoming evergreen', () => {
    const diff = diffScheme(
      LIVE,
      candidateFrom({
        schedule: { ...LIVE.schedule, applicationEndDate: null, isAlwaysOpen: true },
      }),
    );
    expect(diff.changeKind).toBe('deadline_only');
    expect(diff.changes.map((change) => change.path).sort()).toEqual([
      'schedule.applicationEndDate',
      'schedule.isAlwaysOpen',
    ]);
  });
});

describe('candidateContentHash', () => {
  it('is stable across key order', () => {
    const a = candidateFrom();
    const b = candidateFrom({
      eligibility: {
        maxAge: 23,
        minAge: 18,
        minEducationLevel: 'class10',
        ageRelaxations: { st: 5, obc: 3, sc: 5 },
        requiredDocuments: ['aadhaar', 'marksheet_10th'],
      },
    });
    expect(candidateContentHash(a)).toBe(candidateContentHash(b));
  });

  it('changes when any tracked value changes', () => {
    const base = candidateContentHash(candidateFrom());
    expect(
      candidateContentHash(
        candidateFrom({ schedule: { ...LIVE.schedule, applicationEndDate: '2026-03-15' } }),
      ),
    ).not.toBe(base);
    expect(candidateContentHash(candidateFrom({ estimatedOperatorFee: 150 }))).not.toBe(base);
  });

  it('is 16 lowercase hex characters', () => {
    expect(candidateContentHash(candidateFrom())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic across calls', () => {
    expect(candidateContentHash(candidateFrom())).toBe(candidateContentHash(candidateFrom()));
  });
});

describe('queue transitions', () => {
  it('lets a pending item be approved, rejected or superseded', () => {
    expect(canTransitionQueueItem('pending', 'approved')).toBe(true);
    expect(canTransitionQueueItem('pending', 'rejected')).toBe(true);
    expect(canTransitionQueueItem('pending', 'superseded')).toBe(true);
  });

  it('makes a reviewed item final', () => {
    for (const from of ['approved', 'rejected', 'superseded'] as const) {
      for (const to of QUEUE_ITEM_STATUSES) {
        expect(canTransitionQueueItem(from, to)).toBe(false);
      }
    }
  });
});

describe('run statuses', () => {
  it('treats only finished states as terminal', () => {
    expect(isTerminalRunStatus('pending')).toBe(false);
    expect(isTerminalRunStatus('running')).toBe(false);
    expect(isTerminalRunStatus('succeeded')).toBe(true);
    expect(isTerminalRunStatus('partial')).toBe(true);
    expect(isTerminalRunStatus('failed')).toBe(true);
    expect(isTerminalRunStatus('cancelled')).toBe(true);
  });
});

describe('scrapedCandidateSchema', () => {
  it('defaults confidence rather than requiring it', () => {
    const { id: _id, ...scheme } = LIVE;
    const parsed = scrapedCandidateSchema.parse({
      scheme,
      sourceUrl: 'https://ssc.gov.in/notice',
    });
    expect(parsed.confidence).toBe(0.5);
  });

  it('rejects a candidate whose scheme fails the catalogue schema', () => {
    const { id: _id, ...scheme } = LIVE;
    const result = scrapedCandidateSchema.safeParse({
      scheme: { ...scheme, slug: 'Not A Slug' },
      sourceUrl: 'https://ssc.gov.in/notice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a window whose start is after its end', () => {
    const { id: _id, ...scheme } = LIVE;
    const result = scrapedCandidateSchema.safeParse({
      scheme: {
        ...scheme,
        schedule: { ...scheme.schedule, applicationStartDate: '2026-06-01' },
      },
      sourceUrl: 'https://ssc.gov.in/notice',
    });
    expect(result.success).toBe(false);
  });
});

describe('scraperSourceInputSchema', () => {
  const base = {
    slug: 'ssc-notifications',
    name: 'SSC notifications',
    portalName: 'Staff Selection Commission',
    sourceUrl: 'https://ssc.gov.in/notice-board',
    fetcher: 'http' as const,
  };

  it('accepts a well-formed source and defaults the interval to a day', () => {
    const parsed = scraperSourceInputSchema.parse(base);
    expect(parsed.intervalMinutes).toBe(1440);
    expect(parsed.isEnabled).toBe(true);
  });

  it('refuses a plaintext source URL', () => {
    const result = scraperSourceInputSchema.safeParse({
      ...base,
      sourceUrl: 'http://ssc.gov.in/notice-board',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a poll interval under an hour', () => {
    expect(scraperSourceInputSchema.safeParse({ ...base, intervalMinutes: 30 }).success).toBe(
      false,
    );
    expect(scraperSourceInputSchema.safeParse({ ...base, intervalMinutes: 60 }).success).toBe(
      true,
    );
  });
});
