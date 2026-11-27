-- =============================================================================
-- 0050  Counter billing & udhar khata on every application
-- Master spec §21.2 (fee charged, payment status, receipt), §33 V1.5 "Receipts for customers";
-- docs/RD_DAILY_STANDARD_BLUEPRINT.md §2.1.
--
-- A cyber-cafe bill is two numbers — the government fee and the centre's service charge — and is
-- often settled in parts: an advance at the counter, the rest when the admit card or certificate
-- arrives. This migration gives every application:
--
-- 1. `govt_fee` / `service_charge`. When either is set, `amount_charged` becomes their sum, so
--    every existing reader of `amount_charged` keeps working.
-- 2. `application_payments`, an append-only ledger of money in (payment) and money back (refund).
--    No update or delete policy: a mistake is corrected with a refund entry, so the day's tally
--    can never be quietly rewritten. Refunds are owner/manager only.
-- 3. `amount_paid` (derived from the ledger — never written by a client), `balance_due`
--    (generated) and `payment_status` (derived; gains 'partial'). Rows with no fee breakdown and
--    no ledger entries keep their manually set status, so nothing already recorded changes.
-- 4. `bill_number`, a per-centre sequence (B00001 …) issued the first time fees are set and
--    printed on the receipt. Permanent once issued.
-- 5. `organizations.upi_id`, the centre's own UPI ID, used to draw a "scan to pay" QR on the
--    receipt. Assistigo does not take, route or verify the payment: the operator records it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations: the centre's UPI ID and the bill counter
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists upi_id text
    check (upi_id is null or upi_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z][A-Za-z0-9.]{1,63}$'),
  add column if not exists bill_counter bigint not null default 0;

comment on column public.organizations.upi_id is
  'The centre''s own UPI ID (VPA), drawn as a scan-to-pay QR on counter receipts (0050). Not a customer value.';
comment on column public.organizations.bill_counter is
  'Last bill number issued by derive_application_bill() (0050).';

-- -----------------------------------------------------------------------------
-- applications: fee breakdown and ledger totals
-- -----------------------------------------------------------------------------
alter table public.applications
  add column if not exists govt_fee numeric(10, 2)
    check (govt_fee is null or (govt_fee >= 0 and govt_fee <= 1000000)),
  add column if not exists service_charge numeric(10, 2)
    check (service_charge is null or (service_charge >= 0 and service_charge <= 1000000)),
  add column if not exists amount_paid numeric(10, 2) not null default 0
    check (amount_paid >= 0),
  add column if not exists bill_number bigint;

alter table public.applications
  add column if not exists balance_due numeric(10, 2)
    generated always as (greatest(coalesce(amount_charged, 0) - amount_paid, 0)) stored;

-- More money in than was charged is a typing mistake (₹1000 for ₹100), not an advance.
alter table public.applications
  drop constraint if exists applications_amount_paid_within_charge;
alter table public.applications
  add constraint applications_amount_paid_within_charge
  check (amount_charged is null or amount_paid <= amount_charged);

alter table public.applications
  drop constraint if exists applications_payment_status_check;
alter table public.applications
  add constraint applications_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid', 'refunded'));

create unique index if not exists applications_bill_number_idx
  on public.applications (organization_id, bill_number)
  where bill_number is not null;

-- The khata's "who still owes" list.
create index if not exists applications_balance_due_idx
  on public.applications (organization_id, created_at)
  where balance_due > 0 and deleted_at is null;

comment on column public.applications.amount_paid is
  'Payments minus refunds in application_payments. Recomputed by derive_application_bill(); a client value is ignored (0050).';
comment on column public.applications.balance_due is
  'Udhar: amount_charged - amount_paid, never below zero (0050).';
comment on column public.applications.bill_number is
  'Per-centre receipt number, issued once when fees are first set (0050).';

-- -----------------------------------------------------------------------------
-- application_payments — the append-only counter ledger
-- -----------------------------------------------------------------------------
create table if not exists public.application_payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  application_id   uuid not null references public.applications (id) on delete cascade,
  -- Copied from the application by the insert trigger, so the khata can group by customer.
  customer_id      uuid not null references public.customers (id) on delete cascade,
  kind             text not null default 'payment' check (kind in ('payment', 'refund')),
  method           text not null check (method in ('cash', 'upi', 'other')),
  amount           numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  note             text check (note is null or char_length(note) <= 200),
  received_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists application_payments_application_idx
  on public.application_payments (organization_id, application_id, created_at);
create index if not exists application_payments_day_idx
  on public.application_payments (organization_id, created_at desc);

comment on table public.application_payments is
  'Counter ledger (0050). Insert-only: corrections are refund entries. Amounts only — no customer values.';

-- -----------------------------------------------------------------------------
-- derive_application_bill — keeps the bill columns honest on every write
-- -----------------------------------------------------------------------------
create or replace function public.derive_application_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_paid  numeric(10, 2) := 0;
  ledger_rows  integer := 0;
  has_refund   boolean := false;
  has_fees     boolean;
begin
  if tg_op = 'INSERT' then
    new.amount_paid := 0;
    new.bill_number := null;
  else
    new.bill_number := old.bill_number;
    select coalesce(sum(case when kind = 'payment' then amount else -amount end), 0),
           count(*),
           coalesce(bool_or(kind = 'refund'), false)
      into ledger_paid, ledger_rows, has_refund
      from public.application_payments
     where application_id = new.id;
    new.amount_paid := ledger_paid;
  end if;

  has_fees := new.govt_fee is not null or new.service_charge is not null;

  if has_fees then
    new.amount_charged := coalesce(new.govt_fee, 0) + coalesce(new.service_charge, 0);
  end if;

  if has_fees or ledger_rows > 0 then
    new.payment_status := case
      when new.amount_paid = 0 and has_refund then 'refunded'
      when new.amount_charged is not null and new.amount_paid >= new.amount_charged then 'paid'
      when new.amount_paid > 0 then 'partial'
      else 'unpaid'
    end;
  end if;

  if has_fees and new.bill_number is null then
    update public.organizations
       set bill_counter = bill_counter + 1
     where id = new.organization_id
    returning bill_counter into new.bill_number;
  end if;

  return new;
end;
$$;

drop trigger if exists applications_derive_bill on public.applications;
create trigger applications_derive_bill
  before insert or update on public.applications
  for each row execute function public.derive_application_bill();

-- -----------------------------------------------------------------------------
-- Ledger insert: pin the row to its application, then recompute the application
-- -----------------------------------------------------------------------------
create or replace function public.prepare_application_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  app record;
begin
  -- `for update` serialises two payments on one bill, so the overpay check below sees both.
  select organization_id, customer_id, amount_charged, deleted_at
    into app
    from public.applications
   where id = new.application_id
   for update;

  if not found or app.deleted_at is not null then
    raise exception 'ASSISTIGO_KHATA_NO_APPLICATION' using errcode = 'P0002';
  end if;
  if app.organization_id is distinct from new.organization_id then
    raise exception 'ASSISTIGO_KHATA_WRONG_ORGANIZATION' using errcode = '42501';
  end if;
  if app.amount_charged is null then
    raise exception 'ASSISTIGO_KHATA_NO_FEES' using errcode = '23514';
  end if;

  new.customer_id := app.customer_id;
  -- The server clock, never the client's: a back-dated entry would slip out of today's tally.
  new.created_at := now();
  if auth.uid() is not null then
    new.received_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.apply_application_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fires derive_application_bill(), which re-sums the ledger. An overpayment or an over-refund
  -- fails its check constraint there and rolls this insert back.
  update public.applications set updated_at = now() where id = new.application_id;
  return null;
end;
$$;

drop trigger if exists application_payments_prepare on public.application_payments;
create trigger application_payments_prepare
  before insert on public.application_payments
  for each row execute function public.prepare_application_payment();

drop trigger if exists application_payments_apply on public.application_payments;
create trigger application_payments_apply
  after insert on public.application_payments
  for each row execute function public.apply_application_payment();

-- -----------------------------------------------------------------------------
-- RLS: counter roles read and add; refunds are owner/manager; nobody edits or deletes
-- -----------------------------------------------------------------------------
alter table public.application_payments enable row level security;

drop policy if exists application_payments_select on public.application_payments;
create policy application_payments_select on public.application_payments
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

drop policy if exists application_payments_insert on public.application_payments;
create policy application_payments_insert on public.application_payments
  for insert to authenticated
  with check (
    (kind = 'payment'
      and public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
    or (kind = 'refund'
      and public.has_org_role(organization_id, array['owner', 'manager']))
  );
