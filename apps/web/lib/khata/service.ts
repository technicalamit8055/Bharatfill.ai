import 'server-only';

import { notFound, providerUnavailable } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { OrganizationRow } from '../supabase/database.types';
import { isWhatsappConfigured, sendWhatsappTextResult } from '../document-drop/whatsapp';
import { toBillView, type BillApplication, type BillPayment, type BillView } from './bill';

/**
 * Reads one application's counter bill (migration 0050). Every query is pinned to the caller's
 * organization as well as filtered by RLS, the same belt-and-braces as the rest of the API.
 */

const BILL_COLUMNS =
  'id, customer_id, title, portal_reference_number, govt_fee, service_charge, amount_charged, bill_number';

/**
 * Postgres / PostgREST codes for "that column or table does not exist" — what every khata read
 * returns while migration 0050 is not applied yet. Only these are treated as "not set up";
 * any other failure still throws.
 */
const MISSING_SCHEMA_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);

export function isKhataSchemaMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const { code } = error as { code: unknown };
  return typeof code === 'string' && MISSING_SCHEMA_CODES.has(code);
}

/** `loadBill` for pages: null when the khata schema is not in the database yet. */
export async function loadBillIfReady(
  supabase: AssistigoSupabaseClient,
  organization: OrganizationRow,
  applicationId: string,
): Promise<LoadedBill | null> {
  try {
    return await loadBill(supabase, organization, applicationId);
  } catch (error) {
    if (isKhataSchemaMissing(error)) return null;
    throw error;
  }
}

/** A bill has a handful of lines; this only stops a runaway read. */
const ENTRY_LIMIT = 200;

export type LoadedBill = {
  bill: BillView;
  customerId: string;
  /** Read for the WhatsApp copy only; never part of the bill view sent to the browser. */
  customerMobile: string | null;
};

export async function loadBill(
  supabase: AssistigoSupabaseClient,
  organization: OrganizationRow,
  applicationId: string,
): Promise<LoadedBill> {
  const { data: application, error } = await supabase
    .from('applications')
    .select(BILL_COLUMNS)
    .eq('id', applicationId)
    .eq('organization_id', organization.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!application) throw notFound('errors.application_not_found');
  const row = application as BillApplication & { customer_id: string };

  const [{ data: customer, error: customerError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from('customers')
        .select('full_name, mobile')
        .eq('id', row.customer_id)
        .eq('organization_id', organization.id)
        .maybeSingle(),
      supabase
        .from('application_payments')
        .select('id, kind, method, amount, note, created_at')
        .eq('organization_id', organization.id)
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true })
        .limit(ENTRY_LIMIT),
    ]);
  if (customerError) throw customerError;
  if (paymentsError) throw paymentsError;

  const person = customer as { full_name: string; mobile: string | null } | null;

  return {
    bill: toBillView({
      application: row,
      payments: (payments ?? []) as BillPayment[],
      organization,
      customerName: person?.full_name ?? null,
    }),
    customerId: row.customer_id,
    customerMobile: person?.mobile ?? null,
  };
}

/**
 * Sends the receipt from the platform's WhatsApp number to the mobile on the customer's own
 * record — the same channel, and the same product-owner decision, as the login slip (§19.7a).
 * Throws `providerUnavailable` so the operator knows it did not go out.
 */
export async function sendBillOnWhatsapp(mobile: string, body: string): Promise<void> {
  if (!(await isWhatsappConfigured())) {
    throw providerUnavailable('errors.khata_whatsapp_not_configured');
  }
  // Indian mobiles are stored as bare ten digits; the Cloud API wants the country code.
  const to = mobile.length === 10 ? `91${mobile}` : mobile;
  const sent = await sendWhatsappTextResult(to, body);
  if (!sent) throw providerUnavailable('errors.khata_whatsapp_failed');
}

// ---------------------------------------------------------------------------
// The khata page and the dashboard card
// ---------------------------------------------------------------------------

/** A busy centre takes a few hundred payments a day; this only stops a runaway read. */
const DAY_ENTRY_LIMIT = 2000;
const OUTSTANDING_LIMIT = 500;

export type DayLedgerRow = {
  id: string;
  kind: 'payment' | 'refund';
  method: 'cash' | 'upi' | 'other';
  amount: number;
  note: string | null;
  createdAt: string;
  applicationId: string;
  applicationTitle: string | null;
  billNumber: number | null;
  customerName: string | null;
};

type RawDayRow = {
  id: string;
  kind: 'payment' | 'refund';
  method: 'cash' | 'upi' | 'other';
  amount: number | string;
  note: string | null;
  created_at: string;
  application_id: string;
  applications: { title: string; bill_number: number | null } | null;
  customers: { full_name: string } | null;
};

/** Every khata line in one IST day, newest first. */
export async function loadDayLedger(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  range: { start: string; end: string },
): Promise<DayLedgerRow[]> {
  const { data, error } = await supabase
    .from('application_payments')
    .select(
      'id, kind, method, amount, note, created_at, application_id, applications(title, bill_number), customers(full_name)',
    )
    .eq('organization_id', organizationId)
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(DAY_ENTRY_LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as RawDayRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    method: row.method,
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.created_at,
    applicationId: row.application_id,
    applicationTitle: row.applications?.title ?? null,
    billNumber: row.applications?.bill_number ?? null,
    customerName: row.customers?.full_name ?? null,
  }));
}

export type OutstandingRow = {
  applicationId: string;
  title: string;
  billNumber: number | null;
  total: number;
  paid: number;
  due: number;
  createdAt: string;
  customerId: string;
  customerName: string | null;
};

type RawOutstandingRow = {
  id: string;
  title: string;
  bill_number: number | null;
  amount_charged: number | string | null;
  amount_paid: number | string;
  balance_due: number | string;
  created_at: string;
  customer_id: string;
  customers: { full_name: string } | null;
};

/** Udhar: every live application with money still owed, oldest first. */
export async function loadOutstanding(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
): Promise<{ rows: OutstandingRow[]; truncated: boolean }> {
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, title, bill_number, amount_charged, amount_paid, balance_due, created_at, customer_id, customers(full_name)',
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .gt('balance_due', 0)
    .order('created_at', { ascending: true })
    .limit(OUTSTANDING_LIMIT + 1);
  if (error) throw error;
  const raw = (data ?? []) as unknown as RawOutstandingRow[];
  return {
    truncated: raw.length > OUTSTANDING_LIMIT,
    rows: raw.slice(0, OUTSTANDING_LIMIT).map((row) => ({
      applicationId: row.id,
      title: row.title,
      billNumber: row.bill_number,
      total: Number(row.amount_charged ?? 0),
      paid: Number(row.amount_paid),
      due: Number(row.balance_due),
      createdAt: row.created_at,
      customerId: row.customer_id,
      customerName: row.customers?.full_name ?? null,
    })),
  };
}
