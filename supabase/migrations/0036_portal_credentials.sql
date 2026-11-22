-- =============================================================================
-- 0036  Customer portal credential vault
-- Master spec §19.7a (product decision, 2026-11-07); docs/SECURITY.md § Portal credential vault
--
-- Exam and citizen portals (SSC, UPSC, UPPSC, BPSC OTR, Rajasthan SSO, Haryana PPP) key a
-- candidate to one permanent registration. Candidates forget the ID and password, and the
-- "forgot password" OTP goes to a number they no longer have. This table keeps those logins on
-- the customer's profile so the operator can log in again, and the extension can type them into
-- an allow-listed portal page on the operator's click (it never submits, and the operator still
-- solves the CAPTCHA).
--
-- What is secret and how it is kept:
--   - login_id_encrypted, password_encrypted, security_answer_encrypted are AES-256-GCM
--     ciphertext written by packages/core/src/privacy/crypto.ts, never plaintext. The GCM AAD is
--     `<organization_id>:<customer_id>:<credential id>:portal_credential:<part>`, so a ciphertext
--     cannot be moved to another row, customer or column and still decrypt.
--   - login_id_hint is the masked last three characters, for telling two rows apart in a list.
--   - security_question and linked_applications are kept in clear: the question is not the
--     secret, and an application/roll number on its own does not open an account.
--
-- Who can reach it:
--   - owner, manager and operator of the customer's own organization.
--   - NOT a viewer, NOT a billing admin, NOT platform staff under a support access grant, and NOT
--     a roaming operator from another centre: none of those policies is extended here, on
--     purpose. A citizen's government-account password is not part of "customer records" support.
--   - Deleting a row: owner, manager or operator, so a wrong entry can be removed at the counter.
--
-- Rows go with the customer (on delete cascade), like every other customer-owned row.
-- =============================================================================

create table public.customer_portal_credentials (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  customer_id                uuid not null references public.customers (id) on delete cascade,

  -- Mirrors PORTAL_KEYS in packages/core/src/portal-credentials/portals.ts.
  portal_key                 text not null
                               check (portal_key in ('ssc', 'upsc', 'uppsc', 'bpsc',
                                                     'rajasthan_sso', 'haryana_ppp', 'other')),
  -- Free-text portal name, required for 'other' and absent otherwise.
  portal_label               text check (portal_label is null or length(btrim(portal_label)) between 1 and 80),

  login_id_encrypted         text not null check (login_id_encrypted like 'v1.%'),
  login_id_hint              text not null check (length(login_id_hint) <= 16),
  password_encrypted         text check (password_encrypted is null or password_encrypted like 'v1.%'),
  security_question          text check (security_question is null or length(security_question) <= 200),
  security_answer_encrypted  text check (security_answer_encrypted is null or security_answer_encrypted like 'v1.%'),

  -- [{ "label": "CGL 2026", "number": "2201…" }, …] — at most 20, validated by the API.
  linked_applications        jsonb not null default '[]'::jsonb
                               check (jsonb_typeof(linked_applications) = 'array'
                                      and jsonb_array_length(linked_applications) <= 20),

  password_updated_at        timestamptz,
  last_used_at               timestamptz,

  created_by                 uuid references auth.users (id) on delete set null,
  updated_by                 uuid references auth.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint customer_portal_credentials_label_for_other
    check ((portal_key = 'other') = (portal_label is not null))
);

comment on table public.customer_portal_credentials is
  'Citizen portal logins (OTR / SSO). Secrets are AES-256-GCM ciphertext bound to the row; reveal, one-click login and slip are audited as critical. Spec §19.7a.';

-- One login per catalogued portal per customer. 'other' may repeat (different portals).
create unique index customer_portal_credentials_one_per_portal
  on public.customer_portal_credentials (organization_id, customer_id, portal_key)
  where portal_key <> 'other';

create index customer_portal_credentials_customer_idx
  on public.customer_portal_credentials (organization_id, customer_id);

create trigger customer_portal_credentials_set_updated_at
  before update on public.customer_portal_credentials
  for each row execute function public.set_updated_at();

-- A row can never be re-parented: the ciphertext AAD names the organization and customer, so a
-- moved row would stop decrypting anyway, but refusing the move keeps the failure loud.
create or replace function public.customer_portal_credentials_immutable_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.customer_id <> old.customer_id then
    raise exception 'customer_portal_credentials: organization_id and customer_id are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger customer_portal_credentials_immutable_owner
  before update on public.customer_portal_credentials
  for each row execute function public.customer_portal_credentials_immutable_owner();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.customer_portal_credentials enable row level security;

revoke all on table public.customer_portal_credentials from anon;

create policy customer_portal_credentials_select on public.customer_portal_credentials
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customer_portal_credentials_insert on public.customer_portal_credentials
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    -- The customer must belong to the same organization as the row.
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.organization_id = customer_portal_credentials.organization_id
    )
  );

create policy customer_portal_credentials_update on public.customer_portal_credentials
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customer_portal_credentials_delete on public.customer_portal_credentials
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));
