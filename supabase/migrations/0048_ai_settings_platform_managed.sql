-- =============================================================================
-- 0048  AI vendor settings are managed by platform staff
-- docs/AI_PIPELINE.md §2; docs/SECURITY.md §4
--
-- AI settings left the operator dashboard for the Super Admin console. Tenants keep reading their
-- own row ("read by" on the upload panel) and lose every write path, both to the vendor row and
-- to the `ai_processing_enabled` gate. No stored row or setting is changed.
-- =============================================================================

drop policy if exists organization_ai_settings_insert on public.organization_ai_settings;
drop policy if exists organization_ai_settings_update on public.organization_ai_settings;
drop policy if exists organization_ai_settings_delete on public.organization_ai_settings;

-- Same shape as guard_organization_suspension() (0030): an owner may update `organizations`
-- directly, so the one key inside `settings` needs its own guard.
create or replace function public.guard_organization_ai_processing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.settings -> 'ai_processing_enabled')
       is distinct from (old.settings -> 'ai_processing_enabled')
     and current_user in ('authenticated', 'anon') then
    raise exception 'organization_ai_processing_locked'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_ai_processing on public.organizations;
create trigger organizations_guard_ai_processing
  before update on public.organizations
  for each row execute function public.guard_organization_ai_processing();
