-- =============================================================================
-- 0029  Admin-managed plans
-- Master spec §6.1 (Super Admin: billing overrides), §22
--
-- Super admins create and edit plans from /admin/plans, so `plans` stops being a fixed list of
-- four codes and becomes the catalogue the entitlement service actually enforces from.
--
-- The product-owner rules this migration holds the line on, independently of the admin UI:
--
--   * A plan's PRICE is locked once any organization is on it. Repricing means creating a new
--     plan and retiring the old one; existing subscribers keep theirs. (Limit and feature
--     changes are allowed and apply to every subscriber immediately.)
--   * A plan's CODE never changes. `organizations.plan_code` refers to it by value.
--   * The free plan — every new organization's default — can never be retired.
--
-- Plan writes stay service-role only (no insert/update/delete policy), which is what the admin
-- panel uses after its own permission check. No personal data is involved.
-- =============================================================================

-- The built-in whitelist becomes a shape check; admin-created codes are allowed.
alter table public.plans drop constraint if exists plans_code_check;

alter table public.plans
  add constraint plans_code_format
    check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  add constraint plans_name_present
    check (length(btrim(name)) between 1 and 80),
  add constraint plans_limits_valid
    check (
      price_monthly_inr >= 0
      and (included_fills is null or included_fills >= 0)
      and (included_ai_extractions is null or included_ai_extractions >= 0)
      and included_seats >= 1
      and (max_customers is null or max_customers >= 0)
      and storage_mb >= 0
    );

-- The in-use check below and the admin panel's per-plan counts both filter on this.
create index if not exists organizations_plan_code_idx on public.organizations (plan_code);

-- -----------------------------------------------------------------------------
-- Whether any organization is on a plan: by the synced `plan_code` (which covers free-plan
-- organizations with no subscription row) or by a live subscription.
-- -----------------------------------------------------------------------------
create or replace function public.plan_in_use(p_plan_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.organizations o where o.plan_code = p_code)
      or exists (
        select 1
        from public.subscriptions s
        where s.plan_id = p_plan_id
          and s.status in ('active', 'trialing', 'past_due')
      );
$$;

revoke execute on function public.plan_in_use(uuid, text) from public;
grant execute on function public.plan_in_use(uuid, text) to service_role;

create or replace function public.guard_plan_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'plan_code_immutable' using errcode = 'check_violation';
  end if;

  if new.price_monthly_inr is distinct from old.price_monthly_inr
     and public.plan_in_use(old.id, old.code) then
    raise exception 'plan_price_locked' using errcode = 'check_violation';
  end if;

  if old.code = 'free' and new.active = false then
    raise exception 'plan_default_required' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger plans_guard_update
  before update on public.plans
  for each row execute function public.guard_plan_update();

-- -----------------------------------------------------------------------------
-- Read access. A retired plan leaves the public catalogue, but the organizations still on it
-- must keep reading it — the entitlement service resolves their limits from this row, and
-- hiding it would silently drop them to the free plan's limits.
-- -----------------------------------------------------------------------------
drop policy if exists plans_read on public.plans;

create policy plans_read on public.plans for select to authenticated
  using (
    active = true
    or exists (
      select 1
      from public.organizations o
      where o.plan_code = plans.code
        and public.is_org_member(o.id)
    )
  );
