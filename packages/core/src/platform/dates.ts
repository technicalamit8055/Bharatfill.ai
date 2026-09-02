/**
 * Reading application dates out of a government notification.
 *
 * Pure text in, ISO dates out — no network, no DOM, no AI. That is what makes this the part of
 * the scraper worth trusting: the risky step in the whole pipeline is "the robot decided the form
 * closes on the 3rd", and it is testable exhaustively here rather than observed in production.
 *
 * Two rules the rest of the pipeline depends on:
 *
 *   1. **Day-first, always.** Indian notifications write 05/03/2026 for 5 March. Parsing that as
 *      5 May because a JavaScript `Date` prefers month-first would move a deadline by two months
 *      and be almost invisible in review. Anything that cannot be day-first — 13/25/2026 — is
 *      discarded rather than reinterpreted.
 *   2. **Ambiguity is discarded, never guessed.** A date this module is not sure about produces
 *      no result, so the reviewer sees an empty field instead of a confident wrong one.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export type ExtractedDate = {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  /** Up to ~80 characters of the text immediately before the date, lower-cased. */
  context: string;
  /** Exactly what matched, for showing the reviewer what was read. */
  raw: string;
};

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Round-trip through UTC: `new Date(2026, 1, 30)` silently becomes 2 March, so comparing the
  // components back is the only way to reject a day the month does not have.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function toIso(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Two-digit years are read as 20xx.
 *
 * An application window is never in the 1900s, and a notification that writes `26` means 2026.
 * The 2000–2099 range is asserted rather than inferred so that a garbled `19` cannot become a
 * plausible-looking 1926 that then sorts before everything.
 */
function normaliseYear(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  if (raw.length === 4) return value >= 2000 && value <= 2099 ? value : null;
  if (raw.length === 2) return 2000 + value;
  return null;
}

/** `dd/mm/yyyy`, `dd-mm-yy`, `dd.mm.yyyy`. Day-first, unconditionally. */
const NUMERIC = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b/g;
/** `15 January 2026`, `15th Jan, 2026`. */
const DAY_MONTH = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g;
/** `January 15, 2026`, `Jan 15 2026`. */
const MONTH_DAY = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;

const CONTEXT_WINDOW = 80;

function contextBefore(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - CONTEXT_WINDOW), index)
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Every date this text plainly states, in the order they appear.
 *
 * Duplicates are kept: "closes 31/03/2026" appearing twice on a page is two pieces of evidence,
 * and `pickLabelledDate` wants both so the nearer label can win.
 */
export function extractNotificationDates(text: string): ExtractedDate[] {
  if (!text) return [];
  // Flattened to single spaces so a date split across a line break still matches, and so the
  // context before a date reads as one line. `\s` already covers the non-breaking spaces that
  // government pages are full of.
  const flat = text.replace(/\s+/g, ' ');
  const found: ExtractedDate[] = [];

  const push = (index: number, raw: string, iso: string | null) => {
    if (iso) found.push({ iso, context: contextBefore(flat, index), raw });
  };

  for (const match of flat.matchAll(NUMERIC)) {
    const [raw, day, month, year] = match;
    const parsedYear = normaliseYear(year ?? '');
    if (parsedYear === null) continue;
    push(match.index, raw, toIso(parsedYear, Number(month), Number(day)));
  }

  for (const match of flat.matchAll(DAY_MONTH)) {
    const [raw, day, monthName, year] = match;
    const month = MONTHS[(monthName ?? '').toLowerCase()];
    if (!month) continue;
    push(match.index, raw, toIso(Number(year), month, Number(day)));
  }

  for (const match of flat.matchAll(MONTH_DAY)) {
    const [raw, monthName, day, year] = match;
    const month = MONTHS[(monthName ?? '').toLowerCase()];
    if (!month) continue;
    push(match.index, raw, toIso(Number(year), month, Number(day)));
  }

  return found.sort((a, b) => flat.indexOf(a.raw) - flat.indexOf(b.raw));
}

/** Phrases that introduce the date a window opens. */
export const START_DATE_KEYWORDS = [
  'start',
  'opening',
  'opens',
  'commencement',
  'begin',
  'from',
  'available from',
  'registration start',
];

/** Phrases that introduce the date a window shuts. */
export const END_DATE_KEYWORDS = [
  'last date',
  'closing',
  'closes',
  'deadline',
  'end date',
  'upto',
  'up to',
  'till',
  'before',
  'final date',
];

export const EXAM_DATE_KEYWORDS = ['exam', 'examination', 'test date', 'paper'];

/**
 * The date whose preceding text mentions one of `keywords`.
 *
 * Nearest label wins: a page that says "Last date: 31/03/2026" and later "Exam: 20/05/2026" must
 * not hand the exam date back as the deadline because both appear under one heading. When no
 * date carries a matching label the answer is `null` — an unlabelled date is not evidence of
 * anything, and inventing one here is precisely the failure this pipeline exists to prevent.
 */
export function pickLabelledDate(
  dates: readonly ExtractedDate[],
  keywords: readonly string[],
): string | null {
  let best: { iso: string; distance: number } | null = null;

  for (const date of dates) {
    for (const keyword of keywords) {
      const at = date.context.lastIndexOf(keyword);
      if (at === -1) continue;
      // How far the label sits from the date. Smaller is a tighter association.
      const distance = date.context.length - at;
      if (!best || distance < best.distance) best = { iso: date.iso, distance };
    }
  }

  return best?.iso ?? null;
}

export type NotificationWindow = {
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  examDate: string | null;
};

/**
 * The application window a notification states, as far as it can be read with confidence.
 *
 * A window whose start is after its end is dropped entirely rather than half-kept: the labels
 * were misread, and passing one of the two on would be worse than passing neither.
 */
export function readNotificationWindow(text: string): NotificationWindow {
  const dates = extractNotificationDates(text);
  const start = pickLabelledDate(dates, START_DATE_KEYWORDS);
  const end = pickLabelledDate(dates, END_DATE_KEYWORDS);
  const exam = pickLabelledDate(dates, EXAM_DATE_KEYWORDS);

  if (start && end && start > end) {
    return { applicationStartDate: null, applicationEndDate: null, examDate: exam };
  }

  return { applicationStartDate: start, applicationEndDate: end, examDate: exam };
}
