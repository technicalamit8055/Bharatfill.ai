-- =============================================================================
-- 0018  Keep organizations.plan_code in sync with the active subscription
-- Master spec §22.3, §22.4.
--
-- The entitlement service reads organizations.plan_code directly (no join) as its fast path.
-- A billing_admin may write `subscriptions` (RLS: subscriptions_write) but not `organizations`
-- (RLS: organizations_update is owner/manager only) — so a billing_admin driving a plan change
-- must do it entirely through `subscriptions`, with plan_code kept in sync here, the same
-- pattern 0005 uses for applications_record_status_change.
-- =============================================================================

create or replace function public.sync_organization_plan_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan_code text;
begin
  -- A cancelled/incomplete subscription leaves plan_code as-is: metered access already
  -- degrades from subscription status alone (§22.4 — failed billing never deletes data).
  if new.status not in ('active', 'trialing', 'past_due') then
    return new;
  end if;

  select code into target_plan_code from public.plans where id = new.plan_id;
  if target_plan_code is not null then
    update public.organizations set plan_code = target_plan_code where id = new.organization_id;
  end if;

  return new;
end;
$$;

create trigger subscriptions_sync_organization_plan_code
  after insert or update of plan_id, status on public.subscriptions
  for each row execute function public.sync_organization_plan_code();
