-- =============================================================================
-- 0041  BharatDoc app accounts are ordinary customers
-- docs/VAULT_BRIDGE_DESIGN.md §13 (supersedes D10 and the separate "BharatDoc app" box);
-- migrations 0024 (roaming), 0038 (citizen vault), 0039 (roaming app approval)
--
-- Product decision, 2026-11-22: a citizen who signs up in the BharatDoc app must look, to an
-- operator, exactly like a customer an operator registered. Same search, same customer view,
-- same extracted profile, same form filling. The app is just a second way in.
--
-- The shape that delivers that without a second code path:
--
--   1. One platform-owned organization, "BharatDoc app" (fixed id below). It has no members and
--      may never get one (trigger below). Every app account gets one `customers` row there,
--      and every synced document a `documents` row, so the platform-wide roaming search (0024)
--      finds them like any other centre's customer.
--
--   2. Because nobody is a member, nobody reads those rows by default. A visiting centre gets in
--      the way it gets into any other centre's customer: a roaming grant, which the citizen
--      gives with one tap in the app (0039) or an SMS OTP (0024). Nothing about consent changes.
--
--   3. One thing does change for app customers only. A roaming grant never opened
--      `document_extractions` (0024 note), because a visiting centre should not read another
--      centre's unreviewed OCR. An app customer has no home centre to review it, so the grant
--      holder — the operator with the citizen at the counter — reads the extraction and does the
--      review. That read is opened here for app-organization rows only. The review WRITES
--      (profile, field values, statuses) go through the server's review route on the service
--      role after it has re-proved the grant; no write policy is added for grant holders.
--
-- The vault tables stay: the phone still encrypts and syncs to `citizen-vault`. The server
-- mirrors each confirmed document into `customer-documents` (lib/citizen/app-customer.ts).
-- =============================================================================

create or replace function public.citizen_app_organization_id()
returns uuid
language sql
immutable
as $$
  select 'b4a7d0c0-a990-4c1e-8d0c-000000000001'::uuid;
$$;

comment on function public.citizen_app_organization_id() is
  'The platform organization that owns every BharatDoc app customer (0041 note 1). It has no members.';

grant execute on function public.citizen_app_organization_id() to authenticated, service_role;

insert into public.organizations (id, name, business_type, preferred_locale)
values (public.citizen_app_organization_id(), 'BharatDoc app', 'other', 'hi')
on conflict (id) do nothing;

-- Nobody works "at" the app. A membership would turn every app customer into that member's
-- local customer, with no consent step (note 2).
create or replace function public.refuse_citizen_app_membership()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id = public.citizen_app_organization_id() then
    raise exception 'ASSISTIGO_CITIZEN_APP_HAS_NO_MEMBERS' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger organization_members_not_citizen_app
  before insert or update on public.organization_members
  for each row execute function public.refuse_citizen_app_membership();

-- -----------------------------------------------------------------------------
-- Links from the vault to the customer record
-- -----------------------------------------------------------------------------
alter table public.citizen_accounts
  add column customer_id uuid unique references public.customers (id) on delete set null;

comment on column public.citizen_accounts.customer_id is
  'This citizen''s customer row in the BharatDoc app organization (0041). Written by the server only.';

alter table public.citizen_vault_documents
  add column mirror_document_id uuid unique references public.documents (id) on delete set null;

comment on column public.citizen_vault_documents.mirror_document_id is
  'The documents row the server made from this synced file for the citizen''s customer record (0041).';

-- -----------------------------------------------------------------------------
-- Is this an app customer the caller may review right now?
-- -----------------------------------------------------------------------------
create or replace function public.can_review_app_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.organization_id = public.citizen_app_organization_id()
      and c.deleted_at is null
  )
  and public.has_active_customer_grant(p_customer_id);
$$;

comment on function public.can_review_app_customer(uuid) is
  'BharatDoc app customer and the caller holds a live roaming grant over them (0041 note 3).';

revoke execute on function public.can_review_app_customer(uuid) from public;
revoke execute on function public.can_review_app_customer(uuid) from anon;
grant execute on function public.can_review_app_customer(uuid) to authenticated, service_role;

-- document_extractions: the 0010 predicate plus the app-customer clause (note 3). Other
-- centres' extractions stay closed to grant holders.
drop policy if exists document_extractions_select on public.document_extractions;
create policy document_extractions_select on public.document_extractions
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or public.has_support_access(organization_id, 'documents')
    or (
      organization_id = public.citizen_app_organization_id()
      and exists (
        select 1
        from public.documents d
        where d.id = document_extractions.document_id
          and d.organization_id = public.citizen_app_organization_id()
          and d.customer_id is not null
          and d.deleted_at is null
          and public.can_review_app_customer(d.customer_id)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Backfill: accounts made before this migration get their customer row now, so they are
-- findable at once. Documents are mirrored by the server on the phone's next sync (they are
-- encrypted, so SQL cannot copy them).
-- -----------------------------------------------------------------------------
do $$
declare
  account record;
  new_customer uuid;
begin
  for account in
    select c.id, c.display_name, right(u.phone, 10) as mobile
    from public.citizen_accounts c
    join auth.users u on u.id = c.id
    where c.customer_id is null
      and u.phone ~ '^91[6-9][0-9]{9}$'
  loop
    insert into public.customers (organization_id, full_name, mobile)
    values (
      public.citizen_app_organization_id(),
      case when length(btrim(account.display_name)) >= 2 then btrim(account.display_name)
           else 'Customer' end,
      account.mobile
    )
    returning id into new_customer;

    update public.citizen_accounts set customer_id = new_customer where id = account.id;
  end loop;
end;
$$;
