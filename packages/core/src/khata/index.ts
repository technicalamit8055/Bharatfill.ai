/**
 * Counter billing and the udhar khata (migration 0050, spec §21.2, §33 V1.5).
 *
 * Every number the operator reads — what the bill comes to, what is still owed, what is in the
 * cash drawer tonight — has exactly one definition here, and it mirrors the database trigger
 * `derive_application_bill()` so the screen and the stored row never disagree.
 *
 * Money is added up in whole paise. `0.1 + 0.2` is not a rounding problem a cash register is
 * allowed to have.
 *
 * Nothing here touches a customer value: amounts, methods and timestamps only.
 */

import { z } from 'zod';

export const PAYMENT_KINDS = ['payment', 'refund'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_METHODS = ['cash', 'upi', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILL_PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'] as const;
export type BillPaymentStatus = (typeof BILL_PAYMENT_STATUSES)[number];

/** Same cap as the database check: ten lakh rupees on one line is a typo, not a form fee. */
export const MAX_BILL_AMOUNT = 1_000_000;

export const PAYMENT_NOTE_MAX = 200;

// ---------------------------------------------------------------------------
// Paise arithmetic
// ---------------------------------------------------------------------------

/**
 * Rupees to whole paise. PostgREST returns `numeric` as a number or, for some drivers, a string;
 * both are accepted. Anything unreadable counts as zero rather than poisoning a total with NaN.
 */
export function toPaise(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const value = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/** ₹1,250 or ₹1,250.50 — Indian digit grouping, paise only when there are any. */
export function formatRupees(amount: number | string | null | undefined): string {
  const paise = toPaise(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(fromPaise(paise));
}

/** The printed receipt number: B00042. */
export function formatBillNumber(billNumber: number | string | null | undefined): string | null {
  if (billNumber === null || billNumber === undefined) return null;
  const value = Number(billNumber);
  if (!Number.isInteger(value) || value <= 0) return null;
  return `B${String(value).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// The bill
// ---------------------------------------------------------------------------

export type LedgerEntry = {
  kind: PaymentKind;
  method: PaymentMethod;
  amount: number | string;
  createdAt: string;
};

export type BillFees = {
  govtFee: number | string | null;
  serviceCharge: number | string | null;
  /** The stored total. Used only when no breakdown exists (applications from before 0050). */
  amountCharged: number | string | null;
};

export type BillSummary = {
  /** Null when no fee has been set at all — there is nothing to bill yet. */
  total: number | null;
  paid: number;
  due: number;
  /** Null for a legacy row with no breakdown and no ledger: its manual status stands. */
  status: BillPaymentStatus | null;
};

function hasFees(fees: BillFees): boolean {
  return fees.govtFee !== null || fees.serviceCharge !== null;
}

/** The bill as the trigger derives it. */
export function summariseBill(fees: BillFees, entries: readonly LedgerEntry[]): BillSummary {
  const breakdown = hasFees(fees);
  const totalPaise = breakdown
    ? toPaise(fees.govtFee) + toPaise(fees.serviceCharge)
    : fees.amountCharged === null
      ? null
      : toPaise(fees.amountCharged);

  let paidPaise = 0;
  let refunded = false;
  for (const entry of entries) {
    const paise = toPaise(entry.amount);
    if (entry.kind === 'refund') {
      paidPaise -= paise;
      refunded = true;
    } else {
      paidPaise += paise;
    }
  }

  let status: BillPaymentStatus | null = null;
  if (breakdown || entries.length > 0) {
    if (paidPaise === 0 && refunded) status = 'refunded';
    else if (totalPaise !== null && paidPaise >= totalPaise) status = 'paid';
    else if (paidPaise > 0) status = 'partial';
    else status = 'unpaid';
  }

  return {
    total: totalPaise === null ? null : fromPaise(totalPaise),
    paid: fromPaise(paidPaise),
    due: fromPaise(Math.max((totalPaise ?? 0) - paidPaise, 0)),
    status,
  };
}

export type PaymentCheck = { ok: true } | { ok: false; messageKey: string };

/**
 * Whether a new ledger entry fits the bill. The database enforces the same rule; this exists so
 * the operator gets a sentence instead of a constraint name.
 */
export function checkLedgerEntry(
  summary: BillSummary,
  entry: { kind: PaymentKind; amount: number },
): PaymentCheck {
  if (summary.total === null) return { ok: false, messageKey: 'errors.khata_no_fees' };
  const amount = toPaise(entry.amount);
  if (amount <= 0) return { ok: false, messageKey: 'errors.validation_failed' };
  if (entry.kind === 'payment' && amount > toPaise(summary.due)) {
    return { ok: false, messageKey: 'errors.khata_more_than_due' };
  }
  if (entry.kind === 'refund' && amount > toPaise(summary.paid)) {
    return { ok: false, messageKey: 'errors.khata_refund_more_than_paid' };
  }
  return { ok: true };
}

/** A new fee total may not drop below what the citizen has already paid. */
export function checkFees(
  fees: { govtFee: number | null; serviceCharge: number | null },
  paid: number,
): PaymentCheck {
  const total = toPaise(fees.govtFee) + toPaise(fees.serviceCharge);
  if (total < toPaise(paid)) return { ok: false, messageKey: 'errors.khata_fee_below_paid' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The day's tally
// ---------------------------------------------------------------------------

export type DayTally = {
  /** Net of refunds, per method — what should be in the drawer and in the UPI app. */
  cash: number;
  upi: number;
  other: number;
  /** All refunds given out, whatever the method. */
  refunds: number;
  /** Everything in, minus everything back. */
  net: number;
  payments: number;
  refundCount: number;
};

export function tallyDay(
  entries: readonly Pick<LedgerEntry, 'kind' | 'method' | 'amount'>[],
): DayTally {
  const byMethod: Record<PaymentMethod, number> = { cash: 0, upi: 0, other: 0 };
  let refunds = 0;
  let payments = 0;
  let refundCount = 0;
  for (const entry of entries) {
    const paise = toPaise(entry.amount);
    if (entry.kind === 'refund') {
      byMethod[entry.method] -= paise;
      refunds += paise;
      refundCount += 1;
    } else {
      byMethod[entry.method] += paise;
      payments += 1;
    }
  }
  return {
    cash: fromPaise(byMethod.cash),
    upi: fromPaise(byMethod.upi),
    other: fromPaise(byMethod.other),
    refunds: fromPaise(refunds),
    net: fromPaise(byMethod.cash + byMethod.upi + byMethod.other),
    payments,
    refundCount,
  };
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Today in IST as `YYYY-MM-DD` — the centre's day, not the server's. */
export function istToday(asOf: Date = new Date()): string {
  return new Date(asOf.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instants an IST calendar day spans, `[start, end)`. Null for a malformed key. */
export function istDayRange(dayKey: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const [, year, month, day] = match;
  const midnightUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const check = new Date(midnightUtc);
  // Rejects 2026-02-30, which Date.UTC would quietly roll into March.
  if (check.getUTCDate() !== Number(day) || check.getUTCMonth() !== Number(month) - 1) return null;
  const start = midnightUtc - IST_OFFSET_MS;
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** The IST day before or after `dayKey`. */
export function shiftIstDay(dayKey: string, days: number): string | null {
  const range = istDayRange(dayKey);
  if (!range) return null;
  return istToday(new Date(new Date(range.start).getTime() + days * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// UPI
// ---------------------------------------------------------------------------

/** handle@bank — `9876543210@ybl`, `shop.name@okaxis`. Mirrors the 0050 column check. */
export const UPI_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z][A-Za-z0-9.]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value);
}

/**
 * The QR the receipt carries stays well inside what the in-house encoder holds (216 bytes at
 * level M) and what a phone camera reads easily off thermal paper.
 */
export const UPI_URI_MAX_BYTES = 200;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * A `upi://pay` link per the NPCI deep-link format. Any UPI app that scans it opens a payment to
 * the centre's own UPI ID with the amount filled in — the citizen still confirms it in their app
 * with their own PIN. Assistigo never sees or relays the payment.
 *
 * A long Devanagari centre name can push the link past what a small QR holds; the note goes
 * first, then the payee name is shortened.
 */
export function buildUpiPayUri(input: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string | null;
}): string | null {
  if (!isValidUpiId(input.upiId)) return null;
  const paise = toPaise(input.amount);
  if (paise <= 0) return null;

  const build = (payee: string, note: string | null) => {
    const params = [
      `pa=${encodeURIComponent(input.upiId)}`,
      `pn=${encodeURIComponent(payee)}`,
      `am=${(paise / 100).toFixed(2)}`,
      'cu=INR',
    ];
    if (note) params.push(`tn=${encodeURIComponent(note)}`);
    return `upi://pay?${params.join('&')}`;
  };

  const note = input.note?.trim().slice(0, 50) || null;
  let payee = Array.from(input.payeeName.trim()).slice(0, 50);

  let uri = build(payee.join(''), note);
  if (byteLength(uri) <= UPI_URI_MAX_BYTES) return uri;

  uri = build(payee.join(''), null);
  while (byteLength(uri) > UPI_URI_MAX_BYTES && payee.length > 1) {
    payee = payee.slice(0, -1);
    uri = build(payee.join(''), null);
  }
  return byteLength(uri) <= UPI_URI_MAX_BYTES ? uri : null;
}

// ---------------------------------------------------------------------------
// API input
// ---------------------------------------------------------------------------

const rupees = z.coerce
  .number({ invalid_type_error: 'errors.validation_failed' })
  .finite('errors.validation_failed')
  .min(0, 'errors.validation_failed')
  .max(MAX_BILL_AMOUNT, 'errors.khata_amount_too_large')
  .transform((value) => fromPaise(toPaise(value)));

/** PUT /api/applications/:id/bill — set or correct the two fee lines. */
export const billFeesSchema = z
  .object({
    govtFee: rupees.nullable(),
    serviceCharge: rupees.nullable(),
  })
  .refine((fees) => fees.govtFee !== null || fees.serviceCharge !== null, {
    message: 'errors.khata_no_fees',
  });
export type BillFeesInput = z.infer<typeof billFeesSchema>;

/** POST /api/applications/:id/payments — one ledger line. */
export const ledgerEntrySchema = z.object({
  kind: z.enum(PAYMENT_KINDS).default('payment'),
  method: z.enum(PAYMENT_METHODS),
  amount: rupees.refine((value) => value > 0, 'errors.validation_failed'),
  note: z
    .string()
    .trim()
    .max(PAYMENT_NOTE_MAX, 'errors.validation_failed')
    .optional()
    .transform((value) => value || null),
});
export type LedgerEntryInput = z.infer<typeof ledgerEntrySchema>;

/** `?date=` on the khata page. */
export const khataDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => istDayRange(value) !== null);
