-- =============================================================================
-- 0039  Roaming consent by approval in the BharatDoc app
-- Master spec §19.2 (consent), §19.9 (time-boxed access); migrations 0024, 0038;
-- docs/VAULT_BRIDGE_DESIGN.md §4.2 (the same "Approve" shape, for the vault)
--
-- A second way for a roaming citizen to say yes. Instead of reading an OTP off their phone, the
-- operator sends a request to the citizen's BharatDoc app; the citizen sees which centre is
-- asking and why, picks how long (1, 2 or 4 hours) and taps Approve or Deny. Approve mints the
-- same `customer_access_grants` row the OTP path mints, with auth_method 'app_approval'.
--
-- Three properties shape the table below.
--
--   1. The citizen chooses the window, not the operator. `duration_minutes` is null until the
--      citizen decides and is written only by the approve route, from the citizen's own choice.
--
--   2. The request reaches a phone only when the citizen account's verified sign-in number is
--      the customer's mobile — the same trust as an OTP sent to that number. `citizen_id` is
--      resolved by the server at request time (citizen_id_for_mobile, 0038) and null otherwise;
--      the operator's view is identical either way, so a request never confirms whether a
--      person uses the app.
--
--   3. Writes are service role only. Citizens may read their own rows (for a live card later via
--      Realtime); operators read nothing directly — the server answers their status polls.
-- =============================================================================

-- A grant may now be proved by an in-app approval.
alter table public.customer_access_grants
  drop constraint if exists customer_access_grants_auth_method_check;
alter table public.customer_access_grants
  add constraint customer_access_grants_auth_method_check
  check (auth_method in ('otp', 'qr_consent', 'biometric', 'app_approval'));

create table public.customer_access_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  -- The visiting centre and the operator who asked. Grants are minted for exactly this pair.
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  centre_name        text not null check (char_length(centre_name) between 1 and 200),
  requested_by       uuid not null references auth.users (id) on delete cascade,
  -- Null when no BharatDoc account signed in with the customer's mobile (property 2).
  citizen_id         uuid references public.citizen_accounts (id) on delete cascade,

  purpose            text not null default 'form_filling'
                       check (purpose in ('form_filling', 'scheme_application',
                                          'profile_update', 'document_access')),
  target_scheme_slug text check (target_scheme_slug is null
                                 or target_scheme_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'denied', 'expired')),
  -- Chosen by the citizen when approving (property 1).
  duration_minutes   smallint check (duration_minutes is null or duration_minutes in (60, 120, 240)),
  grant_id           uuid references public.customer_access_grants (id) on delete set null,

  expires_at         timestamptz not null default (now() + interval '10 minutes'),
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),

  constraint customer_access_requests_is_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint customer_access_requests_approved_has_duration
    check (status <> 'approved' or duration_minutes is not null)
);

comment on table public.customer_access_requests is
  'An operator''s request for a roaming citizen''s consent, answered in the BharatDoc app. The citizen picks the duration. Written only by the service role (0039 note 3).';

create index customer_access_requests_citizen_idx
  on public.customer_access_requests (citizen_id, created_at desc) where citizen_id is not null;
create index customer_access_requests_requester_idx
  on public.customer_access_requests (requested_by, customer_id, created_at desc);
create index customer_access_requests_customer_idx
  on public.customer_access_requests (customer_id, created_at desc);

alter table public.customer_access_requests enable row level security;

create policy customer_access_requests_select_own on public.customer_access_requests
  for select to authenticated using (citizen_id = (select auth.uid()));

alter publication supabase_realtime add table public.customer_access_requests;
