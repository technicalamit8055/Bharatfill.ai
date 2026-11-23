-- =============================================================================
-- 0044  Roaming customers join the centre's customer list
-- Migration 0024 (roaming); docs/VAULT_BRIDGE_DESIGN.md §13–§14
--
-- Product owner, 2026-11-23: "whenever an operator finds a roaming customer and gets access, the
-- customer should go into that operator's customer section, so the roaming customer becomes that
-- operator's customer." Decided with it:
--
--   * No copy. The record stays with its home centre (or the BharatDoc app); the visiting centre
--     keeps a link (`customer_roaming_links`, 0024) and the customer is listed with its own.
--   * Listed, approve each visit. A link grants nothing (0024 header note 1): opening details or
--     documents still needs a live grant — the citizen's approval in the app, an SMS OTP, or a
--     trusted-centre grant (0042). Without one the list shows only the masked card fields.
--   * Mobile + name identify a customer (customer codes are hidden in the UI, kept here).
--
-- Three changes:
--
--   1. A grant links the customer. Until now a link was made only when the operator pressed
--      "Link to counter"; the grant paths (OTP 0024, app approval 0039, trusted 0042) merely
--      bumped `last_served_at` on a link that usually did not exist, so roaming customers never
--      reached the list. A trigger on `customer_access_grants` now links on every grant, whichever
--      path minted it, and existing grants are backfilled.
--
--   2. `centre_customer_list` — one list of the centre's own customers and its linked ones,
--      newest first, paginated in SQL. Own rows carry the full name (the caller reads them under
--      `customers_select` anyway); linked rows only the 0024 masked projection.
--
--   3. Fix: `roaming_linked_customers` took the LAST letter of the last word as the "family
--      initial" (`left(reverse(word), 1)`), so "Rahul Kumar" showed as "Rahul r." and a one-word
--      name as its own last letter. Now the first letter of the last word, upper-cased, and only
--      when the name has more than one word.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared: the masked display parts of a name (0024's projection, fixed)
-- -----------------------------------------------------------------------------
create or replace function public.roaming_given_name(p_full_name text)
returns text
language sql
immutable
as $$
  select split_part(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), ' ', 1);
$$;

create or replace function public.roaming_family_initial(p_full_name text)
returns text
language sql
immutable
as $$
  select case
    when position(' ' in regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')) = 0
      then null
    else nullif(
      upper(left(regexp_replace(btrim(p_full_name), '^.*\s', ''), 1)),
      ''
    )
  end;
$$;

comment on function public.roaming_family_initial(text) is
  'First letter of the last word of a multi-word name, upper-cased; null for a one-word name (0044 fix of 0024).';

-- -----------------------------------------------------------------------------
-- 1. Every grant links the customer to the visiting centre
-- -----------------------------------------------------------------------------
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

drop trigger if exists customer_access_grants_link_customer on public.customer_access_grants;
create trigger customer_access_grants_link_customer
  after insert on public.customer_access_grants
  for each row execute function public.link_customer_on_grant();

-- Backfill: every centre that was ever granted access gets its link, dated by its latest grant.
insert into public.customer_roaming_links (organization_id, customer_id, linked_by, last_served_at)
select distinct on (g.organization_id, g.customer_id)
  g.organization_id, g.customer_id, g.granted_to_user_id, g.granted_at
from public.customer_access_grants g
join public.customers c on c.id = g.customer_id
where c.organization_id <> g.organization_id
order by g.organization_id, g.customer_id, g.granted_at desc
on conflict (organization_id, customer_id) do update
  set last_served_at = greatest(public.customer_roaming_links.last_served_at, excluded.last_served_at);

-- -----------------------------------------------------------------------------
-- 3. roaming_linked_customers with the fixed initial (signature unchanged)
-- -----------------------------------------------------------------------------
create or replace function public.roaming_linked_customers(
  p_organization_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  customer_id          uuid,
  home_organization_id uuid,
  given_name           text,
  family_initial       text,
  mobile_last4         text,
  district             text,
  state                text,
  verification_status  text,
  last_served_at       timestamptz,
  has_active_grant     boolean,
  grant_expires_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.organization_id,
    public.roaming_given_name(c.full_name),
    public.roaming_family_initial(c.full_name),
    right(coalesce(c.mobile_normalized, ''), 4),
    coalesce(
      c.address_json -> 'permanent' ->> 'district',
      c.address_json -> 'current' ->> 'district'
    ),
    coalesce(
      c.address_json -> 'permanent' ->> 'state',
      c.address_json -> 'current' ->> 'state'
    ),
    c.verification_status,
    l.last_served_at,
    g.id is not null,
    g.expires_at
  from public.customer_roaming_links l
  join public.customers c on c.id = l.customer_id and c.deleted_at is null
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
  where l.organization_id = p_organization_id
    and public.is_org_member(p_organization_id)
  order by l.last_served_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- -----------------------------------------------------------------------------
-- 2. centre_customer_list — own and linked customers in one page
-- -----------------------------------------------------------------------------
create or replace function public.centre_customer_list(
  p_organization_id uuid,
  p_since timestamptz default null,
  p_include_linked boolean default true,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  customer_id         uuid,
  is_linked           boolean,
  full_name           text,    -- own rows only; null for a linked row
  given_name          text,    -- linked rows only (masked)
  family_initial      text,    -- linked rows only (masked)
  mobile_last4        text,
  district            text,
  verification_status text,
  added_at            timestamptz,
  has_active_grant    boolean,
  grant_expires_at    timestamptz,
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
      c.full_name,
      null::text as given_name,
      null::text as family_initial,
      right(coalesce(c.mobile_normalized, ''), 4) as mobile_last4,
      coalesce(
        c.address_json -> 'current' ->> 'district',
        c.address_json -> 'permanent' ->> 'district'
      ) as district,
      c.verification_status,
      c.created_at as added_at,
      false as has_active_grant,
      null::timestamptz as grant_expires_at
    from public.customers c
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
      g.expires_at
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
  'The centre''s customer list: own customers (full name) and roaming-linked ones (masked), newest first (0044).';

revoke execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) from public;
revoke execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) from anon;
grant execute on function public.centre_customer_list(uuid, timestamptz, boolean, int, int) to authenticated, service_role;
