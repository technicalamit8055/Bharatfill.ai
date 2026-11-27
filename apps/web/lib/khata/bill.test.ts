import { describe, expect, it } from 'vitest';
import { createTranslator } from '../i18n';
import { buildBillMessage, toBillView, type BillApplication, type BillOrganization } from './bill';

// Invented fixture values only — no real citizen data (DEVELOPMENT_RULES).
const application: BillApplication = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Caste certificate',
  portal_reference_number: 'TEST-REF-001',
  govt_fee: 30,
  service_charge: 70,
  amount_charged: 100,
  bill_number: 42,
};

const organization: BillOrganization = {
  name: 'Test Seva Kendra',
  phone: '0000000000',
  city: 'Testpur',
  district: null,
  upi_id: 'testkendra@ybl',
};

const payment = (id: string, amount: number, kind: 'payment' | 'refund' = 'payment') => ({
  id,
  kind,
  method: 'cash' as const,
  amount,
  note: null,
  created_at: `2026-11-26T0${id}:00:00.000Z`,
});

describe('toBillView', () => {
  it('derives the balance, the bill number and a UPI link for what is still owed', () => {
    const bill = toBillView({
      application,
      payments: [payment('2', 40)],
      organization,
      customerName: 'Test Customer',
    });
    expect(bill).toMatchObject({
      billNumber: 'B00042',
      total: 100,
      paid: 40,
      due: 60,
      status: 'partial',
      centre: { name: 'Test Seva Kendra', place: 'Testpur', upiId: 'testkendra@ybl' },
    });
    expect(bill.upiUri).toBe(
      'upi://pay?pa=testkendra%40ybl&pn=Test%20Seva%20Kendra&am=60.00&cu=INR&tn=B00042',
    );
  });

  it('orders the khata oldest first whatever order the rows arrive in', () => {
    const bill = toBillView({
      application,
      payments: [payment('3', 10), payment('1', 20)],
      organization,
      customerName: null,
    });
    expect(bill.entries.map((entry) => entry.id)).toEqual(['1', '3']);
  });

  it('has no UPI link once the bill is settled or without a UPI ID', () => {
    expect(
      toBillView({ application, payments: [payment('1', 100)], organization, customerName: null })
        .upiUri,
    ).toBeNull();
    expect(
      toBillView({
        application,
        payments: [],
        organization: { ...organization, upi_id: null },
        customerName: null,
      }).upiUri,
    ).toBeNull();
  });
});

describe('buildBillMessage', () => {
  const bill = toBillView({
    application,
    payments: [payment('1', 40)],
    organization,
    customerName: 'Test Customer',
  });

  it('carries the centre, the bill and the balance — in the operator’s language', () => {
    const en = buildBillMessage(createTranslator('en'), bill);
    expect(en).toContain('*Test Seva Kendra*');
    expect(en).toContain('B00042');
    expect(en).toContain('TEST-REF-001');
    expect(en).toContain('₹60');
    expect(en).toContain('testkendra@ybl');

    const hi = buildBillMessage(createTranslator('hi'), bill);
    expect(hi).toContain('बकाया');
    expect(hi).not.toContain('khata.');
  });

  it('says fully paid instead of asking for money', () => {
    const settled = toBillView({
      application,
      payments: [payment('1', 100)],
      organization,
      customerName: null,
    });
    const text = buildBillMessage(createTranslator('en'), settled);
    expect(text).toContain('Fully paid');
    expect(text).not.toContain('Pay the balance');
  });

  it('never resolves to a raw translation key', () => {
    for (const locale of ['en', 'hi'] as const) {
      expect(buildBillMessage(createTranslator(locale), bill)).not.toMatch(/khata\.\w/);
    }
  });
});
