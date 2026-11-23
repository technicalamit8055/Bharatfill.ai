-- =============================================================================
-- SUPERSEDED the same day by 0046_citizen_centre_locks.sql, which drops everything below.
-- 0045  An approved roaming customer becomes the visiting centre's own customer
-- Migrations 0024 (roaming), 0039 (app approval), 0042 (trusted), 0044 (joined list);
-- docs/VAULT_BRIDGE_DESIGN.md §15
--
-- Product owner, 2026-11-23 (supersedes 0044's "no copy, approve each visit"): "after looking up
-- the first time and getting access from the customer, it should be added to that operator's
-- customer base" — no "From another centre" tag, and usable everywhere an own customer is:
-- document upload, applications, fill sessions, the extension.
--
-- Shape:
--
--   1. Copy, not a wider link. The first approval after this migration (app tap, SMS OTP or a
--      trusted-centre grant) makes the server copy the home record into the visiting centre as
--      a normal `customers` row: profile, field values (re-encrypted under the new row's AAD),
--      documents and prepared files (storage objects copied into the visiting centre's prefix).
--      Every list, picker and policy that reads `organization_id = mine` then just works, with no
--      cross-tenant read path added anywhere. Done in apps/web/lib/roaming/adopt.ts on the
--      service role, after the grant row exists (that grant is the consent).
--
--   2. Provenance columns, for idempotency only. `adopted_from_customer_id` /
--      `adopted_from_document_id` / `adopted_from_derivative_id` name the row the copy came from.
--      Unique per centre, so a retried or racing approval cannot make two copies. `on delete set
--      null`: the home centre deleting its record does not delete the visiting centre's copy, and
--      no policy predicate reads these columns.
--
--   3. The copy replaces the bookmark. Adopting deletes the 0024 link for that centre, and the
--      0044 grant trigger no longer re-links a customer the centre already holds a copy of, so a
--      person is never listed twice.
--
-- Not changed: the home record and its grants. A copy is a snapshot — later edits at the home
-- centre do not flow to it. Links made before this migration stay links ("needs approval") until
-- the citizen approves once more; the consent they gave then was for a time-boxed look, not a
-- copy, so nothing is backfilled.
--
-- Consent text: the approval screen and the OTP message now say the centre keeps a copy
-- (consent_text_version roaming-*-v2). Legal review of that wording is open (ROADMAP).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2. Provenance columns
-- -----------------------------------------------------------------------------
alter table public.customers
  add column if not exists adopted_from_customer_id uuid
    references public.customers (id) on delete set null;

comment on column public.customers.adopted_from_customer_id is
  'The other centre''s customer this row was copied from when the citizen approved access (0045). Idempotency only; no policy reads it.';

create unique index if not exists customers_adopted_from_uidx
  on public.customers (organization_id, adopted_from_customer_id)
  where adopted_from_customer_id is not null;

alter table public.documents
  add column if not exists adopted_from_document_id uuid
    references public.documents (id) on delete set null;

comment on column public.documents.adopted_from_document_id is
  'The other centre''s document this file was copied from with its customer (0045).';

create unique index if not exists documents_adopted_from_uidx
  on public.documents (organization_id, adopted_from_document_id)
  where adopted_from_document_id is not null;

alter table public.document_derivatives
  add column if not exists adopted_from_derivative_id uuid
    references public.document_derivatives (id) on delete set null;

comment on column public.document_derivatives.adopted_from_derivative_id is
  'The other centre''s prepared file this was copied from with its customer (0045).';

create unique index if not exists document_derivatives_adopted_from_uidx
  on public.document_derivatives (organization_id, adopted_from_derivative_id)
  where adopted_from_derivative_id is not null;

-- A copy must come from another centre: adopting your own customer would make two of them.
create or replace function public.reject_self_adoption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.adopted_from_customer_id is not null and exists (
    select 1 from public.customers c
    where c.id = new.adopted_from_customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'ASSISTIGO_ADOPT_SAME_ORG: this customer already belongs to this centre'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_reject_self_adoption on public.customers;
create trigger customers_reject_self_adoption
  before insert or update of adopted_from_customer_id on public.customers
  for each row execute function public.reject_self_adoption();

-- -----------------------------------------------------------------------------
-- 3. The copy replaces the bookmark
-- -----------------------------------------------------------------------------
create or replace function public.unlink_adopted_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.adopted_from_customer_id is not null then
    delete from public.customer_roaming_links
    where organization_id = new.organization_id
      and customer_id = new.adopted_from_customer_id;
  end if;
  return new;
end;
$$;

comment on function public.unlink_adopted_customer() is
  'An adopted copy replaces the roaming bookmark it came from, so the person is listed once (0045 note 3).';

revoke execute on function public.unlink_adopted_customer() from public;

drop trigger if exists customers_unlink_adopted on public.customers;
create trigger customers_unlink_adopted
  after insert or update of adopted_from_customer_id on public.customers
  for each row execute function public.unlink_adopted_customer();

-- 0044's trigger, plus: no link for a customer this centre already holds a copy of.
create or replace function public.link_customer_on_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A centre's own customer needs no link (support or test paths can grant over one).
  if exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    return new;
  end if;

  -- Already adopted here (0045): the centre's own copy is the row it works with.
  if exists (
    select 1 from public.customers c
    where c.organization_id = new.organization_id
      and c.adopted_from_customer_id = new.customer_id
      and c.deleted_at is null
  ) then
    return new;
  end if;

  insert into public.customer_roaming_links (organization_id, customer_id, linked_by, last_served_at)
  values (new.organization_id, new.customer_id, new.granted_to_user_id, new.granted_at)
  on conflict (organization_id, customer_id) do update
    set last_served_at = greatest(public.customer_roaming_links.last_served_at, excluded.last_served_at);

  return new;
end;
$$;

comment on function public.link_customer_on_grant() is
  'A roaming grant puts the customer in the visiting centre''s list (0044 note 1) unless the centre already holds a copy (0045). The link grants no access.';

revoke execute on function public.link_customer_on_grant() from public;
