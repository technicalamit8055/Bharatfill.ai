/**
 * Everyday papers and smart reminders (docs/CITIZEN_MOBILE_APP_SPEC.md §3 Feature 2b).
 *
 * Besides form documents, households keep a drawer of everyday papers: electricity and gas
 * bills, a bike's RC, insurance and PUC, school fee receipts, Khatauni / Jamabandi land records,
 * prescriptions and warranty cards. The app files these under an everyday *kind*, which lives
 * only in the on-phone vault index. Their core type is `generic` ("Other document"), so the
 * §15 rule in `@assistigo/core` keeps them on this phone by default: never uploaded, never read
 * by the AI reader, never seen by a centre. The kind never leaves the phone either, so the
 * operator side has no new vocabulary to agree on.
 *
 * Each kind (and each core type) has a reminder rule: whether its date is an expiry or a due
 * date, how many days ahead to remind, an optional suggested validity to start the date picker
 * on, and what to offer when it is close ("Renew at a centre", "Pay at a centre").
 *
 * `upcomingReminders` turns the vault into Home's "Coming up" list. Pure: no storage, no clock
 * of its own. Titles stay on screen only — a lock-screen notification never names a document
 * (`lib/family/use-reminder-copy.ts`).
 */

import type { DocumentType } from '@assistigo/core';

import { daysInMonth, localDateParts, parseIsoDate, toIsoDate } from '../profile/date-of-birth';
import { categoryOf } from './categories';

export const EVERYDAY_KINDS = [
  'electricity_bill',
  'gas_bill',
  'vehicle_rc',
  'vehicle_insurance',
  'vehicle_puc',
  'school_fee_receipt',
  'land_record',
  'prescription',
  'warranty_card',
] as const;
export type EverydayKind = (typeof EVERYDAY_KINDS)[number];

export function isEverydayKind(value: unknown): value is EverydayKind {
  return typeof value === 'string' && (EVERYDAY_KINDS as readonly string[]).includes(value);
}

/** Translation key for an everyday kind's name: `everydayKinds.<kind>`. */
export function everydayKindLabelKey(kind: EverydayKind): string {
  return `everydayKinds.${kind}`;
}

/** The core type an everyday paper is stored as: "Other document", which stays on the phone. */
export const EVERYDAY_DOCUMENT_TYPE: DocumentType = 'generic';

// ---- Reminder rules -------------------------------------------------------------------------

/** What the saved date means: the paper stops being valid, or something must be paid or done. */
export const DATE_MEANINGS = ['expires', 'due'] as const;
export type DateMeaning = (typeof DATE_MEANINGS)[number];

/** What the "Coming up" card offers next to a date that is close. */
export const REMINDER_ACTIONS = ['renew', 'pay'] as const;
export type ReminderAction = (typeof REMINDER_ACTIONS)[number];

export type ReminderRule = {
  readonly dateMeaning: DateMeaning;
  /**
   * Days before the date to remind, earliest first, ending at 0 (the day itself). One
   * notification is scheduled, at the earliest that is still ahead; Home's card shows the
   * document from the first of these.
   */
  readonly leadDays: readonly number[];
  /**
   * Months from today the date picker starts on, for papers whose validity is usually fixed
   * (insurance a year, PUC six months). The citizen still checks it against the paper and
   * confirms. A shorter guess only reminds early, never late.
   */
  readonly suggestedMonths: number | null;
  /** Null: nothing to offer but opening the document. */
  readonly action: ReminderAction | null;
};

/** Today's behaviour for everything without a rule of its own. */
export const DEFAULT_LEAD_DAYS = [30, 7, 1, 0] as const;

const DEFAULT_RULE: ReminderRule = {
  dateMeaning: 'expires',
  leadDays: DEFAULT_LEAD_DAYS,
  suggestedMonths: null,
  action: null,
};

const EVERYDAY_RULES: Readonly<Record<EverydayKind, ReminderRule>> = {
  // Bills: the due date is printed; three days is enough to pay, at a centre or online.
  electricity_bill: {
    dateMeaning: 'due',
    leadDays: [3, 1, 0],
    suggestedMonths: null,
    action: 'pay',
  },
  gas_bill: { dateMeaning: 'due', leadDays: [3, 1, 0], suggestedMonths: null, action: 'pay' },
  // RC renewal needs an inspection appointment, so start two months out.
  vehicle_rc: {
    dateMeaning: 'expires',
    leadDays: [60, 30, 7, 0],
    suggestedMonths: null,
    action: 'renew',
  },
  vehicle_insurance: {
    dateMeaning: 'expires',
    leadDays: [30, 7, 1, 0],
    suggestedMonths: 12,
    action: 'renew',
  },
  // PUC is quick to redo at a fuel station: a week's notice. Six months is the shorter validity.
  vehicle_puc: { dateMeaning: 'expires', leadDays: [7, 1, 0], suggestedMonths: 6, action: null },
  school_fee_receipt: {
    dateMeaning: 'due',
    leadDays: [7, 1, 0],
    suggestedMonths: null,
    action: null,
  },
  land_record: DEFAULT_RULE,
  // The date is a follow-up visit or a refill.
  prescription: { dateMeaning: 'due', leadDays: [1, 0], suggestedMonths: null, action: null },
  warranty_card: {
    dateMeaning: 'expires',
    leadDays: [30, 7, 0],
    suggestedMonths: 12,
    action: null,
  },
};

/** Certificates (income, caste, domicile) are renewed at a centre: offer it. */
const CERTIFICATE_RULE: ReminderRule = { ...DEFAULT_RULE, action: 'renew' };

/** The reminder rule for a saved document: its everyday kind first, then its core type. */
export function reminderRuleFor(document: {
  readonly everydayKind?: EverydayKind;
  readonly documentType?: DocumentType;
}): ReminderRule {
  if (document.everydayKind) return EVERYDAY_RULES[document.everydayKind];
  if (document.documentType && categoryOf(document.documentType) === 'certificate') {
    return CERTIFICATE_RULE;
  }
  return DEFAULT_RULE;
}

/**
 * The date the picker starts on for a kind with a usual validity: today plus that many
 * months, clamped to the month's last day (31 Jan + 1 month → 28/29 Feb). Null otherwise.
 */
export function suggestedDate(rule: ReminderRule, now: Date): string | null {
  if (rule.suggestedMonths === null) return null;
  const today = localDateParts(now);
  const total = today.month - 1 + rule.suggestedMonths;
  const year = today.year + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return toIsoDate({ year, month, day: Math.min(today.day, daysInMonth(year, month)) });
}

// ---- Counting days --------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(parts: { year: number; month: number; day: number }): number {
  // Noon UTC: whole days apart whatever the phone's time zone or a DST shift.
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day, 12) / DAY_MS);
}

/**
 * Calendar days from `now`'s local date to `isoDate`: 0 today, 1 tomorrow, negative once past.
 * Null for a date that does not parse.
 */
export function daysUntil(isoDate: string, now: Date): number | null {
  const parts = parseIsoDate(isoDate);
  if (!parts) return null;
  return dayNumber(parts) - dayNumber(localDateParts(now));
}

/** "today", "tomorrow" or "in 7 days", as a translation key and its values. */
export function countdownKey(days: number): { key: string; values?: { days: number } } {
  if (days <= 0) return { key: 'reminders.when.today' };
  if (days === 1) return { key: 'reminders.when.tomorrow' };
  return { key: 'reminders.when.days', values: { days } };
}

// ---- Home's "Coming up" ---------------------------------------------------------------------

/** How long a passed date stays on the card: an expired paper still needs renewing. */
export const OVERDUE_DAYS: Readonly<Record<DateMeaning, number>> = { expires: 30, due: 3 };

/** At most this many on Home; the soonest first. */
export const UPCOMING_LIMIT = 3;

export type UpcomingState = 'soon' | 'today' | 'overdue';

export type UpcomingReminder = {
  readonly id: string;
  readonly expiresOn: string;
  /** Days from today; negative once passed. */
  readonly days: number;
  readonly state: UpcomingState;
  readonly dateMeaning: DateMeaning;
  readonly action: ReminderAction | null;
};

export type UpcomingSource = {
  readonly id: string;
  readonly expiresOn?: string;
  readonly everydayKind?: EverydayKind;
  readonly documentType?: DocumentType;
};

/**
 * The documents whose date is inside their reminder window (from the first lead day) or passed
 * within `OVERDUE_DAYS`, soonest first, at most `limit`. Overdue ones lead: they need doing now.
 */
export function upcomingReminders(
  documents: readonly UpcomingSource[],
  now: Date,
  limit: number = UPCOMING_LIMIT,
): UpcomingReminder[] {
  const upcoming: UpcomingReminder[] = [];
  for (const document of documents) {
    if (!document.expiresOn) continue;
    const days = daysUntil(document.expiresOn, now);
    if (days === null) continue;
    const rule = reminderRuleFor(document);
    const window = rule.leadDays[0] ?? 0;
    if (days > window || days < -OVERDUE_DAYS[rule.dateMeaning]) continue;
    upcoming.push({
      id: document.id,
      expiresOn: document.expiresOn,
      days,
      state: days < 0 ? 'overdue' : days === 0 ? 'today' : 'soon',
      dateMeaning: rule.dateMeaning,
      action: rule.action,
    });
  }
  return upcoming
    .sort((a, b) => a.days - b.days || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

/**
 * The line under a title on the card: "Expires in 7 days", "Due tomorrow", "Expired 3 days
 * ago", as a translation key and its values.
 */
export function upcomingMessage(reminder: Pick<UpcomingReminder, 'days' | 'dateMeaning'>): {
  key: string;
  values?: { days: number };
} {
  const base = `reminders.${reminder.dateMeaning}`;
  const { days } = reminder;
  if (days < -1) return { key: `${base}.pastDays`, values: { days: -days } };
  if (days === -1) return { key: `${base}.yesterday` };
  if (days === 0) return { key: `${base}.today` };
  if (days === 1) return { key: `${base}.tomorrow` };
  return { key: `${base}.inDays`, values: { days } };
}
