-- =============================================================================
-- 0037  Operator-principal guards (pre-work for the Citizen Vault bridge)
-- Master spec §18.3, §19.4; docs/SECURITY.md §2, §3; CITIZEN_MOBILE_APP_SPEC.md §6 Phase 2
--
-- Two defects found in the Phase 2/3 bridge audit. Both had to be closed before citizen phone
-- sign-in is enabled in this project, because phone OTP turns every citizen into an
-- `authenticated` principal on the same PostgREST surface operators use.
--
--   F1. `billing_admin` could read customer document bytes through the Storage API.
--       `documents`, `document_derivatives` and `document_drop_files` all exclude billing_admin
--       (0010, 0022; spec §18.3), but the 0010 storage read policy only asked
--       `is_org_member()`, which every role satisfies. Storage `list` is a select on
--       storage.objects, so a billing admin's JWT could enumerate and download every file under
--       `org/<their org>/…` without ever reading a row that names the path. The policy now asks
--       for exactly the roles the three row tables admit. Write and delete are unchanged; the
--       0024 roaming read policy is a separate, grant-gated policy and is unchanged.
--
--   F2. Any authenticated user could become an operator. `create_organization` (0011) is
--       granted to `authenticated` and needs nothing but `auth.uid()`. Today that means anyone
--       who can sign up by email — the intended open sign-up. Once phone OTP is enabled for the
--       citizen app it would also mean every citizen session minted from the public anon key:
--       one RPC call from a phone account to owner of a centre, with roaming search and, later,
--       the vault bridge behind it. Citizen and operator identities must never share an
--       `auth.uid()` (bridge design: identity plane).
--
--       The guard sits on `organization_members`, not inside the two RPCs, so it covers
--       `create_organization`, `accept_invitation` and every service-role insert (seed, tests,
--       future admin tooling) at once, and no function body is copied here to drift. An ACTIVE
--       membership may only belong to an operator principal:
--         - the auth user has an email address that has been confirmed (operators sign up by
--           email or OAuth; production requires verified email, see supabase/config.toml), and
--         - is not an anonymous user, and
--         - is not tagged `app_metadata.principal = 'citizen'`. `raw_app_meta_data` is writable
--           only by the service role, so a user cannot remove the tag from their own account.
--           Nothing writes the tag yet; the citizen sign-up flow will (bridge Phase 2), and this
--           check means a citizen who later adds and confirms an email still cannot join a centre.
--       A phone-only account has no email and is refused on the first rule alone.
--
--       create_organization inserts the organization and then the owner membership in one
--       transaction, so the exception from this trigger rolls the organization back too.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F1  Storage read: the roles that may read document rows, not every member
-- -----------------------------------------------------------------------------
drop policy if exists "assistigo documents read" on storage.objects;

create policy "assistigo documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('customer-documents', 'prepared-files')
    and public.has_org_role(
      public.org_id_from_storage_path(name),
      array['owner', 'manager', 'operator', 'viewer']
    )
  );

comment on policy "assistigo documents read" on storage.objects is
  'Same roles as documents_select / document_derivatives_select / document_drop_files_select. billing_admin is excluded (spec §18.3; 0037 F1).';

-- -----------------------------------------------------------------------------
-- F2  Only operator principals may hold an active membership
-- -----------------------------------------------------------------------------
create or replace function public.is_operator_principal(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.email is not null
      and btrim(u.email) <> ''
      and u.email_confirmed_at is not null
      and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data ->> 'principal', 'operator') <> 'citizen'
  );
$$;

comment on function public.is_operator_principal(uuid) is
  'True when this auth user may work inside a centre: confirmed email, not anonymous, not tagged app_metadata.principal = citizen (0037 F2). Not granted to any client role.';

-- Used only by the trigger below. Granting it would turn it into an oracle about other users.
revoke execute on function public.is_operator_principal(uuid) from public;

create or replace function public.guard_operator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and not public.is_operator_principal(new.user_id) then
    raise exception 'ASSISTIGO_NOT_OPERATOR_PRINCIPAL: this account cannot join a centre'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_operator_membership() from public;

-- Insert covers create_organization, accept_invitation (its ON CONFLICT path fires the BEFORE
-- INSERT trigger first) and service-role inserts/upserts. Update covers reactivating a suspended
-- or removed membership and re-pointing a row at a different user.
create trigger organization_members_operator_principal
  before insert or update of user_id, status on public.organization_members
  for each row execute function public.guard_operator_membership();
