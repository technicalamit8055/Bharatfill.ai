-- =============================================================================
-- 0042  Trusted centres — 30-day roaming access the citizen chooses in the BharatDoc app
-- docs/VAULT_BRIDGE_DESIGN.md D2 (named centres), §7 (limits), §14; migrations 0024, 0039
--
-- A regular customer should not have to approve every visit to the cafe they always use. In the
-- app's approval sheet the citizen may now pick "30 days" beside 1, 2 and 4 hours, or turn a
-- live session into one from the app's Centre access screen. The grant is still the same
-- `customer_access_grants` row, for the one operator who asked, at the centre that asked.
--
-- What keeps it safe:
--
--   1. Only `auth_method = 'app_trusted'` may run past 12 hours, and never past 30 days. Every
--      other grant keeps the 0024 ceiling unchanged. Only the citizen's approve / trust routes
--      write that method (service role); an OTP read across a counter can never mint it.
--
--   2. At most three live trusted grants per citizen, checked by the server when minting
--      (a citizen is matched to customer rows by verified mobile, which a check constraint
--      cannot see).
--
--   3. The citizen sees every live grant in the app and can Stop any of them at once; the
--      operator can still end it from the dashboard or extension. Policies compare against
--      now(), so expiry needs no sweep.
--
-- Design D2 said 90 days with owner MFA (D15). The platform has no MFA yet, so the window is
-- 30 days and covers one operator, not the whole centre. Revisit both when MFA lands.
-- =============================================================================

alter table public.customer_access_grants
  drop constraint if exists customer_access_grants_auth_method_check;
alter table public.customer_access_grants
  add constraint customer_access_grants_auth_method_check
  check (auth_method in ('otp', 'qr_consent', 'biometric', 'app_approval', 'app_trusted'));

alter table public.customer_access_grants
  drop constraint if exists customer_access_grants_is_time_boxed;
alter table public.customer_access_grants
  add constraint customer_access_grants_is_time_boxed
  check (
    expires_at > granted_at
    and (
      expires_at <= granted_at + interval '12 hours'
      or (auth_method = 'app_trusted' and expires_at <= granted_at + interval '30 days')
    )
  );

comment on column public.customer_access_grants.expires_at is
  'Hard ceiling of 12 hours from granted_at, or 30 days for an app_trusted grant (0042). Policies compare against now(), so access ends on the clock whether or not the sweep has run.';

-- 30 days in minutes does not fit a smallint.
alter table public.customer_access_requests
  alter column duration_minutes type integer;
alter table public.customer_access_requests
  drop constraint if exists customer_access_requests_duration_minutes_check;
alter table public.customer_access_requests
  add constraint customer_access_requests_duration_minutes_check
  check (duration_minutes is null or duration_minutes in (60, 120, 240, 43200));

-- The citizen's Centre access screen finds their customer rows by verified mobile across every
-- centre; the existing index leads with organization_id.
create index if not exists customers_mobile_normalized_live_idx
  on public.customers (mobile_normalized) where deleted_at is null;

-- Counting a citizen's live trusted grants.
create index if not exists customer_access_grants_trusted_idx
  on public.customer_access_grants (customer_id, expires_at)
  where auth_method = 'app_trusted' and status = 'active' and revoked_at is null;
