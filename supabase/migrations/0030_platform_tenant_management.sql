-- =============================================================================
-- 0030  Tenant management from the Super Admin panel
-- Master spec §6.1 (Super Admin: "manage organizations, billing overrides")
--
-- Three capabilities, all driven from /admin/tenants by the service role after the panel's own
-- permission check (`platform.tenants.manage`, `platform.billing.override` — Super Admin only):
--
--   * Suspension. A suspended centre keeps every row it owns — nothing is deleted or hidden from
--     its own members' reads — but the dashboard and the extension refuse to act for it
--     (apps/web/lib/auth/session.ts, apps/web/lib/api/context.ts). The columns below are locked
--     against tenant sessions by a trigger, because `organizations_update` lets an owner write the
--     row and RLS is row-level, not column-level.
--
--   * Manual billing overrides. A `manual` subscription provider marks a plan that staff set by
--     hand — a pilot, a comp, a support fix — as distinct from one a centre paid for. Tenant
--     sessions may not create or edit one (`subscriptions_write` would otherwise let an owner
--     rewrite their own comp onto a bigger plan).
--
--   * Reads. `platform_tenant_rows()` gains status, subscription and total-count columns, and
--     `platform_tenant_detail()` returns one centre's metadata and COUNTS. Same contract as 0021:
--     no customer name, contact, document or field value anywhere in either result.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations: suspension
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column suspended_at      timestamptz,
  add column suspension_reason text,
  add column suspended_by      uuid references auth.users (id) on delete set null;

-- Both or neither: a suspension nobody can explain is not one an owner can be told about or an
-- auditor can check. Looser than ADMIN_REASON_MIN/MAX in packages/core (10–200), which the panel
-- enforces before scrubbing identifiers out of the text; the scrubbed form can run slightly longer.
alter table public.organizations
  add constraint organizations_suspension_has_reason
    check (
      (suspended_at is null and suspension_reason is null)
      or (suspended_at is not null
          and length(btrim(suspension_reason)) between 10 and 500)
    );

comment on column public.organizations.suspended_at is
  'Set by platform staff only (0030). A suspended centre keeps its data but the app refuses to act for it.';
comment on column public.organizations.suspension_reason is
  'Internal note for platform staff; never shown to the centre.';

create index organizations_suspended_idx
  on public.organizations (suspended_at)
  where suspended_at is not null;

-- security INVOKER on purpose: `current_user` must be the caller's role. PostgREST runs a tenant
-- request as `authenticated`; the admin panel's service-role client runs as `service_role`; a
-- security-definer function further up the stack (the plan-code sync, say) runs as its owner.
create or replace function public.guard_organization_suspension()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.suspended_at is distinct from old.suspended_at
      or new.suspension_reason is distinct from old.suspension_reason
      or new.suspended_by is distinct from old.suspended_by)
     and current_user in ('authenticated', 'anon') then
    raise exception 'organization_suspension_locked'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_suspension
  before update on public.organizations
  for each row execute function public.guard_organization_suspension();

-- -----------------------------------------------------------------------------
-- subscriptions: the `manual` provider
-- -----------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check
    check (provider in ('mock', 'razorpay', 'stripe', 'manual'));

comment on column public.subscriptions.provider is
  '`manual` = set by platform staff from /admin (0030); tenant sessions cannot write one.';

-- A tenant may still replace a manual row with a plan of their own through the normal checkout
-- (which rewrites `provider`), exactly as they could before. What they may not do is leave the
-- row marked `manual` while changing it — that would be granting themselves a comp.
create or replace function public.guard_manual_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider = 'manual' and current_user in ('authenticated', 'anon') then
    raise exception 'subscription_manual_locked'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger subscriptions_guard_manual
  before insert or update on public.subscriptions
  for each row execute function public.guard_manual_subscription();

-- -----------------------------------------------------------------------------
-- platform_tenant_rows — widened
--
-- The return type changes, which `create or replace` cannot do, so the 0021 version is dropped
-- first. Callers built before this migration use the three-argument form; the app falls back to
-- it when this one is missing (apps/web/lib/admin/metrics.ts).
-- -----------------------------------------------------------------------------
drop function if exists public.platform_tenant_rows(text, int, int);

create or replace function public.platform_tenant_rows(
  search        text default null,
  row_limit     int  default 50,
  row_offset    int  default 0,
  status_filter text default null,
  plan_filter   text default null
)
returns table (
  id                  uuid,
  name                text,
  business_type       text,
  city                text,
  state               text,
  plan_code           text,
  created_at          timestamptz,
  suspended_at        timestamptz,
  subscription_status text,
  member_count        bigint,
  customer_count      bigint,
  application_count   bigint,
  fill_sessions_30d   bigint,
  last_activity_at    timestamptz,
  total_count         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.business_type,
    o.city,
    o.state,
    o.plan_code,
    o.created_at,
    o.suspended_at,
    (select s.status from public.subscriptions s
      where s.organization_id = o.id and s.status in ('active', 'trialing', 'past_due')
      limit 1),
    (select count(*) from public.organization_members m
      where m.organization_id = o.id and m.status = 'active'),
    (select count(*) from public.customers c
      where c.organization_id = o.id and c.deleted_at is null),
    (select count(*) from public.applications a where a.organization_id = o.id),
    (select count(*) from public.fill_sessions f
      where f.organization_id = o.id and f.created_at >= now() - interval '30 days'),
    (select max(f.created_at) from public.fill_sessions f where f.organization_id = o.id),
    count(*) over ()
  from public.organizations o
  where o.deleted_at is null
    and (search is null or btrim(search) = '' or o.name ilike '%' || btrim(search) || '%')
    and (status_filter is null
         or (status_filter = 'suspended' and o.suspended_at is not null)
         or (status_filter = 'active' and o.suspended_at is null))
    and (plan_filter is null or btrim(plan_filter) = '' or o.plan_code = plan_filter)
  order by o.created_at desc
  limit greatest(least(row_limit, 200), 1)
  offset greatest(row_offset, 0);
$$;

comment on function public.platform_tenant_rows(text, int, int, text, text) is
  'Tenant list for the Super Admin panel: organization metadata and volume counts only (spec §6.1).';

revoke execute on function public.platform_tenant_rows(text, int, int, text, text)
  from public, authenticated, anon;
grant execute on function public.platform_tenant_rows(text, int, int, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- platform_tenant_detail — one centre, metadata and counts
--
-- Deliberately omits the organization's phone and email: the tenant list never showed them, and
-- widening what internal staff can see about a centre's owner is a product decision, not a side
-- effect of adding a detail page. `suspension_reason` is included because staff wrote it.
-- -----------------------------------------------------------------------------
create or replace function public.platform_tenant_detail(org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when o.id is null then null else jsonb_build_object(
    'id',               o.id,
    'name',             o.name,
    'businessType',     o.business_type,
    'city',             o.city,
    'district',         o.district,
    'state',            o.state,
    'preferredLocale',  o.preferred_locale,
    'planCode',         o.plan_code,
    'createdAt',        o.created_at,
    'deletedAt',        o.deleted_at,
    'suspendedAt',      o.suspended_at,
    'suspensionReason', o.suspension_reason,
    'members', jsonb_build_object(
      'active',  (select count(*) from public.organization_members m
                   where m.organization_id = o.id and m.status = 'active'),
      'invited', (select count(*) from public.organization_invitations i
                   where i.organization_id = o.id and i.status = 'pending'),
      'byRole',  (select coalesce(jsonb_object_agg(role, role_count), '{}'::jsonb)
                    from (select m.role, count(*) as role_count
                            from public.organization_members m
                           where m.organization_id = o.id and m.status = 'active'
                           group by m.role) roles)
    ),
    'volumes', jsonb_build_object(
      'customers',       (select count(*) from public.customers c
                           where c.organization_id = o.id and c.deleted_at is null),
      'documents',       (select count(*) from public.documents d
                           where d.organization_id = o.id and d.deleted_at is null),
      'applications',    (select count(*) from public.applications a
                           where a.organization_id = o.id),
      'fillSessions30d', (select count(*) from public.fill_sessions f
                           where f.organization_id = o.id
                             and f.created_at >= now() - interval '30 days'),
      'fieldsFilled30d', (select coalesce(sum(f.filled_fields_count), 0) from public.fill_sessions f
                           where f.organization_id = o.id
                             and f.created_at >= now() - interval '30 days'),
      'storageBytes',    coalesce((select sum(d.size_bytes) from public.documents d
                                    where d.organization_id = o.id and d.deleted_at is null), 0)
                         + coalesce((select sum(v.size_bytes) from public.document_derivatives v
                                      where v.organization_id = o.id), 0)
    ),
    'applicationsByStatus', (select coalesce(jsonb_object_agg(status, status_count), '{}'::jsonb)
                               from (select a.status, count(*) as status_count
                                       from public.applications a
                                      where a.organization_id = o.id
                                      group by a.status) statuses),
    'lastActivityAt', (select max(f.created_at) from public.fill_sessions f
                        where f.organization_id = o.id),
    'subscription', (select jsonb_build_object(
                              'status',             s.status,
                              'provider',           s.provider,
                              'planCode',           p.code,
                              'currentPeriodEnd',   s.current_period_end,
                              'cancelAtPeriodEnd',  s.cancel_at_period_end
                            )
                       from public.subscriptions s
                       join public.plans p on p.id = s.plan_id
                      where s.organization_id = o.id
                        and s.status in ('active', 'trialing', 'past_due')
                      limit 1),
    -- This calendar month, the same window the entitlement service meters against.
    'usageThisPeriod', (select coalesce(jsonb_object_agg(event_type, total), '{}'::jsonb)
                          from (select u.event_type, sum(u.quantity) as total
                                  from public.usage_events u
                                 where u.organization_id = o.id
                                   and u.billable
                                   and u.created_at >= date_trunc('month', now())
                                 group by u.event_type) usage)
  ) end
  from (select 1) anchor
  left join public.organizations o on o.id = org;
$$;

comment on function public.platform_tenant_detail(uuid) is
  'One centre for the Super Admin panel: organization metadata and counts only (spec §6.1).';

revoke execute on function public.platform_tenant_detail(uuid) from public, authenticated, anon;
grant execute on function public.platform_tenant_detail(uuid) to service_role;
