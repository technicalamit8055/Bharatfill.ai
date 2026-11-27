import { describe, expect, it } from 'vitest';
import {
  billFeesSchema,
  buildUpiPayUri,
  checkFees,
  checkLedgerEntry,
  formatBillNumber,
  formatRupees,
  istDayRange,
  istToday,
  isValidUpiId,
  khataDaySchema,
  ledgerEntrySchema,
  shiftIstDay,
  summariseBill,
  tallyDay,
  toPaise,
  UPI_URI_MAX_BYTES,
  type LedgerEntry,
} from './index';

const at = '2026-11-26T05:00:00.000Z';
const pay = (amount: number, method: LedgerEntry['method'] = 'cash'): LedgerEntry => ({
  kind: 'payment',
  method,
  amount,
  createdAt: at,
});
const refund = (amount: number, method: LedgerEntry['method'] = 'cash'): LedgerEntry => ({
  kind: 'refund',
  method,
  amount,
  createdAt: at,
});
const fees = (govtFee: number | null, serviceCharge: number | null, amountCharged = null) => ({
  govtFee,
  serviceCharge,
  amountCharged,
});

describe('money', () => {
  it('adds in paise, not floating rupees', () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(30);
    expect(summariseBill(fees(0.1, 0.2), []).total).toBe(0.3);
  });

  it('reads numeric strings and treats junk as zero', () => {
    expect(toPaise('150.50')).toBe(15050);
    expect(toPaise('abc')).toBe(0);
    expect(toPaise(null)).toBe(0);
  });

  it('formats with lakh grouping and paise only when present', () => {
    expect(formatRupees(125000)).toBe('₹1,25,000');
    expect(formatRupees(150.5)).toBe('₹150.50');
  });

  it('pads bill numbers and refuses nonsense', () => {
    expect(formatBillNumber(42)).toBe('B00042');
    expect(formatBillNumber(null)).toBeNull();
    expect(formatBillNumber(0)).toBeNull();
  });
});

describe('summariseBill — mirrors derive_application_bill()', () => {
  it('is unpaid with the whole total due before any payment', () => {
    expect(summariseBill(fees(100, 50), [])).toEqual({
      total: 150,
      paid: 0,
      due: 150,
      status: 'unpaid',
    });
  });

  it('is partial after an advance (udhar)', () => {
    expect(summariseBill(fees(100, 50), [pay(100)])).toMatchObject({
      paid: 100,
      due: 50,
      status: 'partial',
    });
  });

  it('is paid once the balance is cleared across methods', () => {
    expect(summariseBill(fees(100, 50), [pay(100), pay(50, 'upi')])).toMatchObject({
      due: 0,
      status: 'paid',
    });
  });

  it('is refunded when everything paid has been given back', () => {
    expect(summariseBill(fees(100, 50), [pay(150), refund(150)])).toMatchObject({
      paid: 0,
      due: 150,
      status: 'refunded',
    });
  });

  it('nets a partial refund', () => {
    expect(summariseBill(fees(100, 50), [pay(150), refund(50)])).toMatchObject({
      paid: 100,
      due: 50,
      status: 'partial',
    });
  });

  it('treats a free service as settled', () => {
    expect(summariseBill(fees(0, 0), []).status).toBe('paid');
  });

  it('leaves a legacy row with only a total and no ledger to its manual status', () => {
    expect(summariseBill({ govtFee: null, serviceCharge: null, amountCharged: 80 }, [])).toEqual({
      total: 80,
      paid: 0,
      due: 80,
      status: null,
    });
  });

  it('has nothing to bill when no fee is set', () => {
    expect(summariseBill(fees(null, null), []).total).toBeNull();
  });
});

describe('ledger checks', () => {
  const bill = summariseBill(fees(100, 50), [pay(100)]);

  it('refuses a payment before fees are set', () => {
    expect(
      checkLedgerEntry(summariseBill(fees(null, null), []), { kind: 'payment', amount: 10 }),
    ).toEqual({ ok: false, messageKey: 'errors.khata_no_fees' });
  });

  it('refuses more than is due, accepts exactly the due', () => {
    expect(checkLedgerEntry(bill, { kind: 'payment', amount: 50.01 }).ok).toBe(false);
    expect(checkLedgerEntry(bill, { kind: 'payment', amount: 50 }).ok).toBe(true);
  });

  it('refuses a refund larger than what was paid', () => {
    expect(checkLedgerEntry(bill, { kind: 'refund', amount: 101 })).toEqual({
      ok: false,
      messageKey: 'errors.khata_refund_more_than_paid',
    });
    expect(checkLedgerEntry(bill, { kind: 'refund', amount: 100 }).ok).toBe(true);
  });

  it('refuses fees below what is already paid', () => {
    expect(checkFees({ govtFee: 50, serviceCharge: 20 }, 100).ok).toBe(false);
    expect(checkFees({ govtFee: 80, serviceCharge: 20 }, 100).ok).toBe(true);
  });
});

describe('tallyDay', () => {
  it('splits the drawer from UPI and nets refunds per method', () => {
    expect(
      tallyDay([pay(100), pay(50, 'upi'), pay(200, 'upi'), refund(30), pay(20, 'other')]),
    ).toEqual({
      cash: 70,
      upi: 250,
      other: 20,
      refunds: 30,
      net: 340,
      payments: 4,
      refundCount: 1,
    });
  });

  it('is all zeroes for a quiet day', () => {
    expect(tallyDay([]).net).toBe(0);
  });
});

describe('IST days', () => {
  it('rolls over at IST midnight, not UTC', () => {
    expect(istToday(new Date('2026-11-25T18:29:00.000Z'))).toBe('2026-11-25');
    expect(istToday(new Date('2026-11-25T18:31:00.000Z'))).toBe('2026-11-26');
  });

  it('spans 00:00–24:00 IST', () => {
    expect(istDayRange('2026-11-26')).toEqual({
      start: '2026-11-25T18:30:00.000Z',
      end: '2026-11-26T18:30:00.000Z',
    });
  });

  it('rejects impossible dates', () => {
    expect(istDayRange('2026-02-30')).toBeNull();
    expect(khataDaySchema.safeParse('2026-13-01').success).toBe(false);
    expect(khataDaySchema.safeParse('2026-11-26').success).toBe(true);
  });

  it('steps across month ends', () => {
    expect(shiftIstDay('2026-12-01', -1)).toBe('2026-11-30');
    expect(shiftIstDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('UPI', () => {
  it('accepts real-looking handles and rejects the rest', () => {
    expect(isValidUpiId('9876543210@ybl')).toBe(true);
    expect(isValidUpiId('shop.name@okaxis')).toBe(true);
    expect(isValidUpiId('no-at-sign')).toBe(false);
    expect(isValidUpiId('a b@ybl')).toBe(false);
    expect(isValidUpiId('x@1bank')).toBe(false);
  });

  it('builds an NPCI pay link with the amount in rupees.paise', () => {
    expect(
      buildUpiPayUri({
        upiId: 'shop@ybl',
        payeeName: 'Ram Cyber Cafe',
        amount: 50,
        note: 'B00042',
      }),
    ).toBe('upi://pay?pa=shop%40ybl&pn=Ram%20Cyber%20Cafe&am=50.00&cu=INR&tn=B00042');
  });

  it('has no link for nothing due or a bad UPI ID', () => {
    expect(buildUpiPayUri({ upiId: 'shop@ybl', payeeName: 'X', amount: 0 })).toBeNull();
    expect(buildUpiPayUri({ upiId: 'bad', payeeName: 'X', amount: 10 })).toBeNull();
  });

  it('shortens a long Devanagari name to fit the QR', () => {
    const uri = buildUpiPayUri({
      upiId: 'shop@ybl',
      payeeName: 'श्री राम जन सेवा केंद्र एवं साइबर कैफ़े मुख्य बाज़ार',
      amount: 150,
      note: 'B00042',
    });
    expect(uri).not.toBeNull();
    expect(new TextEncoder().encode(uri ?? '').length).toBeLessThanOrEqual(UPI_URI_MAX_BYTES);
    expect(uri).toContain('am=150.00');
  });
});

describe('input schemas', () => {
  it('needs at least one fee line and rounds to paise', () => {
    expect(billFeesSchema.safeParse({ govtFee: null, serviceCharge: null }).success).toBe(false);
    expect(billFeesSchema.parse({ govtFee: '100.456', serviceCharge: null })).toEqual({
      govtFee: 100.46,
      serviceCharge: null,
    });
  });

  it('refuses negative, zero and absurd amounts', () => {
    expect(ledgerEntrySchema.safeParse({ method: 'cash', amount: 0 }).success).toBe(false);
    expect(ledgerEntrySchema.safeParse({ method: 'cash', amount: -5 }).success).toBe(false);
    expect(ledgerEntrySchema.safeParse({ method: 'cash', amount: 2_000_000 }).success).toBe(false);
  });

  it('defaults to a payment and drops an empty note', () => {
    expect(ledgerEntrySchema.parse({ method: 'upi', amount: 50, note: '  ' })).toEqual({
      kind: 'payment',
      method: 'upi',
      amount: 50,
      note: null,
    });
  });
});
