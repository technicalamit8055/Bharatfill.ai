/**
 * Counter billing & udhar khata (migration 0050).
 *
 * The ledger is money, so the database — not the API — must guarantee that it adds up, that it
 * cannot be rewritten, that a refund needs an owner or manager, and that one centre can never
 * read or write another's.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;
let customerId: string;
let applicationId: string;

async function bill(id = applicationId) {
  const { data, error } = await fixture.orgA.usersByRole.owner.client
    .from('applications')
    .select('amount_charged, amount_paid, balance_due, payment_status, bill_number')
    .eq('id', id)
    .single();
  if (error) throw error;
  return {
    ...data,
    amount_charged: Number(data.amount_charged),
    amount_paid: Number(data.amount_paid),
    balance_due: Number(data.balance_due),
  };
}

function entry(kind: 'payment' | 'refund', amount: number, id = applicationId) {
  return {
    organization_id: fixture.orgA.id,
    application_id: id,
    customer_id: customerId,
    kind,
    method: 'cash',
    amount,
  };
}

beforeAll(async () => {
  fixture = await setupFixture();
  const operator = fixture.orgA.usersByRole.operator.client;

  const { data: customer, error: customerError } = await operator
    .from('customers')
    .insert({ organization_id: fixture.orgA.id, full_name: 'Rls Khata Fixture Customer' })
    .select('id')
    .single();
  if (customerError) throw customerError;
  customerId = customer.id as string;

  const { data, error } = await operator
    .from('applications')
    .insert({
      organization_id: fixture.orgA.id,
      customer_id: customerId,
      title: 'Rls khata fixture',
      govt_fee: 100,
      service_charge: 50,
    })
    .select('id')
    .single();
  if (error) throw error;
  applicationId = data.id as string;
}, 60_000);

afterAll(async () => {
  await teardownFixture(fixture);
});

describe('the bill', () => {
  it('sums the fee lines, issues a bill number and starts unpaid', async () => {
    const row = await bill();
    expect(row.amount_charged).toBe(150);
    expect(row.balance_due).toBe(150);
    expect(row.payment_status).toBe('unpaid');
    expect(Number(row.bill_number)).toBeGreaterThan(0);
  });

  it('ignores an amount_paid or bill_number written by a client', async () => {
    const before = await bill();
    await fixture.orgA.usersByRole.operator.client
      .from('applications')
      .update({ amount_paid: 150, bill_number: 999999 })
      .eq('id', applicationId);
    const after = await bill();
    expect(after.amount_paid).toBe(0);
    expect(after.bill_number).toBe(before.bill_number);
  });
});

describe('the ledger', () => {
  it('lets an operator take an advance, which makes the bill part paid', async () => {
    const { error } = await fixture.orgA.usersByRole.operator.client
      .from('application_payments')
      .insert(entry('payment', 100));
    expect(error).toBeNull();
    const row = await bill();
    expect(row.amount_paid).toBe(100);
    expect(row.balance_due).toBe(50);
    expect(row.payment_status).toBe('partial');
  });

  it('refuses a payment larger than the balance due', async () => {
    const { error } = await fixture.orgA.usersByRole.operator.client
      .from('application_payments')
      .insert(entry('payment', 51));
    expect(error).not.toBeNull();
    expect((await bill()).amount_paid).toBe(100);
  });

  it('refuses a refund from an operator, allows it from a manager', async () => {
    const operator = await fixture.orgA.usersByRole.operator.client
      .from('application_payments')
      .insert(entry('refund', 10));
    expect(operator.error).not.toBeNull();

    const manager = await fixture.orgA.usersByRole.manager.client
      .from('application_payments')
      .insert(entry('refund', 10));
    expect(manager.error).toBeNull();
    expect((await bill()).amount_paid).toBe(90);
  });

  it('refuses a refund larger than what was paid', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('application_payments')
      .insert(entry('refund', 1000));
    expect(error).not.toBeNull();
  });

  it('is insert-only: nobody edits or deletes a line', async () => {
    const owner = fixture.orgA.usersByRole.owner.client;
    const { data: lines } = await owner
      .from('application_payments')
      .select('id, amount')
      .eq('application_id', applicationId);
    const first = lines?.[0];
    expect(first).toBeDefined();

    await owner.from('application_payments').update({ amount: 1 }).eq('id', first!.id);
    await owner.from('application_payments').delete().eq('id', first!.id);

    const { data: still } = await owner
      .from('application_payments')
      .select('id, amount')
      .eq('id', first!.id)
      .single();
    expect(Number(still?.amount)).toBe(Number(first!.amount));
  });

  it('records the server time and the signed-in user, not what the client sent', async () => {
    const operator = fixture.orgA.usersByRole.operator;
    const { data, error } = await operator.client
      .from('application_payments')
      .insert({
        ...entry('payment', 1),
        created_at: '2020-01-01T00:00:00Z',
        received_by: fixture.orgA.usersByRole.owner.id,
      })
      .select('created_at, received_by')
      .single();
    expect(error).toBeNull();
    expect(new Date(data!.created_at as string).getUTCFullYear()).toBeGreaterThan(2020);
    expect(data!.received_by).toBe(operator.id);
  });

  it('lets a viewer read the khata but not write to it', async () => {
    const viewer = fixture.orgA.usersByRole.viewer.client;
    const { data } = await viewer
      .from('application_payments')
      .select('id')
      .eq('application_id', applicationId);
    expect((data ?? []).length).toBeGreaterThan(0);

    const { error } = await viewer.from('application_payments').insert(entry('payment', 1));
    expect(error).not.toBeNull();
  });
});

describe('tenancy', () => {
  it('hides one centre’s khata from another', async () => {
    const { data } = await fixture.orgB.usersByRole.owner.client
      .from('application_payments')
      .select('id')
      .eq('application_id', applicationId);
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a line that points at another centre’s application', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('application_payments')
      .insert({ ...entry('payment', 1), organization_id: fixture.orgB.id });
    expect(error).not.toBeNull();
  });
});
