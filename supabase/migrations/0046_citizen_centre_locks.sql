-- =============================================================================
-- 0046  No copies; a citizen can lock the centre that created their profile
-- Migrations 0024 (roaming), 0039 (app approval), 0042 (centre access), 0044 (joined list),
-- 0045 (copies — undone here); docs/VAULT_BRIDGE_DESIGN.md §16
--
-- Product owner, 2026-11-23 (later the same day as 0045):
--
--   * "Remove the rule of copy customer." A customer from another centre is never copied. The
--     visiting centre keeps the 0044 link: the customer is in its list for good, opening the
--     profile and documents needs a live grant, and the scheme matches stay visible after the
--     session ends or the citizen stops it (the masked card, 0024).
--   * A customer a centre created stays in that centre's panel for good, unless the citizen
--     locks the centre from the BharatDoc app. Locked means "stays listed, locked": the centre
--     still lists them (masked) and sees their scheme matches, but the profile, field values,
--     documents and prepared files close until the citizen approves a new request (app tap or
--     WhatsApp code, a time-boxed grant like any roaming visit) or unlocks the centre in the app.
--
-- 1. Undo 0045: drop the provenance columns, their indexes and triggers, and restore 0044's grant
--    trigger. `if exists` throughout, so this is correct whether or not 0045 ever ran.
-- 2. `customer_citizen_locks`: one row per locked customer record. Written by the service role
--    only (from the citizen's verified session); the home centre may read it, never write it.
-- 3. The four select policies 0024 rewrote, `has_customer_access` and the storage read policy:
--    the home-centre clause now also needs "not locked". The roaming-grant clause is unchanged,
--    so a fresh approval reopens a locked record for the operator it names, for its window.
-- 4. `can_request_customer_access`: the caller may ask for access — a link (0024) or a locked
--    record at their own centre. Replaces the link-only check on the request paths.
-- 5. `roaming_customer_card` serves the masked card for a locked record to its home centre.
-- 6. `centre_customer_list` keeps locked own rows, masked, with `is_locked`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Undo 0045
-- -----------------------------------------------------------------------------
drop trigger if exists customers_unlink_adopted on public.customers;
drop trigger if exists customers_reject_self_adoption on public.customers;
drop function if exists public.unlink_adopted_customer();
drop function if exists public.reject_self_adoption();

drop index if exists public.customers_adopted_from_uidx;
drop index if exists public.documents_adopted_from_uidx;
drop index if exists public.document_derivatives_adopted_from_uidx;

alter table public.customers drop column if exists adopted_from_customer_id;
alter table public.documents drop column if exists adopted_from_document_id;
alter table public.document_derivatives drop column if exists adopted_from_derivative_id;

-- 0044's trigger, exactly.
create or replace function public.link_customer_on_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A centre's own customer needs no link (support or test paths can grant over one, and so
  -- does a citizen's approval for a locked home centre, 0046).
  if exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
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
  'A roaming grant puts the customer in the visiting centre''s list (0044 note 1). The link grants no access.';

revoke execute on function public.link_customer_on_grant() from public;

-- -----------------------------------------------------------------------------
-- 2. customer_citizen_locks
-- -----------------------------------------------------------------------------
create table if not exists public.customer_citizen_locks (
  customer_id      uuid primary key references public.customers (id) on delete cascade,
  -- The customer's home centre, copied from the row so its members can read their own locks.
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  citizen_id       uuid references public.citizen_accounts (id) on delete set null,
  locked_at        timestamptz not null default now()
);

comment on table public.customer_citizen_locks is
  'The citizen locked the centre that created this record (0046): listed there, masked, until a new approval or an unlock. Service role writes only.';

create index if not exists customer_citizen_locks_org_idx
  on public.customer_citizen_locks (organization_id);

-- The lock names the record's own centre, and never the BharatDoc app organization (nobody
-- works there, 0041).
create or replace function public.check_citizen_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers c
    where c.id = new.customer_id
      and c.organization_id = new.organization_id
      and c.organization_id <> public.citizen_app_organization_id()
  ) then
    raise exception 'ASSISTIGO_CITIZEN_LOCK_WRONG_CENTRE: a lock names the record''s own centre'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_citizen_locks_check on public.customer_citizen_locks;
create trigger customer_citizen_locks_check
  before insert or update on public.customer_citizen_locks
  for each row execute function public.check_citizen_lock();

alter table public.customer_citizen_locks enable row level security;

-- The home centre sees which of its records are locked. No insert/update/delete policy: only the
-- citizen, through the server, locks or unlocks.
drop policy if exists customer_citizen_locks_select on public.customer_citizen_locks;
create policy customer_citizen_locks_select on public.customer_citizen_locks
  for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.is_customer_citizen_locked(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customer_citizen_locks l where l.customer_id = p_customer_id
  );
$$;

comment on function public.is_customer_citizen_locked(uuid) is
  'The citizen locked this record''s home centre (0046). Closes the home-centre clause of the read policies; a live grant still opens.';

revoke execute on function public.is_customer_citizen_locked(uuid) from public;
grant execute on function public.is_customer_citizen_locked(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Read policies: the home-centre clause also needs "not locked"
-- -----------------------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (
    (
      public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
      and not public.is_customer_citizen_locked(id)
    )
    or public.has_support_access(organization_id, 'customer_records')
    or public.has_active_customer_grant(id)
  );

drop policy if exists customer_field_values_select on public.customer_field_values;
create policy customer_field_values_select on public.customer_field_values
  for select to authenticated
  using (
    (
      public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
      and not public.is_customer_citizen_locked(customer_id)
    )
    or public.has_support_access(organization_id, 'customer_records')
    or public.has_active_customer_grant(customer_id)
  );

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    (
      public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
      and (customer_id is null or not public.is_customer_citizen_locked(customer_id))
    )
    or public.has_support_access(organization_id, 'documents')
    or (customer_id is not null and public.has_active_customer_grant(customer_id))
  );

drop policy if exists document_derivatives_select on public.document_derivatives;
create policy document_derivatives_select on public.document_derivatives
  for select to authenticated
  using (
    (
      public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
      and (customer_id is null or not public.is_customer_citizen_locked(customer_id))
    )
    or (customer_id is not null and public.has_active_customer_grant(customer_id))
  );

-- 0024's helper, with the same rule.
create or replace function public.has_customer_access(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.customers c
      where c.id = p_customer_id
        and public.has_org_role(c.organization_id, array['owner', 'manager', 'operator'])
        and not public.is_customer_citizen_locked(c.id)
    )
    or public.has_active_customer_grant(p_customer_id);
$$;

-- Is this storage object a file of a locked record? Org from the path keeps the lookups on the
-- (organization_id, storage_bucket, storage_path) unique indexes.
create or replace function public.storage_object_citizen_locked(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1
      from public.documents d
      join public.customer_citizen_locks l on l.customer_id = d.customer_id
      where d.organization_id = public.org_id_from_storage_path(p_name)
        and d.storage_bucket = p_bucket
        and d.storage_path = p_name
    )
    or exists (
      select 1
      from public.document_derivatives v
      join public.customer_citizen_locks l on l.customer_id = v.customer_id
      where v.organization_id = public.org_id_from_storage_path(p_name)
        and v.storage_bucket = p_bucket
        and v.storage_path = p_name
    );
$$;

revoke execute on function public.storage_object_citizen_locked(text, text) from public;
grant execute on function public.storage_object_citizen_locked(text, text) to authenticated, service_role;

-- 0037 F1, plus the lock. A grant holder still reads through "assistigo roaming documents read".
drop policy if exists "assistigo documents read" on storage.objects;
create policy "assistigo documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('customer-documents', 'prepared-files')
    and public.has_org_role(
      public.org_id_from_storage_path(name),
      array['owner', 'manager', 'operator', 'viewer']
    )
    and not public.storage_object_citizen_locked(bucket_id, name)
  );

comment on policy "assistigo documents read" on storage.objects is
  'Same roles as documents_select / document_derivatives_select (0037 F1); not the files of a record the citizen locked (0046).';

-- -----------------------------------------------------------------------------
-- 4. Who may ask the citizen for access
-- -----------------------------------------------------------------------------
create or replace function public.can_request_customer_access(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_customer_roaming_link(p_customer_id)
    or exists (
      select 1
      from public.customers c
      join public.customer_citizen_locks l on l.customer_id = c.id
      where c.id = p_customer_id
        and c.deleted_at is null
        and public.has_org_role(c.organization_id, array['owner', 'manager', 'operator'])
    );
$$;

comment on function public.can_request_customer_access(uuid) is
  'The caller''s centre may ask this citizen for access: it has the customer linked (0024/0044), or it created the record and the citizen locked it (0046).';

revoke execute on function public.can_request_customer_access(uuid) from public;
grant execute on function public.can_request_customer_access(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. The masked card, also for a locked record at its home centre
-- -----------------------------------------------------------------------------
create or replace function public.roaming_customer_card(p_customer_id uuid, p_caller_user_id uuid)
returns table (
  customer_id           uuid,
  home_organization_id  uuid,
  full_name             text,
  mobile                text,
  district              text,
  state                 text,
  date_of_birth         date,
  gender                text,
  category              text,
  education_json        jsonb,
  certificates_json     jsonb,
  identity_summary_json jsonb,
  verification_status   text,
  is_linked             boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.organization_id,
    c.full_name,
    c.mobile,
    coalesce(
      c.address_json -> 'permanent' ->> 'district',
      c.address_json -> 'current' ->> 'district'
    ),
    coalesce(
      c.address_json -> 'permanent' ->> 'state',
      c.address_json -> 'current' ->> 'state'
    ),
    c.date_of_birth,
    c.gender,
    c.category,
    c.education_json,
    c.certificates_json,
    c.identity_summary_json,
    c.verification_status,
    -- "In my list": linked, or my own locked record.
    exists (
      select 1
      from public.customer_roaming_links l
      join public.organization_members m on m.organization_id = l.organization_id
      where l.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
    )
    or exists (
      select 1
      from public.customer_citizen_locks k
      join public.organization_members m on m.organization_id = k.organization_id
      where k.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
    )
  from public.customers c
  where c.id = p_customer_id
    and c.deleted_at is null
    and (
      exists (
        select 1
        from public.customer_roaming_links l
        join public.organization_members m on m.organization_id = l.organization_id
        where l.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
      )
      or exists (
        select 1
        from public.customer_citizen_locks k
        join public.organization_members m on m.organization_id = k.organization_id
        where k.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
      )
      or exists (
        select 1
        from public.customer_access_grants g
        where g.customer_id = c.id
          and g.granted_to_user_id = p_caller_user_id
          and g.status = 'active'
          and g.revoked_at is null
          and g.expires_at > now()
      )
    );
$$;

comment on function public.roaming_customer_card(uuid, uuid) is
  'Raw pre-auth projection for one customer, by id: linked, a locked home record (0046) or a live grant. Service role only — masking happens in apps/web/lib/roaming/card.ts.';

revoke execute on function public.roaming_customer_card(uuid, uuid) from public;
revoke execute on function public.roaming_customer_card(uuid, uuid) from authenticated;
grant execute on function public.roaming_customer_card(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 6. centre_customer_list — locked own rows stay, masked, with is_locked
-- -----------------------------------------------------------------------------
drop function if exists public.centre_customer_list(uuid, timestamptz, boolean, int, int);

create function public.centre_customer_list(
  p_organization_id uuid,
  p_since timestamptz default null,
  p_include_linked boolean default true,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  customer_id         uuid,
  is_linked           boolean,
  full_name           text,    -- own, unlocked rows only
  given_name          text,    -- linked and locked rows (masked)
  family_initial      text,    -- linked and locked rows (masked)
  mobile_last4        text,
  district            text,
  verification_status text,
  added_at            timestamptz,
  has_active_grant    boolean,
  grant_expires_at    timestamptz,
  is_locked           boolean,
  total_count         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with own as (
    select
      c.id,
      false as is_linked,
      case when k.customer_id is null then c.full_name end as full_name,
      case when k.customer_id is not null then public.roaming_given_name(c.full_name) end as given_name,
      case when k.customer_id is not null then public.roaming_family_initial(c.full_name) end as family_initial,
      right(coalesce(c.mobile_normalized, ''), 4) as mobile_last4,
      coalesce(
        c.address_json -> 'current' ->> 'district',
        c.address_json -> 'permanent' ->> 'district'
      ) as district,
      c.verification_status,
      c.created_at as added_at,
      g.id is not null as has_active_grant,
      g.expires_at as grant_expires_at,
      k.customer_id is not null as is_locked
    from public.customers c
    left join public.customer_citizen_locks k on k.customer_id = c.id
    left join lateral (
      select g2.id, g2.expires_at
      from public.customer_access_grants g2
      where k.customer_id is not null
        and g2.customer_id = c.id
        and g2.granted_to_user_id = auth.uid()
        and g2.status = 'active'
        and g2.revoked_at is null
        and g2.expires_at > now()
      order by g2.expires_at desc
      limit 1
    ) g on true
    where c.organization_id = p_organization_id
      and c.deleted_at is null
      and (p_since is null or c.created_at >= p_since)
  ),
  linked as (
    select
      c.id,
      true,
      null::text,
      public.roaming_given_name(c.full_name),
      public.roaming_family_initial(c.full_name),
      right(coalesce(c.mobile_normalized, ''), 4),
      coalesce(
        c.address_json -> 'current' ->> 'district',
        c.address_json -> 'permanent' ->> 'district'
      ),
      c.verification_status,
      -- When this centre first served them: the day they "joined" this centre.
      l.created_at,
      g.id is not null,
      g.expires_at,
      false
    from public.customer_roaming_links l
    join public.customers c
      on c.id = l.customer_id
     and c.deleted_at is null
     and c.organization_id <> p_organization_id
    left join lateral (
      select g2.id, g2.expires_at
      from public.customer_access_grants g2
      where g2.customer_id = l.customer_id
        and g2.granted_to_user_id = auth.uid()
        and g2.status = 'active'
        and g2.revoked_at is null
        and g2.expires_at > now()
      order by g2.expires_at desc
      limit 1
    ) g on true
    where p_include_linked
      and l.organization_id = p_organization_id
      and (p_since is null or l.created_at >= p_since)
  ),
  combined as (
    select * from own
    union all
    select * from linked
  )
  select combined.*, count(*) over () as total_count
  from combined
  -- Authorisation inside the definer: the roles `customers_select` admits for own rows (0024).
  where public.has_org_role(p_organization_id, array['owner', 'manager', 'operator', 'viewer'])
  order by added_at desc, id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) is
  'The centre''s customer list: own customers (full name; masked when the citizen locked the centre, 0046) and roaming-linked ones (masked), newest first (0044).';

revoke execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) from public;
revoke execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) from anon;
grant execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) to authenticated, service_role;
