import { describe, expect, it } from 'vitest';
import type { SchemeDefinition } from '@assistigo/core';
import { decideStaging, sanitiseRunError } from './run';
import { candidateFromWindow } from './window-candidate';

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
  eligibility: { minAge: 18, maxAge: 23, minEducationLevel: 'class10' },
  pitchTemplate: { en: 'Apply now, {name}.', hi: '{name}, अभी आवेदन करें।' },
  upcomingPitchTemplate: { en: 'Opens in {days} days.', hi: '{days} दिनों में खुलेगा।' },
};

const META = { sourceUrl: 'https://ssc.gov.in/notice', confidence: 0.8, note: 'test' };

function candidateWithEnd(applicationEndDate: string | null) {
  return candidateFromWindow(
    LIVE,
    { applicationStartDate: null, applicationEndDate, examDate: null },
    META,
  );
}

describe('candidateFromWindow', () => {
  it('returns null when the text stated no dates at all', () => {
    expect(
      candidateFromWindow(
        LIVE,
        { applicationStartDate: null, applicationEndDate: null, examDate: null },
        META,
      ),
    ).toBeNull();
  });

  /**
   * "Not mentioned" is not "cleared". A notification that only names a closing date must leave
   * the start date alone rather than wiping it.
   */
  it('keeps the live value for a date the notification did not state', () => {
    const candidate = candidateWithEnd('2026-03-15');
    expect(candidate?.scheme.schedule.applicationStartDate).toBe('2026-01-15');
    expect(candidate?.scheme.schedule.applicationEndDate).toBe('2026-03-15');
  });

  it('carries the rest of the scheme over unchanged', () => {
    const candidate = candidateWithEnd('2026-03-15');
    expect(candidate?.scheme.eligibility).toEqual(LIVE.eligibility);
    expect(candidate?.scheme.title).toEqual(LIVE.title);
    expect(candidate?.scheme.estimatedOperatorFee).toBe(LIVE.estimatedOperatorFee);
  });

  it('drops evergreen when a closing date arrives', () => {
    // "Open all year" and "closes on a date" cannot both be true — the database refuses it.
    const evergreen: SchemeDefinition = {
      ...LIVE,
      schedule: {
        applicationStartDate: null,
        applicationEndDate: null,
        isAlwaysOpen: true,
        examDate: null,
      },
    };
    const candidate = candidateFromWindow(
      evergreen,
      { applicationStartDate: null, applicationEndDate: '2026-03-15', examDate: null },
      META,
    );
    expect(candidate?.scheme.schedule.isAlwaysOpen).toBe(false);
    expect(candidate?.scheme.schedule.applicationEndDate).toBe('2026-03-15');
  });

  it('keeps evergreen when only an exam date arrives', () => {
    const evergreen: SchemeDefinition = {
      ...LIVE,
      schedule: {
        applicationStartDate: null,
        applicationEndDate: null,
        isAlwaysOpen: true,
        examDate: null,
      },
    };
    const candidate = candidateFromWindow(
      evergreen,
      { applicationStartDate: null, applicationEndDate: null, examDate: '2026-05-20' },
      META,
    );
    expect(candidate?.scheme.schedule.isAlwaysOpen).toBe(true);
  });

  it('throws rather than emit a window whose start is after its end', () => {
    // The merge can produce a combination neither input had. Better a failed run than a scheme
    // that says it opens after it closes.
    expect(() =>
      candidateFromWindow(
        LIVE,
        { applicationStartDate: null, applicationEndDate: '2025-12-01', examDate: null },
        META,
      ),
    ).toThrow();
  });
});

describe('decideStaging', () => {
  const noHashes = new Set<string>();

  it('stages a candidate that moves a deadline', () => {
    const candidate = candidateWithEnd('2026-03-15');
    const decision = decideStaging(candidate, LIVE, noHashes);
    expect(decision.stage).toBe(true);
    if (decision.stage) expect(decision.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('stages a scheme the catalogue has never seen', () => {
    const candidate = candidateWithEnd('2026-03-15');
    expect(decideStaging(candidate, null, noHashes).stage).toBe(true);
  });

  /**
   * The noise guard. A source polled every day that keeps finding the same unchanged notification
   * must not add a row each time — an inbox full of "nothing changed" stops being read, and that
   * is how a real deadline change gets approved without being looked at.
   */
  it('skips a candidate identical to what is published', () => {
    const candidate = candidateWithEnd('2026-02-28');
    expect(decideStaging(candidate, LIVE, noHashes)).toEqual({
      stage: false,
      reason: 'no_change',
    });
  });

  it('skips a candidate already sitting in the inbox', () => {
    const candidate = candidateWithEnd('2026-03-15');
    const first = decideStaging(candidate, LIVE, noHashes);
    expect(first.stage).toBe(true);
    if (!first.stage) return;

    expect(decideStaging(candidate, LIVE, new Set([first.hash]))).toEqual({
      stage: false,
      reason: 'duplicate',
    });
  });

  it('skips a candidate that fails validation', () => {
    expect(decideStaging({ nonsense: true }, LIVE, noHashes)).toEqual({
      stage: false,
      reason: 'invalid',
    });
    expect(decideStaging(null, LIVE, noHashes)).toEqual({ stage: false, reason: 'invalid' });
  });

  it('rejects a candidate whose scheme would not pass the catalogue schema', () => {
    const candidate = candidateWithEnd('2026-03-15');
    const tampered = {
      ...candidate,
      scheme: { ...candidate?.scheme, portalUrl: 'not-a-url' },
    };
    expect(decideStaging(tampered, LIVE, noHashes)).toEqual({ stage: false, reason: 'invalid' });
  });
});

describe('sanitiseRunError', () => {
  it('names the error type and message', () => {
    expect(sanitiseRunError(new TypeError('fetch failed'))).toBe('TypeError: fetch failed');
  });

  it('handles a non-Error throw', () => {
    expect(sanitiseRunError('boom')).toBe('UnknownError: run failed');
    expect(sanitiseRunError(undefined)).toBe('UnknownError: run failed');
  });

  /**
   * A fetch error can quote the URL that failed, and a government URL can carry a roll number or
   * an application id in its query string. The error column is for "why did this break".
   */
  it('strips query strings', () => {
    const message = sanitiseRunError(
      new Error('failed to load https://ssc.gov.in/result?rollNo=1234567&name=x'),
    );
    expect(message).not.toContain('rollNo');
    expect(message).not.toContain('1234567');
    expect(message).toContain('https://ssc.gov.in/result');
  });

  it('collapses whitespace and truncates', () => {
    const long = sanitiseRunError(new Error('x'.repeat(2000)));
    expect(long.length).toBeLessThanOrEqual(500);
    expect(sanitiseRunError(new Error('a\n\n   b'))).toBe('Error: a b');
  });
});
