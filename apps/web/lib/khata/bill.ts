/**
 * The counter bill as the screen, the thermal receipt and the WhatsApp message read it
 * (migration 0050). Pure: the page builds it on the server, the API rebuilds it after each write.
 *
 * The bill carries the customer's name and the portal reference number because that is what a
 * receipt is for. It never carries a mobile number, an ID number or any other profile value.
 */

import {
  buildUpiPayUri,
  formatBillNumber,
  formatRupees,
  summariseBill,
  type BillPaymentStatus,
  type PaymentKind,
  type PaymentMethod,
} from '@assistigo/core';
import type { Translator } from '../i18n';
import type {
  ApplicationPaymentRow,
  ApplicationRow,
  OrganizationRow,
} from '../supabase/database.types';

export type BillEntryView = {
  id: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amount: number;
  note: string | null;
  createdAt: string;
};

export type BillCentreView = {
  name: string;
  phone: string | null;
  place: string | null;
  upiId: string | null;
};

export type BillView = {
  applicationId: string;
  billNumber: string | null;
  title: string;
  portalReferenceNumber: string | null;
  customerName: string | null;
  govtFee: number | null;
  serviceCharge: number | null;
  total: number | null;
  paid: number;
  due: number;
  status: BillPaymentStatus | null;
  entries: BillEntryView[];
  centre: BillCentreView;
  /** `upi://pay` for the balance due, when the centre has a UPI ID and something is owed. */
  upiUri: string | null;
};

export type BillApplication = Pick<
  ApplicationRow,
  | 'id'
  | 'title'
  | 'portal_reference_number'
  | 'govt_fee'
  | 'service_charge'
  | 'amount_charged'
  | 'bill_number'
>;

export type BillPayment = Pick<
  ApplicationPaymentRow,
  'id' | 'kind' | 'method' | 'amount' | 'note' | 'created_at'
>;

export type BillOrganization = Pick<
  OrganizationRow,
  'name' | 'phone' | 'city' | 'district' | 'upi_id'
>;

const toNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

export function toBillView(input: {
  application: BillApplication;
  payments: readonly BillPayment[];
  organization: BillOrganization;
  customerName: string | null;
}): BillView {
  const { application, organization } = input;
  const entries: BillEntryView[] = [...input.payments]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      method: row.method,
      amount: Number(row.amount),
      note: row.note,
      createdAt: row.created_at,
    }));

  const summary = summariseBill(
    {
      govtFee: application.govt_fee,
      serviceCharge: application.service_charge,
      amountCharged: application.amount_charged,
    },
    entries,
  );

  const billNumber = formatBillNumber(application.bill_number);
  const upiId = organization.upi_id ?? null;

  return {
    applicationId: application.id,
    billNumber,
    title: application.title,
    portalReferenceNumber: application.portal_reference_number,
    customerName: input.customerName,
    govtFee: toNumber(application.govt_fee),
    serviceCharge: toNumber(application.service_charge),
    total: summary.total,
    paid: summary.paid,
    due: summary.due,
    status: summary.status,
    entries,
    centre: {
      name: organization.name,
      phone: organization.phone,
      place:
        [organization.city, organization.district]
          .filter((part): part is string => Boolean(part))
          .join(', ') || null,
      upiId,
    },
    upiUri:
      upiId && summary.due > 0
        ? buildUpiPayUri({
            upiId,
            payeeName: organization.name,
            amount: summary.due,
            note: billNumber,
          })
        : null,
  };
}

/** The WhatsApp copy of the receipt. Plain text: WhatsApp renders `*bold*` and nothing else. */
export function buildBillMessage(t: Translator, bill: BillView): string {
  const lines: string[] = [`*${bill.centre.name}*`];
  if (bill.centre.phone) lines.push(t('khata.receipt.phone', { phone: bill.centre.phone }));
  lines.push('');
  if (bill.billNumber) lines.push(t('khata.receipt.billNumber', { number: bill.billNumber }));
  if (bill.customerName) lines.push(t('khata.receipt.customer', { name: bill.customerName }));
  lines.push(t('khata.receipt.application', { title: bill.title }));
  if (bill.portalReferenceNumber) {
    lines.push(t('khata.receipt.reference', { reference: bill.portalReferenceNumber }));
  }
  lines.push('');
  if (bill.govtFee !== null) {
    lines.push(`${t('khata.govtFee')}: ${formatRupees(bill.govtFee)}`);
  }
  if (bill.serviceCharge !== null) {
    lines.push(`${t('khata.serviceCharge')}: ${formatRupees(bill.serviceCharge)}`);
  }
  if (bill.total !== null) lines.push(`*${t('khata.total')}: ${formatRupees(bill.total)}*`);
  lines.push(`${t('khata.paid')}: ${formatRupees(bill.paid)}`);
  if (bill.due > 0) {
    lines.push(`*${t('khata.balanceDue')}: ${formatRupees(bill.due)}*`);
    if (bill.centre.upiId) {
      lines.push('', t('khata.receipt.payByUpi', { upiId: bill.centre.upiId }));
    }
  } else {
    lines.push(t('khata.receipt.fullyPaid'));
  }
  lines.push('', t('khata.receipt.thanks'));
  return lines.join('\n');
}
