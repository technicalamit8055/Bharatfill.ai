-- =============================================================================
-- 0038  Citizen Vault (Phase 2): citizen accounts, synced documents, consent-gated operator access
-- docs/VAULT_BRIDGE_DESIGN.md §2, §5; CITIZEN_MOBILE_APP_SPEC.md §6 Phase 2; DPDP Act 2023
--
-- The citizen app (apps/mobile) signs in by phone OTP into this same Supabase project. These
-- tables hold that citizen's account, their synced (encrypted) documents, and the consent
-- machinery that lets ONE operator at ONE centre read them for at most two hours.
--
-- Shape rules, each deliberate:
--
--   1. No operator policy on any table here. A centre reads a citizen's documents only through
--      the server file route (apps/web/lib/vault/), which checks the grant, writes a
--      vault_access_events row and only then streams bytes. A SELECT policy could not write that
--      row, and "every access is logged and the citizen sees it" is the promise of this feature.
--      Contrast 0024 roaming, which extends existing tenant tables with a grant clause.
--
--   2. Citizens read their own rows and write nothing directly. Every write goes through a
--      citizen route (apps/web/lib/citizen/) holding the service role after it has verified a
--      citizen JWT — so a client can never mint a grant, approve on someone else's behalf, or
--      edit its own access history.
--
--   3. Secrets live in tables with RLS on and no policy at all: the wrapped document key and
--      the Vault PIN HMAC (citizen_vault_keys), and the one-time share codes
--      (vault_access_challenges). Same reasoning as customer_access_challenges in 0024.
--
--   4. Time boxes are CHECK constraints, not application promises: a grant cannot outlast
--      two hours, a share code cannot outlast fifteen minutes.
--
--   5. Access history survives account deletion with the citizen link removed (design D13):
--      vault_access_events and citizen_consent_records use ON DELETE SET NULL.
--
-- Identity: every phone sign-up is tagged app_metadata.principal = 'citizen' by a trigger on
-- auth.users, and 0037 already refuses a centre membership to such an account.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity: tag phone sign-ups as citizens
-- -----------------------------------------------------------------------------
create or replace function public.tag_citizen_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is not null and btrim(new.phone) <> ''
     and (new.email is null or btrim(new.email) = '') then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('principal', 'citizen');
  end if;
  return new;
end;
$$;

revoke execute on function public.tag_citizen_principal() from public;

create trigger tag_citizen_principal
  before insert on auth.users
  for each row execute function public.tag_citizen_principal();

-- A citizen is an account tagged citizen, or a phone-only account (belt and braces in case the
-- tag is ever lost from app_metadata). The mirror image of 0037's is_operator_principal().
create or replace function public.is_citizen_principal(p_user_id uuid)
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
      and (
        coalesce(u.raw_app_meta_data ->> 'principal', '') = 'citizen'
        or (u.phone is not null and btrim(u.phone) <> ''
            and (u.email is null or btrim(u.email) = ''))
      )
  );
$$;

revoke execute on function public.is_citizen_principal(uuid) from public;
grant execute on function public.is_citizen_principal(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- citizen_accounts — one row per signed-up citizen; id IS the auth user id
-- -----------------------------------------------------------------------------
create table public.citizen_accounts (
  id                  uuid primary key references auth.users (id) on delete cascade,
  -- Name as on their documents, shown to a centre so the operator knows they opened the right
  -- vault. The only profile field kept (design D10).
  display_name        text not null check (char_length(btrim(display_name)) between 1 and 160),
  preferred_locale    text not null default 'hi' check (preferred_locale in ('en', 'hi')),
  -- The citizen may stop syncing; documents already uploaded stay until deleted.
  cloud_enabled       boolean not null default true,
  last_active_at      timestamptz not null default now(),
  -- Set while a new phone waits out the 7-day restore hold (design §3.3).
  restore_hold_until  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.citizen_accounts is
  'A citizen of the mobile vault app. id = auth.users.id. Readable by that citizen only; written only by citizen routes holding the service role (0038 note 2).';

create trigger citizen_accounts_updated_at
  before update on public.citizen_accounts
  for each row execute function public.set_updated_at();

-- Never a citizen account for an operator: a server bug must not be able to fuse the two.
create or replace function public.guard_citizen_account_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_citizen_principal(new.id) then
    raise exception 'ASSISTIGO_NOT_CITIZEN_PRINCIPAL: only a citizen sign-in can own a vault'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_citizen_account_principal() from public;

create trigger citizen_accounts_principal
  before insert on public.citizen_accounts
  for each row execute function public.guard_citizen_account_principal();

-- -----------------------------------------------------------------------------
-- citizen_vault_keys — the citizen's wrapped document key and Vault PIN check. No policy.
-- -----------------------------------------------------------------------------
create table public.citizen_vault_keys (
  citizen_id        uuid primary key references public.citizen_accounts (id) on delete cascade,
  -- AES-256 document key, wrapped with VAULT_MASTER_KEY in the packages/core crypto `v1.` format,
  -- AAD `<citizen_id>:vault_key`. Deleting this row makes every synced byte unreadable at once.
  wrapped_key       text not null check (wrapped_key like 'v1.%'),
  key_version       smallint not null default 1 check (key_version >= 1),
  -- HMAC-SHA256 of the 4-digit Vault PIN under a key derived from VAULT_MASTER_KEY; bound to
  -- the citizen id, so equal PINs never produce equal values.
  pin_hmac          text not null check (pin_hmac ~ '^[0-9a-f]{64}$'),
  pin_failures      smallint not null default 0 check (pin_failures >= 0),
  -- Lifetime wrong PINs; at 10 the PIN path is off for good (VAULT_PIN_MAX_TOTAL_FAILURES).
  pin_failures_total smallint not null default 0 check (pin_failures_total >= 0),
  pin_locked_until  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.citizen_vault_keys is
  'Wrapped per-citizen document key and Vault PIN HMAC. RLS on, no policy for any role but service_role (0038 note 3).';

create trigger citizen_vault_keys_updated_at
  before update on public.citizen_vault_keys
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- citizen_devices — phones that hold the document key (restore and, in Phase 3, push)
-- -----------------------------------------------------------------------------
create table public.citizen_devices (
  id              uuid primary key default gen_random_uuid(),
  citizen_id      uuid not null references public.citizen_accounts (id) on delete cascade,
  platform        text not null check (platform in ('android', 'ios')),
  -- Coarse model class for "Is this you, on a new phone?" — never an IMEI or serial.
  label           text check (label is null or char_length(label) <= 60),
  -- How this device obtained the key: first sign-up, PIN, old-phone approval or the hold.
  key_issued_via  text not null check (key_issued_via in ('signup', 'pin', 'device_approval', 'hold')),
  key_issued_at   timestamptz not null default now(),
  push_token      text check (push_token is null or char_length(push_token) <= 255),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index citizen_devices_citizen_idx on public.citizen_devices (citizen_id, last_seen_at desc);

-- -----------------------------------------------------------------------------
-- citizen_vault_documents — metadata for each synced document; bytes in bucket citizen-vault
-- -----------------------------------------------------------------------------
create table public.citizen_vault_documents (
  id            uuid primary key default gen_random_uuid(),
  citizen_id    uuid not null references public.citizen_accounts (id) on delete cascade,
  -- @assistigo/core DocumentType; category is the vault section (CITIZEN_VAULT_CATEGORIES).
  document_type text not null check (document_type ~ '^[a-z0-9_]{1,50}$'),
  category      text not null check (category in ('identity', 'academic', 'certificate', 'form_asset', 'other')),
  -- The citizen's own name for it. Shown to a centre under a grant; never logged.
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  -- citizen/<citizen_id>/<id>. The object is AES-256-GCM ciphertext made on the phone.
  storage_path  text not null unique,
  -- Type of the plaintext the phone encrypted, not of the stored object.
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  page_count    smallint not null default 1 check (page_count between 1 and 50),
  -- SHA-256 of the stored ciphertext, checked by the server when the upload is confirmed.
  sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status        text not null default 'pending' check (status in ('pending', 'ready')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint citizen_vault_documents_path_is_own
    check (storage_path = 'citizen/' || citizen_id::text || '/' || id::text)
);

create index citizen_vault_documents_citizen_idx
  on public.citizen_vault_documents (citizen_id, created_at desc) where deleted_at is null;
create index citizen_vault_documents_deleted_idx
  on public.citizen_vault_documents (deleted_at) where deleted_at is not null;

create trigger citizen_vault_documents_updated_at
  before update on public.citizen_vault_documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- citizen_consent_records — versioned consent, kept (unlinked) after account deletion
-- -----------------------------------------------------------------------------
create table public.citizen_consent_records (
  id            uuid primary key default gen_random_uuid(),
  citizen_id    uuid references public.citizen_accounts (id) on delete set null,
  subject       text not null check (subject in ('terms', 'cloud_sync', 'centre_copy', 'named_centre')),
  text_version  text not null check (char_length(text_version) between 1 and 40),
  status        text not null default 'granted' check (status in ('granted', 'withdrawn')),
  -- For centre_copy: which grant the citizen allowed a copy under.
  grant_id      uuid,
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  created_at    timestamptz not null default now(),

  constraint citizen_consent_withdrawn_has_timestamp
    check (status <> 'withdrawn' or withdrawn_at is not null)
);

create index citizen_consent_records_citizen_idx
  on public.citizen_consent_records (citizen_id, subject, granted_at desc);

-- -----------------------------------------------------------------------------
-- vault_access_grants — one operator, one centre, ≤ 2 hours
-- -----------------------------------------------------------------------------
create table public.vault_access_grants (
  id                  uuid primary key default gen_random_uuid(),
  citizen_id          uuid not null references public.citizen_accounts (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  -- Snapshot shown in the citizen's history even if the centre is renamed or removed.
  centre_name         text not null check (char_length(centre_name) between 1 and 200),
  granted_to_user_id  uuid not null references auth.users (id) on delete cascade,
  method              text not null check (method in ('approval', 'code', 'named_centre')),
  allow_copy          boolean not null default false,
  granted_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  ended_at            timestamptz,
  ended_by            text check (ended_by is null or ended_by in ('operator', 'citizen', 'system')),
  -- Set when the one "<centre> opened your documents" notice for this grant was queued.
  opened_notified_at  timestamptz,
  created_at          timestamptz not null default now(),

  constraint vault_access_grants_is_time_boxed
    check (expires_at > granted_at and expires_at <= granted_at + interval '2 hours'),
  constraint vault_access_grants_end_has_actor
    check ((ended_at is null) = (ended_by is null))
);

comment on table public.vault_access_grants is
  'A consent window: one operator user at one centre may read one citizen''s synced documents until expires_at (≤ 2 h) or until ended. Minted only by the server after an approval or a share code.';

create index vault_access_grants_live_idx
  on public.vault_access_grants (granted_to_user_id, citizen_id, expires_at)
  where ended_at is null;
create index vault_access_grants_citizen_idx
  on public.vault_access_grants (citizen_id, granted_at desc);
create index vault_access_grants_org_idx
  on public.vault_access_grants (organization_id, granted_at desc);

alter table public.citizen_consent_records
  add constraint citizen_consent_records_grant_fk
  foreign key (grant_id) references public.vault_access_grants (id) on delete set null;

-- -----------------------------------------------------------------------------
-- vault_access_requests — "Sharma Cyber Cafe wants to see your documents" (Approve path)
--
-- Written for EVERY lookup, including numbers with no vault (citizen_id null), so the operator's
-- view of a request is identical either way and the rows double as the lookup rate-limit ledger.
-- mobile_hmac is the number under a server-derived key: per-number limits without storing the
-- plaintext number of someone who never signed up.
-- -----------------------------------------------------------------------------
create table public.vault_access_requests (
  id                uuid primary key default gen_random_uuid(),
  citizen_id        uuid references public.citizen_accounts (id) on delete cascade,
  mobile_hmac       text not null check (mobile_hmac ~ '^[0-9a-f]{64}$'),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  centre_name       text not null check (char_length(centre_name) between 1 and 200),
  requested_by      uuid not null references auth.users (id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'denied', 'expired')),
  -- Chosen by the citizen when approving (30 or 120); the operator never sets it.
  duration_minutes  smallint check (duration_minutes is null or duration_minutes in (30, 120)),
  allow_copy        boolean not null default false,
  grant_id          uuid references public.vault_access_grants (id) on delete set null,
  expires_at        timestamptz not null default (now() + interval '10 minutes'),
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),

  constraint vault_access_requests_is_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index vault_access_requests_citizen_idx
  on public.vault_access_requests (citizen_id, created_at desc) where citizen_id is not null;
create index vault_access_requests_requester_idx
  on public.vault_access_requests (requested_by, created_at desc);
create index vault_access_requests_org_idx
  on public.vault_access_requests (organization_id, created_at desc);
create index vault_access_requests_mobile_idx
  on public.vault_access_requests (mobile_hmac, created_at desc);

-- -----------------------------------------------------------------------------
-- vault_access_challenges — the 6-digit share code. No policy.
-- -----------------------------------------------------------------------------
create table public.vault_access_challenges (
  id                uuid primary key default gen_random_uuid(),
  citizen_id        uuid not null references public.citizen_accounts (id) on delete cascade,
  code_salt         text not null check (length(code_salt) between 16 and 128),
  code_hmac         text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  attempts_left     smallint not null default 3 check (attempts_left >= 0),
  duration_minutes  smallint not null default 120 check (duration_minutes in (30, 120)),
  allow_copy        boolean not null default false,
  expires_at        timestamptz not null default (now() + interval '5 minutes'),
  consumed_at       timestamptz,
  created_at        timestamptz not null default now(),

  constraint vault_access_challenges_is_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

comment on table public.vault_access_challenges is
  'An outstanding share code. RLS on, no policy: whoever can read the HMAC can brute-force six digits offline and open the vault without the citizen (0038 note 3).';

create index vault_access_challenges_open_idx
  on public.vault_access_challenges (citizen_id, created_at desc) where consumed_at is null;

-- -----------------------------------------------------------------------------
-- vault_unlock_attempts — wrong-code ledger for the per-centre and per-number caps. No policy.
-- -----------------------------------------------------------------------------
create table public.vault_unlock_attempts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  attempted_by     uuid references auth.users (id) on delete set null,
  mobile_hmac      text not null check (mobile_hmac ~ '^[0-9a-f]{64}$'),
  succeeded        boolean not null,
  created_at       timestamptz not null default now()
);

create index vault_unlock_attempts_org_idx
  on public.vault_unlock_attempts (organization_id, created_at desc) where not succeeded;
create index vault_unlock_attempts_mobile_idx
  on public.vault_unlock_attempts (mobile_hmac, created_at desc) where not succeeded;

-- -----------------------------------------------------------------------------
-- vault_access_events — what the citizen sees in "Who opened my documents". Insert-only.
-- -----------------------------------------------------------------------------
create table public.vault_access_events (
  id               uuid primary key default gen_random_uuid(),
  grant_id         uuid references public.vault_access_grants (id) on delete set null,
  citizen_id       uuid references public.citizen_accounts (id) on delete set null,
  organization_id  uuid references public.organizations (id) on delete set null,
  centre_name      text,
  operator_id      uuid references auth.users (id) on delete set null,
  document_id      uuid references public.citizen_vault_documents (id) on delete set null,
  -- Kept after the document or account is gone (design D13); never the title.
  document_type    text check (document_type is null or document_type ~ '^[a-z0-9_]{1,50}$'),
  action           text not null check (action in (
                     'granted', 'listed', 'viewed', 'attached', 'copied', 'ended',
                     'restored', 'restore_refused')),
  created_at       timestamptz not null default now()
);

comment on table public.vault_access_events is
  'Every grant, document access and restore, per document. Insert-only for the service role; the citizen reads their own. Survives deletion with links nulled (0038 note 5).';

create index vault_access_events_citizen_idx
  on public.vault_access_events (citizen_id, created_at desc);
create index vault_access_events_grant_idx
  on public.vault_access_events (grant_id);
create index vault_access_events_org_idx
  on public.vault_access_events (organization_id, created_at desc);

-- Insert-only even for the service role: history is not editable by application code.
create or replace function public.reject_vault_event_change()
returns trigger
language plpgsql
as $$
begin
  -- The only permitted update is the FK cascade nulling a link when its parent is deleted.
  if tg_op = 'UPDATE'
     and new.id = old.id and new.action = old.action and new.created_at = old.created_at
     and new.document_type is not distinct from old.document_type
     and new.centre_name is not distinct from old.centre_name
     and (new.grant_id is null or new.grant_id = old.grant_id)
     and (new.citizen_id is null or new.citizen_id = old.citizen_id)
     and (new.organization_id is null or new.organization_id = old.organization_id)
     and (new.operator_id is null or new.operator_id = old.operator_id)
     and (new.document_id is null or new.document_id = old.document_id) then
    return new;
  end if;
  if tg_op = 'DELETE' and current_setting('assistigo.retention_sweep', true) = 'on' then
    return old;
  end if;
  raise exception 'ASSISTIGO_VAULT_EVENTS_APPEND_ONLY' using errcode = 'insufficient_privilege';
end;
$$;

create trigger vault_access_events_append_only
  before update or delete on public.vault_access_events
  for each row execute function public.reject_vault_event_change();

-- -----------------------------------------------------------------------------
-- Lookup by mobile — service role only (raw auth.users access)
-- -----------------------------------------------------------------------------
create or replace function public.citizen_id_for_mobile(p_mobile text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.citizen_accounts c
  join auth.users u on u.id = c.id
  where p_mobile ~ '^[6-9][0-9]{9}$'
    and u.phone = '91' || p_mobile
  limit 1;
$$;

revoke execute on function public.citizen_id_for_mobile(text) from public;
grant execute on function public.citizen_id_for_mobile(text) to service_role;

-- -----------------------------------------------------------------------------
-- create_citizen_account — sign-up in one transaction. Service role only.
--
-- The caller (apps/web/lib/citizen/account.ts) has verified the citizen JWT and wrapped a fresh
-- document key and the PIN HMAC with VAULT_MASTER_KEY, which the database never sees. Account,
-- key, first device and consent appear together or not at all.
-- -----------------------------------------------------------------------------
create or replace function public.create_citizen_account(
  p_citizen_id      uuid,
  p_display_name    text,
  p_locale          text,
  p_cloud_enabled   boolean,
  p_wrapped_key     text,
  p_pin_hmac        text,
  p_platform        text,
  p_device_label    text,
  p_terms_version   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  device_id uuid;
begin
  insert into public.citizen_accounts (id, display_name, preferred_locale, cloud_enabled)
  values (p_citizen_id, btrim(p_display_name), p_locale, p_cloud_enabled);

  insert into public.citizen_vault_keys (citizen_id, wrapped_key, pin_hmac)
  values (p_citizen_id, p_wrapped_key, p_pin_hmac);

  insert into public.citizen_devices (citizen_id, platform, label, key_issued_via)
  values (p_citizen_id, p_platform, nullif(btrim(coalesce(p_device_label, '')), ''), 'signup')
  returning id into device_id;

  insert into public.citizen_consent_records (citizen_id, subject, text_version)
  values (p_citizen_id, 'terms', p_terms_version);

  if p_cloud_enabled then
    insert into public.citizen_consent_records (citizen_id, subject, text_version)
    values (p_citizen_id, 'cloud_sync', p_terms_version);
  end if;

  return device_id;
end;
$$;

revoke execute on function public.create_citizen_account(uuid, text, text, boolean, text, text, text, text, text) from public;
grant execute on function public.create_citizen_account(uuid, text, text, boolean, text, text, text, text, text) to service_role;

-- =============================================================================
-- Row Level Security — citizens read their own rows; nobody else reads anything (note 1, 2)
-- =============================================================================
alter table public.citizen_accounts         enable row level security;
alter table public.citizen_vault_keys       enable row level security;
alter table public.citizen_devices          enable row level security;
alter table public.citizen_vault_documents  enable row level security;
alter table public.citizen_consent_records  enable row level security;
alter table public.vault_access_grants      enable row level security;
alter table public.vault_access_requests    enable row level security;
alter table public.vault_access_challenges  enable row level security;
alter table public.vault_unlock_attempts    enable row level security;
alter table public.vault_access_events      enable row level security;

create policy citizen_accounts_select_own on public.citizen_accounts
  for select to authenticated using (id = (select auth.uid()));

create policy citizen_devices_select_own on public.citizen_devices
  for select to authenticated using (citizen_id = (select auth.uid()));

create policy citizen_vault_documents_select_own on public.citizen_vault_documents
  for select to authenticated
  using (citizen_id = (select auth.uid()) and deleted_at is null);

create policy citizen_consent_records_select_own on public.citizen_consent_records
  for select to authenticated using (citizen_id = (select auth.uid()));

create policy vault_access_grants_select_own on public.vault_access_grants
  for select to authenticated using (citizen_id = (select auth.uid()));

-- Also what Realtime delivers to the citizen's phone while the app is open (Approve card).
create policy vault_access_requests_select_own on public.vault_access_requests
  for select to authenticated using (citizen_id = (select auth.uid()));

create policy vault_access_events_select_own on public.vault_access_events
  for select to authenticated using (citizen_id = (select auth.uid()));

-- citizen_vault_keys, vault_access_challenges, vault_unlock_attempts: no policy, by design.

alter publication supabase_realtime add table public.vault_access_requests;

-- =============================================================================
-- Storage — bucket citizen-vault: private, ciphertext only, no policy for authenticated.
-- Uploads use server-minted signed upload URLs; reads go through the server file route.
-- Deliberately NOT added to the 0010 / 0024 / 0025 / 0037 customer-documents policies.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('citizen-vault', 'citizen-vault', false, 15729664, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
