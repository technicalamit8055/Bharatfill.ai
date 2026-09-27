-- ==========================================================================
-- Assistigo / Bharatfill.ai Complete Database Schema (Migrations 0001 - 0026)
-- Run this in your Supabase Dashboard -> SQL Editor
-- ==========================================================================


-- ==========================================================================
-- Migration: 0001_extensions_and_helpers.sql
-- ==========================================================================

-- =============================================================================
-- 0001  Extensions and shared helpers
-- Master spec §18.1
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger that keeps updated_at honest regardless of what the client sends.';

-- -----------------------------------------------------------------------------
-- Text normalisation used by generated columns.
-- Marked immutable because generated columns require it; the logic is pure.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_mobile(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then null
    else right(regexp_replace(raw, '[^0-9]', '', 'g'), 10)
  end;
$$;

comment on function public.normalize_mobile(text) is
  'Last 10 digits of a mobile number so +91 / 0 / spaced variants all match one search key.';


-- ==========================================================================
-- Migration: 0002_organizations.sql
-- ==========================================================================

-- =============================================================================
-- 0002  Organizations, members, invitations, and the tenancy helper functions
-- Master spec §6.2, §18.2, §18.3
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 2 and 160),
  business_type     text not null default 'other'
                      check (business_type in (
                        'cyber_cafe', 'csc_vle', 'csp', 'digital_service_centre',
                        'recruitment_centre', 'other')),
  phone             text,
  email             text,
  city              text,
  district          text,
  state             text,
  preferred_locale  text not null default 'en' check (preferred_locale in ('en', 'hi')),
  monthly_forms_estimate text,

  -- Organization-level switches. Defaults are the privacy-preserving choice (§12.3, §19.3).
  settings          jsonb not null default jsonb_build_object(
                      'ai_processing_enabled', false,
                      'allow_full_aadhaar', false,
                      'retention', 'keep',
                      'overwrite_filled_fields', false
                    ),

  plan_code         text not null default 'free',
  customer_counter  bigint not null default 0,

  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on column public.organizations.settings is
  'allow_full_aadhaar must stay false. Flipping it requires a legal review (spec §11.2, §19.3).';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------
create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null
                     check (role in ('owner', 'manager', 'operator', 'viewer', 'billing_admin')),
  status           text not null default 'active'
                     check (status in ('active', 'invited', 'suspended')),
  invited_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id, status);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- An organization must always have at least one owner, otherwise nobody can manage billing
-- or delete the data — which would make the DPDP erasure obligation unmeetable.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners int;
  target_org uuid;
begin
  target_org := coalesce(old.organization_id, new.organization_id);

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  select count(*) into remaining_owners
  from public.organization_members
  where organization_id = target_org
    and role = 'owner'
    and status = 'active'
    and id <> old.id;

  if remaining_owners = 0 then
    raise exception 'ASSISTIGO_LAST_OWNER: an organization must keep at least one active owner'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function public.prevent_last_owner_removal();

-- -----------------------------------------------------------------------------
-- organization_invitations
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null,
  role             text not null
                     check (role in ('manager', 'operator', 'viewer', 'billing_admin')),
  token_hash       text not null unique,
  status           text not null default 'pending'
                     check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at       timestamptz not null default now() + interval '7 days',
  invited_by       uuid references auth.users (id) on delete set null,
  accepted_by      uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.organization_invitations.token_hash is
  'SHA-256 of the invite token. The raw token exists only in the emailed link (spec §19.4).';

comment on column public.organization_invitations.role is
  'Owner is deliberately not invitable — ownership transfer is a separate, audited action.';

create index organization_invitations_org_idx
  on public.organization_invitations (organization_id, status);
create index organization_invitations_email_idx
  on public.organization_invitations (lower(email), status);

create trigger organization_invitations_set_updated_at
  before update on public.organization_invitations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tenancy helpers
--
-- security definer so that policies on organization_members do not recurse into
-- themselves when they call these (spec §18.3, docs/DATABASE.md §3).
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

create or replace function public.current_org_role(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.has_org_role(uuid, text[]) from public;
revoke execute on function public.current_org_role(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.current_org_role(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Per-organization customer codes (C00001, C00002 …)
-- A counter column on organizations gives an atomic sequence per tenant; count(*) would race.
-- -----------------------------------------------------------------------------
create or replace function public.next_customer_code(org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  seq bigint;
begin
  update public.organizations
     set customer_counter = customer_counter + 1
   where id = org
  returning customer_counter into seq;

  if seq is null then
    raise exception 'ASSISTIGO_UNKNOWN_ORG: organization % does not exist', org;
  end if;

  return 'C' || lpad(seq::text, 5, '0');
end;
$$;


-- ==========================================================================
-- Migration: 0003_customers.sql
-- ==========================================================================

-- =============================================================================
-- 0003  Customers and field-level provenance
-- Master spec §11, §18.2
-- =============================================================================

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  customer_code      text not null,

  full_name          text not null check (length(btrim(full_name)) >= 2),
  full_name_hi       text,
  mobile             text,
  mobile_alt         text,
  email              text,
  date_of_birth      date,
  gender             text check (gender in ('male', 'female', 'transgender', 'other')),
  marital_status     text check (marital_status in ('single', 'married', 'widowed', 'divorced', 'separated')),
  category           text check (category in ('general', 'obc', 'sc', 'st', 'ews', 'other')),

  father_name        text,
  mother_name        text,
  spouse_name        text,
  guardian_name      text,

  -- { current: {...}, permanent: {...}, permanent_same_as_current: bool }
  address_json       jsonb not null default '{}'::jsonb,
  -- Masked / derived identity summary only. There is NO column for a full Aadhaar number
  -- anywhere in this schema, by design (spec §19.3).
  identity_summary_json jsonb not null default '{}'::jsonb,
  education_json     jsonb not null default '{}'::jsonb,
  certificates_json  jsonb not null default '{}'::jsonb,

  notes              text,
  verification_status text not null default 'unverified'
                       check (verification_status in (
                         'unverified', 'extracted', 'operator_verified',
                         'customer_confirmed', 'expired', 'rejected')),

  assigned_to        uuid references auth.users (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  mobile_normalized  text generated always as (public.normalize_mobile(mobile)) stored,

  -- Aadhaar is deliberately absent from the search vector: it must never be a search key
  -- (spec §19.3).
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(full_name, '') || ' ' ||
      coalesce(full_name_hi, '') || ' ' ||
      coalesce(customer_code, '') || ' ' ||
      coalesce(public.normalize_mobile(mobile), '') || ' ' ||
      coalesce(public.normalize_mobile(mobile_alt), '') || ' ' ||
      coalesce(father_name, '') || ' ' ||
      coalesce(address_json -> 'current' ->> 'village_town_city', '') || ' ' ||
      coalesce(address_json -> 'current' ->> 'district', '') || ' ' ||
      coalesce(address_json -> 'current' ->> 'state', '')
    )
  ) stored,

  unique (organization_id, customer_code)
);

comment on table public.customers is
  'Confirmed customer profile. Extracted-but-unreviewed values live in customer_field_values.';

create index customers_org_active_idx on public.customers (organization_id, deleted_at);
create index customers_search_idx on public.customers using gin (search_vector);
create index customers_mobile_idx on public.customers (organization_id, mobile_normalized);
create index customers_name_trgm_idx on public.customers using gin (full_name extensions.gin_trgm_ops);
create index customers_created_idx on public.customers (organization_id, created_at desc);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- Assign the per-organization customer code on insert.
create or replace function public.assign_customer_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    new.customer_code := public.next_customer_code(new.organization_id);
  end if;
  return new;
end;
$$;

create trigger customers_assign_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

-- Guard rail: refuse to store anything that looks like a full Aadhaar number in the
-- identity summary. Belt and braces alongside the application-level checks (spec §19.3).
create or replace function public.reject_full_aadhaar()
returns trigger
language plpgsql
as $$
declare
  summary text := coalesce(new.identity_summary_json::text, '');
begin
  if summary ~ '"aadhaar"\s*:\s*"[0-9]{12}"'
     or summary ~ '"aadhaar_number"'
     or summary ~ '"aadhaar_full"' then
    raise exception
      'ASSISTIGO_FULL_AADHAAR_FORBIDDEN: only aadhaar_last4 may be stored (spec 19.3)'
      using errcode = 'check_violation';
  end if;

  if (new.identity_summary_json ->> 'aadhaar_last4') is not null
     and (new.identity_summary_json ->> 'aadhaar_last4') !~ '^[0-9]{4}$' then
    raise exception 'ASSISTIGO_INVALID_AADHAAR_LAST4: expected exactly four digits'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger customers_reject_full_aadhaar
  before insert or update on public.customers
  for each row execute function public.reject_full_aadhaar();

-- -----------------------------------------------------------------------------
-- customer_field_values — provenance, confidence and encrypted values
-- -----------------------------------------------------------------------------
create table public.customer_field_values (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  customer_id         uuid not null references public.customers (id) on delete cascade,
  field_key           text not null check (field_key like 'customer.%'),

  value_text          text,
  -- AES-256-GCM payload written by packages/core/src/privacy/crypto.ts. Never plaintext.
  value_encrypted     text,
  value_json          jsonb,
  -- Masked form safe to render in a list without a reveal action.
  display_value       text,

  source_document_id  uuid,
  confidence          numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status              text not null default 'extracted'
                        check (status in ('extracted', 'operator_verified',
                                          'customer_confirmed', 'rejected', 'expired')),

  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (organization_id, customer_id, field_key),
  constraint customer_field_values_encrypted_shape
    check (value_encrypted is null or value_encrypted like 'v1.%')
);

comment on table public.customer_field_values is
  'Field-level provenance. An extracted value stays here until a human accepts it (spec §9.3).';

create index customer_field_values_customer_idx
  on public.customer_field_values (organization_id, customer_id);
create index customer_field_values_status_idx
  on public.customer_field_values (organization_id, status);

create trigger customer_field_values_set_updated_at
  before update on public.customer_field_values
  for each row execute function public.set_updated_at();


-- ==========================================================================
-- Migration: 0004_documents.sql
-- ==========================================================================

-- =============================================================================
-- 0004  Documents, extractions, prepared derivatives, requirement presets
-- Master spec §12, §13, §18.2
-- =============================================================================

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  customer_id        uuid references public.customers (id) on delete set null,
  application_id     uuid,

  original_filename  text not null,
  storage_bucket     text not null default 'customer-documents',
  storage_path       text not null,
  mime_type          text not null
                       check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes         bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  sha256             text,

  document_type      text not null default 'unknown'
                       check (document_type in (
                         'aadhaar_like', 'pan', 'voter_id', 'marksheet_10', 'marksheet_12',
                         'caste_certificate', 'income_certificate', 'residence_certificate',
                         'photo', 'signature', 'receipt', 'application_pdf', 'generic', 'unknown')),
  status             text not null default 'uploaded'
                       check (status in ('uploaded', 'processing', 'extracted',
                                         'review_required', 'verified', 'failed', 'deleted')),
  is_sensitive       boolean not null default true,
  expires_at         date,
  label              text,

  uploaded_by        uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  unique (organization_id, storage_bucket, storage_path)
);

create index documents_customer_idx on public.documents (organization_id, customer_id);
create index documents_status_idx on public.documents (organization_id, status);
create index documents_application_idx on public.documents (organization_id, application_id);
create index documents_expiry_idx on public.documents (organization_id, expires_at)
  where expires_at is not null;

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Storage paths are org-scoped so a leaked path cannot address another tenant's object.
alter table public.documents
  add constraint documents_path_is_org_scoped
  check (storage_path like ('org/' || organization_id::text || '/%'));

-- -----------------------------------------------------------------------------
-- document_extractions
-- -----------------------------------------------------------------------------
create table public.document_extractions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  document_id       uuid not null references public.documents (id) on delete cascade,

  provider          text not null,
  provider_request_id text,
  document_type     text not null default 'unknown',
  -- Kept only while the extraction is unreviewed, then truncated to matched snippets
  -- by the retention job (docs/AI_PIPELINE.md §7).
  raw_text          text,
  extracted_fields  jsonb not null default '[]'::jsonb,
  warnings          jsonb not null default '[]'::jsonb,
  confidence        numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status            text not null default 'pending'
                      check (status in ('pending', 'completed', 'review_required',
                                        'failed', 'accepted', 'rejected')),
  error_code        text,
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index document_extractions_document_idx
  on public.document_extractions (organization_id, document_id);
create index document_extractions_status_idx
  on public.document_extractions (organization_id, status);

create trigger document_extractions_set_updated_at
  before update on public.document_extractions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- document_requirement_presets  (organization_id null = global preset)
-- -----------------------------------------------------------------------------
create table public.document_requirement_presets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public.organizations (id) on delete cascade,
  code              text not null,
  name              text not null,
  name_hi           text,
  category          text not null default 'photo'
                      check (category in ('photo', 'signature', 'document', 'pdf')),
  mime_types        text[] not null default array['image/jpeg'],
  min_size_bytes    bigint,
  max_size_bytes    bigint,
  width             int,
  height            int,
  dpi               int,
  color_mode        text check (color_mode in ('colour', 'greyscale', 'bw')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index document_requirement_presets_global_code_idx
  on public.document_requirement_presets (code)
  where organization_id is null;
create unique index document_requirement_presets_org_code_idx
  on public.document_requirement_presets (organization_id, code)
  where organization_id is not null;

create trigger document_requirement_presets_set_updated_at
  before update on public.document_requirement_presets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- document_derivatives — prepared files. The original is never modified (§13.3).
-- -----------------------------------------------------------------------------
create table public.document_derivatives (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  source_document_id  uuid references public.documents (id) on delete set null,
  customer_id         uuid references public.customers (id) on delete set null,
  application_id      uuid,

  tool_type           text not null check (tool_type in ('photo', 'signature', 'pdf')),
  preset_id           uuid references public.document_requirement_presets (id) on delete set null,
  storage_bucket      text not null default 'prepared-files',
  storage_path        text not null,
  filename            text not null,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes > 0),
  width               int,
  height              int,
  -- { operations: [...], preset: {...}, source: {...} } — the recipe that produced this file.
  metadata            jsonb not null default '{}'::jsonb,

  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),

  unique (organization_id, storage_bucket, storage_path)
);

create index document_derivatives_customer_idx
  on public.document_derivatives (organization_id, customer_id);
create index document_derivatives_source_idx
  on public.document_derivatives (organization_id, source_document_id);

alter table public.document_derivatives
  add constraint document_derivatives_path_is_org_scoped
  check (storage_path like ('org/' || organization_id::text || '/%'));

-- -----------------------------------------------------------------------------
-- Private storage buckets (§19.3)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('customer-documents', 'customer-documents', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('prepared-files', 'prepared-files', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ==========================================================================
-- Migration: 0005_applications.sql
-- ==========================================================================

-- =============================================================================
-- 0005  Applications, status history, document checklist
-- Master spec §21, §18.2
-- =============================================================================

create table public.applications (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  customer_id              uuid not null references public.customers (id) on delete cascade,
  portal_adapter_id        uuid,

  title                    text not null check (length(btrim(title)) >= 2),
  category                 text not null default 'other'
                             check (category in ('government', 'recruitment', 'scholarship',
                                                 'education', 'banking', 'certificate',
                                                 'utility', 'other')),
  status                   text not null default 'draft'
                             check (status in ('draft', 'pending_documents', 'ready_to_fill',
                                               'filled', 'submitted', 'pending_followup',
                                               'approved', 'rejected', 'cancelled')),

  portal_name              text,
  form_name                text,
  portal_url               text,
  -- The reference the *portal* issued. Assistigo does not invent or verify this (§21.4).
  portal_reference_number  text,

  deadline_at              timestamptz,
  amount_charged           numeric(10, 2) check (amount_charged is null or amount_charged >= 0),
  payment_status           text check (payment_status in ('unpaid', 'paid', 'refunded')),

  assigned_to              uuid references auth.users (id) on delete set null,
  notes                    text,

  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index applications_status_idx on public.applications (organization_id, status);
create index applications_customer_idx on public.applications (organization_id, customer_id);
create index applications_deadline_idx on public.applications (organization_id, deadline_at)
  where deadline_at is not null;
create index applications_assigned_idx on public.applications (organization_id, assigned_to);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Now that applications exists, wire up the deferred references from 0004.
alter table public.documents
  add constraint documents_application_fk
  foreign key (application_id) references public.applications (id) on delete set null;

alter table public.document_derivatives
  add constraint document_derivatives_application_fk
  foreign key (application_id) references public.applications (id) on delete set null;

-- -----------------------------------------------------------------------------
-- application_status_events — append-only history (§21.4)
-- -----------------------------------------------------------------------------
create table public.application_status_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  application_id   uuid not null references public.applications (id) on delete cascade,
  old_status       text,
  new_status       text not null,
  note             text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index application_status_events_application_idx
  on public.application_status_events (organization_id, application_id, created_at desc);

-- Record every status change automatically so history cannot be forgotten by a code path.
create or replace function public.record_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_events
      (organization_id, application_id, old_status, new_status, created_by)
    values (new.organization_id, new.id, null, new.status, new.created_by);
  elsif new.status is distinct from old.status then
    insert into public.application_status_events
      (organization_id, application_id, old_status, new_status, created_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger applications_record_status_change
  after insert or update of status on public.applications
  for each row execute function public.record_application_status_change();

-- -----------------------------------------------------------------------------
-- application_documents — the required-document checklist
-- -----------------------------------------------------------------------------
create table public.application_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  application_id   uuid not null references public.applications (id) on delete cascade,
  document_id      uuid references public.documents (id) on delete set null,
  derivative_id    uuid references public.document_derivatives (id) on delete set null,
  requirement_key  text not null,
  requirement_label text,
  preset_id        uuid references public.document_requirement_presets (id) on delete set null,
  status           text not null default 'required'
                     check (status in ('required', 'attached', 'missing', 'rejected')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (application_id, requirement_key)
);

create index application_documents_application_idx
  on public.application_documents (organization_id, application_id);

create trigger application_documents_set_updated_at
  before update on public.application_documents
  for each row execute function public.set_updated_at();


-- ==========================================================================
-- Migration: 0006_form_engine.sql
-- ==========================================================================

-- =============================================================================
-- 0006  Portal adapters, fill sessions, form reports, org field mappings
-- Master spec §14, §18.2
-- =============================================================================

-- organization_id null = global adapter shipped by Assistigo.
create table public.portal_adapters (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations (id) on delete cascade,
  slug                  text not null,
  portal_name           text not null,
  form_name             text not null,
  region                text,
  url_patterns          text[] not null default '{}',
  version               text not null default '1.0.0',
  status                text not null default 'draft'
                          check (status in ('draft', 'testing', 'active', 'deprecated')),
  field_mappings        jsonb not null default '[]'::jsonb,
  document_requirements jsonb not null default '[]'::jsonb,
  notes                 text,
  known_issues          text,
  last_verified_at      timestamptz,
  -- Rolling health signal fed by fill sessions and the adapter.healthcheck job.
  health                jsonb not null default '{"successRate": null, "lastFailureAt": null}'::jsonb,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index portal_adapters_global_slug_idx
  on public.portal_adapters (slug) where organization_id is null;
create unique index portal_adapters_org_slug_idx
  on public.portal_adapters (organization_id, slug) where organization_id is not null;
create index portal_adapters_status_idx on public.portal_adapters (status);

create trigger portal_adapters_set_updated_at
  before update on public.portal_adapters
  for each row execute function public.set_updated_at();

alter table public.applications
  add constraint applications_portal_adapter_fk
  foreign key (portal_adapter_id) references public.portal_adapters (id) on delete set null;

-- -----------------------------------------------------------------------------
-- org_field_mappings — an organization's own override for a portal field
-- (priority 2 in the mapping strategy, docs/FORM_ENGINE.md §3)
-- -----------------------------------------------------------------------------
create table public.org_field_mappings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  page_origin      text not null,
  field_signature  text not null,
  customer_field   text not null check (customer_field like 'customer.%'),
  transform        text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, page_origin, field_signature)
);

create trigger org_field_mappings_set_updated_at
  before update on public.org_field_mappings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- fill_sessions
-- -----------------------------------------------------------------------------
create table public.fill_sessions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  customer_id            uuid not null references public.customers (id) on delete cascade,
  application_id         uuid references public.applications (id) on delete set null,
  portal_adapter_id      uuid references public.portal_adapters (id) on delete set null,

  page_origin            text not null,
  page_path              text,
  page_title             text,

  detected_fields_count  int not null default 0,
  proposed_fields_count  int not null default 0,
  filled_fields_count    int not null default 0,
  skipped_fields_count   int not null default 0,
  review_required_count  int not null default 0,
  -- Counted separately so we can prove, from data, that these are never filled (§19.7).
  captcha_fields_count   int not null default 0,
  otp_fields_count       int not null default 0,
  payment_fields_count   int not null default 0,

  status                 text not null default 'detected'
                           check (status in ('detected', 'reviewed', 'filled', 'failed', 'cancelled')),
  error_summary          text,
  extension_version      text,

  created_by             uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on column public.fill_sessions.page_origin is
  'Origin + path only. The full query string may carry PII and is not stored.';

create index fill_sessions_recent_idx on public.fill_sessions (organization_id, created_at desc);
create index fill_sessions_customer_idx on public.fill_sessions (organization_id, customer_id);
create index fill_sessions_adapter_idx on public.fill_sessions (portal_adapter_id, status);

create trigger fill_sessions_set_updated_at
  before update on public.fill_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- fill_session_fields
-- -----------------------------------------------------------------------------
create table public.fill_session_fields (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  fill_session_id        uuid not null references public.fill_sessions (id) on delete cascade,

  field_signature        text not null,
  field_label            text,
  input_type             text not null,
  mapped_customer_field  text,
  mapping_source         text check (mapping_source in
                           ('adapter', 'org_custom', 'history', 'dictionary', 'ai', 'manual')),
  -- MASKED preview only. Never the full value (spec §18.2, docs/DATABASE.md §5).
  proposed_value_preview text,
  confidence             numeric(4, 3),
  action                 text not null default 'skipped'
                           check (action in ('filled', 'skipped', 'edited', 'failed')),
  skip_reason            text,
  safety_class           text not null default 'normal'
                           check (safety_class in ('normal', 'captcha', 'otp', 'payment', 'submit')),
  review_required        boolean not null default false,
  error                  text,
  created_at             timestamptz not null default now()
);

create index fill_session_fields_session_idx
  on public.fill_session_fields (organization_id, fill_session_id);

-- A captcha, OTP or payment field may never be recorded as filled. If this constraint ever
-- fires, a safety rule has been broken (spec §14.8, §19.7).
alter table public.fill_session_fields
  add constraint fill_session_fields_safety
  check (safety_class = 'normal' or action <> 'filled');

-- -----------------------------------------------------------------------------
-- form_reports — operator-submitted "this form is not supported"
-- -----------------------------------------------------------------------------
create table public.form_reports (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  fill_session_id    uuid references public.fill_sessions (id) on delete set null,
  portal_adapter_id  uuid references public.portal_adapters (id) on delete set null,

  page_origin        text not null,
  page_path          text,
  page_title         text,
  -- Anonymised field metadata only. No customer values, ever (spec §9.6, §14.2).
  field_metadata     jsonb not null default '[]'::jsonb,
  note               text,
  screenshot_path    text,
  screenshot_consent boolean not null default false,
  browser_version    text,
  extension_version  text,
  status             text not null default 'new'
                       check (status in ('new', 'triaged', 'adapter_created', 'declined')),

  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint form_reports_screenshot_requires_consent
    check (screenshot_path is null or screenshot_consent = true)
);

create index form_reports_status_idx on public.form_reports (status, created_at desc);
create index form_reports_org_idx on public.form_reports (organization_id, created_at desc);

create trigger form_reports_set_updated_at
  before update on public.form_reports
  for each row execute function public.set_updated_at();


-- ==========================================================================
-- Migration: 0007_billing.sql
-- ==========================================================================

-- =============================================================================
-- 0007  Plans, subscriptions, usage events
-- Master spec §22, §18.2
-- =============================================================================

create table public.plans (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique
                            check (code in ('free', 'starter', 'professional', 'business')),
  name                    text not null,
  name_hi                 text,
  price_monthly_inr       numeric(10, 2) not null default 0,
  included_fills          int,               -- null = unlimited
  included_ai_extractions int,
  included_seats          int not null default 1,
  max_customers           int,               -- null = unlimited
  storage_mb              int not null default 200,
  features                jsonb not null default '{}'::jsonb,
  active                  boolean not null default true,
  sort_order              int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- Plans are reference data, not tenant data: readable by any signed-in user, writable by
-- service_role only (there is no insert/update/delete policy below).
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (active = true);

-- -----------------------------------------------------------------------------
-- subscriptions
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  plan_id                  uuid not null references public.plans (id),
  provider                 text not null default 'mock'
                             check (provider in ('mock', 'razorpay', 'stripe')),
  provider_customer_id     text,
  provider_subscription_id text,
  status                   text not null default 'active'
                             check (status in ('active', 'trialing', 'past_due',
                                               'cancelled', 'incomplete')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index subscriptions_one_active_per_org_idx
  on public.subscriptions (organization_id)
  where status in ('active', 'trialing', 'past_due');

create unique index subscriptions_provider_ref_idx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- billing_webhook_events — idempotency ledger (§22.4)
-- -----------------------------------------------------------------------------
create table public.billing_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_id      text not null,
  event_type    text not null,
  processed_at  timestamptz not null default now(),
  result        text not null default 'processed'
                  check (result in ('processed', 'ignored', 'failed')),
  unique (provider, event_id)
);

comment on table public.billing_webhook_events is
  'A replayed webhook hits the unique constraint and is ignored, making processing idempotent.';

-- -----------------------------------------------------------------------------
-- usage_events
-- -----------------------------------------------------------------------------
create table public.usage_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  event_type       text not null
                     check (event_type in ('fill', 'ai_extraction', 'document_tool',
                                           'storage', 'seat')),
  quantity         int not null default 1 check (quantity > 0),
  billable         boolean not null default true,
  -- Never contains customer values; only ids and counts.
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index usage_events_period_idx
  on public.usage_events (organization_id, event_type, created_at);

-- Aggregated usage for the current billing period, used by the entitlement service.
create or replace function public.usage_since(org uuid, since timestamptz)
returns table (event_type text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.event_type, sum(u.quantity)::bigint
  from public.usage_events u
  where u.organization_id = org
    and u.billable = true
    and u.created_at >= since
  group by u.event_type;
$$;

revoke execute on function public.usage_since(uuid, timestamptz) from public;
grant execute on function public.usage_since(uuid, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Seed the plan catalogue. Mirrors packages/core/src/billing/plans.ts.
-- Prices are the §22.1 placeholder, not a business commitment.
-- -----------------------------------------------------------------------------
insert into public.plans
  (code, name, name_hi, price_monthly_inr, included_fills, included_ai_extractions,
   included_seats, max_customers, storage_mb, features, sort_order)
values
  ('free', 'Free', 'फ्री', 0, 25, 10, 1, 50, 200,
   '{"adapterLibrary": false, "advancedDocumentTools": false, "bulkImport": false, "apiAccess": false, "support": "community"}'::jsonb, 0),
  ('starter', 'Starter', 'स्टार्टर', 299, 300, 100, 2, 1000, 2000,
   '{"adapterLibrary": true, "advancedDocumentTools": true, "bulkImport": false, "apiAccess": false, "support": "email"}'::jsonb, 1),
  ('professional', 'Professional', 'प्रोफेशनल', 599, 1000, 400, 4, 5000, 10000,
   '{"adapterLibrary": true, "advancedDocumentTools": true, "bulkImport": true, "apiAccess": false, "support": "email"}'::jsonb, 2),
  ('business', 'Business', 'बिज़नेस', 999, null, 1500, 10, null, 50000,
   '{"adapterLibrary": true, "advancedDocumentTools": true, "bulkImport": true, "apiAccess": false, "support": "priority"}'::jsonb, 3)
on conflict (code) do update
  set name = excluded.name,
      name_hi = excluded.name_hi,
      price_monthly_inr = excluded.price_monthly_inr,
      included_fills = excluded.included_fills,
      included_ai_extractions = excluded.included_ai_extractions,
      included_seats = excluded.included_seats,
      max_customers = excluded.max_customers,
      storage_mb = excluded.storage_mb,
      features = excluded.features,
      sort_order = excluded.sort_order;


-- ==========================================================================
-- Migration: 0008_audit_and_privacy.sql
-- ==========================================================================

-- =============================================================================
-- 0008  Audit logs, consent records, support access grants, data requests
-- Master spec §19.2, §19.5, §19.9 (support access), §18.2
-- =============================================================================

create table public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete set null,
  actor_user_id    uuid references auth.users (id) on delete set null,
  actor_type       text not null default 'user'
                     check (actor_type in ('user', 'extension', 'system', 'support', 'webhook')),
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  sensitivity      text not null default 'normal'
                     check (sensitivity in ('normal', 'sensitive', 'critical')),
  ip_address       inet,
  user_agent       text,
  -- Must already be redacted by packages/core/src/privacy/redact.ts before insert.
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

comment on table public.audit_logs is
  'Insert-only. No update or delete policy exists for any role (spec §19.5).';

create index audit_logs_org_recent_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id);
create index audit_logs_action_idx on public.audit_logs (organization_id, action, created_at desc);

-- Even the service role should not be quietly rewriting history.
create or replace function public.forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ASSISTIGO_AUDIT_IMMUTABLE: audit_logs is append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.forbid_audit_mutation();

-- -----------------------------------------------------------------------------
-- consent_records (§19.2)
-- -----------------------------------------------------------------------------
create table public.consent_records (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  customer_id          uuid references public.customers (id) on delete cascade,
  consent_subject      text not null
                         check (consent_subject in ('customer_data', 'document_storage', 'ai_processing')),
  consent_text_version text not null,
  status               text not null default 'granted' check (status in ('granted', 'withdrawn')),
  collected_by         uuid references auth.users (id) on delete set null,
  collected_at         timestamptz not null default now(),
  withdrawn_at         timestamptz,
  -- How consent was taken: in person, signed form reference, etc. No biometric data.
  evidence_json        jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),

  constraint consent_withdrawn_has_timestamp
    check (status <> 'withdrawn' or withdrawn_at is not null)
);

create index consent_records_customer_idx
  on public.consent_records (organization_id, customer_id, consent_subject);

-- -----------------------------------------------------------------------------
-- support_access_grants (§6.1, §19.9)
-- Internal staff have no standing access to customer data.
-- -----------------------------------------------------------------------------
create table public.support_access_grants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  granted_to       uuid not null references auth.users (id) on delete cascade,
  reason           text not null check (length(btrim(reason)) >= 10),
  scope            text not null default 'metadata'
                     check (scope in ('metadata', 'customer_records', 'documents')),
  approved_by      uuid references auth.users (id) on delete set null,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),

  constraint support_grant_is_time_boxed
    check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index support_access_grants_active_idx
  on public.support_access_grants (granted_to, organization_id, expires_at);

create or replace function public.has_support_access(org uuid, required_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.support_access_grants g
    where g.organization_id = org
      and g.granted_to = auth.uid()
      and g.revoked_at is null
      and g.expires_at > now()
      and (
        g.scope = required_scope
        or (required_scope = 'metadata' and g.scope in ('customer_records', 'documents'))
        or (required_scope = 'customer_records' and g.scope = 'documents')
      )
  );
$$;

revoke execute on function public.has_support_access(uuid, text) from public;
grant execute on function public.has_support_access(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- data_requests — export and erasure (§19.10)
-- -----------------------------------------------------------------------------
create table public.data_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  customer_id      uuid references public.customers (id) on delete set null,
  request_type     text not null check (request_type in ('export', 'delete')),
  scope            text not null default 'customer' check (scope in ('customer', 'organization')),
  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  requested_by     uuid references auth.users (id) on delete set null,
  reason           text,
  result_path      text,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index data_requests_org_idx on public.data_requests (organization_id, status);

create trigger data_requests_set_updated_at
  before update on public.data_requests
  for each row execute function public.set_updated_at();


-- ==========================================================================
-- Migration: 0009_jobs.sql
-- ==========================================================================

-- =============================================================================
-- 0009  Background jobs
-- Master spec §17.5; docs/ARCHITECTURE.md §7
--
-- A jobs table rather than an external queue, because the MVP hosting target is
-- Vercel + Supabase. Handlers must be idempotent.
-- =============================================================================

create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,
  type             text not null
                     check (type in ('ocr.extract', 'document.derivative', 'retention.sweep',
                                     'billing.aggregate', 'adapter.healthcheck',
                                     'notification.send', 'data.export', 'data.delete')),
  -- Entity ids and options only. Never customer values.
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'pending'
                     check (status in ('pending', 'running', 'retry', 'completed', 'failed', 'cancelled')),
  attempts         int not null default 0,
  max_attempts     int not null default 5,
  run_after        timestamptz not null default now(),
  locked_until     timestamptz,
  locked_by        text,
  last_error       text,
  -- Deduplication key so producing the same job twice is harmless.
  idempotency_key  text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create unique index jobs_idempotency_idx
  on public.jobs (type, idempotency_key)
  where idempotency_key is not null and status in ('pending', 'running', 'retry');

create index jobs_claimable_idx
  on public.jobs (run_after)
  where status in ('pending', 'retry');

create index jobs_org_idx on public.jobs (organization_id, status, created_at desc);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Claim jobs with a lease. SKIP LOCKED lets several workers run without stepping
-- on each other; locked_until means a crashed worker's jobs come back on their own.
-- service_role only — the worker is the sole caller.
-- -----------------------------------------------------------------------------
create or replace function public.claim_jobs(
  worker_id text,
  batch_size int default 5,
  lease_seconds int default 120
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select j.id
    from public.jobs j
    where j.status in ('pending', 'retry')
      and j.run_after <= now()
      and (j.locked_until is null or j.locked_until < now())
    order by j.run_after
    for update skip locked
    limit batch_size
  )
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_by = worker_id,
         locked_until = now() + make_interval(secs => lease_seconds),
         updated_at = now()
    from claimable c
   where j.id = c.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_jobs(text, int, int) from public, authenticated;
grant execute on function public.claim_jobs(text, int, int) to service_role;

create or replace function public.complete_job(job_id uuid, ok boolean, error_text text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
begin
  select * into job from public.jobs where id = job_id for update;
  if job is null then
    return;
  end if;

  if ok then
    update public.jobs
       set status = 'completed', completed_at = now(), locked_until = null,
           locked_by = null, last_error = null
     where id = job_id;
  elsif job.attempts >= job.max_attempts then
    update public.jobs
       set status = 'failed', locked_until = null, locked_by = null, last_error = error_text
     where id = job_id;
  else
    -- Exponential backoff: 30s, 60s, 120s, 240s …
    update public.jobs
       set status = 'retry',
           locked_until = null,
           locked_by = null,
           last_error = error_text,
           run_after = now() + make_interval(secs => 30 * power(2, job.attempts)::int)
     where id = job_id;
  end if;
end;
$$;

revoke execute on function public.complete_job(uuid, boolean, text) from public, authenticated;
grant execute on function public.complete_job(uuid, boolean, text) to service_role;


-- ==========================================================================
-- Migration: 0010_rls_policies.sql
-- ==========================================================================

-- =============================================================================
-- 0010  Row Level Security
-- Master spec §18.3, §19; docs/SECURITY.md §2–§3
--
-- Every policy in one file so the whole tenancy model can be reviewed at once.
--
-- Role sets used below:
--   READ    owner, manager, operator, viewer        (billing_admin excluded — §6.2)
--   WRITE   owner, manager, operator
--   ADMIN   owner, manager
--   BILLING owner, manager, billing_admin           (view) / owner, billing_admin (manage)
-- =============================================================================

alter table public.organizations              enable row level security;
alter table public.organization_members       enable row level security;
alter table public.organization_invitations   enable row level security;
alter table public.customers                  enable row level security;
alter table public.customer_field_values      enable row level security;
alter table public.documents                  enable row level security;
alter table public.document_extractions       enable row level security;
alter table public.document_derivatives       enable row level security;
alter table public.document_requirement_presets enable row level security;
alter table public.applications               enable row level security;
alter table public.application_status_events  enable row level security;
alter table public.application_documents      enable row level security;
alter table public.portal_adapters            enable row level security;
alter table public.org_field_mappings         enable row level security;
alter table public.fill_sessions              enable row level security;
alter table public.fill_session_fields        enable row level security;
alter table public.form_reports               enable row level security;
alter table public.subscriptions              enable row level security;
alter table public.usage_events               enable row level security;
alter table public.billing_webhook_events     enable row level security;
alter table public.audit_logs                 enable row level security;
alter table public.consent_records            enable row level security;
alter table public.support_access_grants      enable row level security;
alter table public.data_requests              enable row level security;
alter table public.jobs                       enable row level security;

-- billing_webhook_events and jobs get NO policies: service_role only, by design.

-- -----------------------------------------------------------------------------
-- organizations
-- No INSERT policy: organizations are created through public.create_organization(),
-- which also creates the owner membership in the same transaction (0011).
-- -----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.has_support_access(id, 'metadata'));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'manager']))
  with check (public.has_org_role(id, array['owner', 'manager']));

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.has_org_role(id, array['owner']));

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id) or user_id = auth.uid());

create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager']));

create policy organization_members_update on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']))
  with check (public.has_org_role(organization_id, array['owner', 'manager']));

create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- organization_invitations
-- The invitee finds their invitation by token hash through an RPC, not by reading this table.
-- -----------------------------------------------------------------------------
create policy organization_invitations_select on public.organization_invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

create policy organization_invitations_insert on public.organization_invitations
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager']));

create policy organization_invitations_update on public.organization_invitations
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']))
  with check (public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or public.has_support_access(organization_id, 'customer_records')
  );

create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customers_update on public.customers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- customer_field_values
-- Viewer is excluded: this table carries encrypted identity values and raw provenance.
-- A viewer still sees the confirmed profile through `customers`.
-- -----------------------------------------------------------------------------
create policy customer_field_values_select on public.customer_field_values
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or public.has_support_access(organization_id, 'customer_records')
  );

create policy customer_field_values_insert on public.customer_field_values
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customer_field_values_update on public.customer_field_values
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy customer_field_values_delete on public.customer_field_values
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- documents and friends
-- -----------------------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or public.has_support_access(organization_id, 'documents')
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy documents_update on public.documents
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy documents_delete on public.documents
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

create policy document_extractions_select on public.document_extractions
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or public.has_support_access(organization_id, 'documents')
  );

create policy document_extractions_insert on public.document_extractions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_extractions_update on public.document_extractions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_derivatives_select on public.document_derivatives
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy document_derivatives_insert on public.document_derivatives
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_derivatives_delete on public.document_derivatives
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- Global presets (organization_id is null) are readable by everyone signed in.
create policy document_requirement_presets_select on public.document_requirement_presets
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

create policy document_requirement_presets_write on public.document_requirement_presets
  for all to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner', 'manager']))
  with check (organization_id is not null and public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- applications
-- -----------------------------------------------------------------------------
create policy applications_select on public.applications
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or public.has_support_access(organization_id, 'customer_records')
  );

create policy applications_insert on public.applications
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy applications_update on public.applications
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy applications_delete on public.applications
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- History is readable but never editable: no update or delete policy.
create policy application_status_events_select on public.application_status_events
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy application_status_events_insert on public.application_status_events
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy application_documents_select on public.application_documents
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy application_documents_write on public.application_documents
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

-- -----------------------------------------------------------------------------
-- form engine
-- Global adapters are read-only reference data for every organization; only
-- service_role may write them (no policy covers organization_id is null).
-- -----------------------------------------------------------------------------
create policy portal_adapters_select on public.portal_adapters
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

create policy portal_adapters_write on public.portal_adapters
  for all to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner', 'manager']))
  with check (organization_id is not null and public.has_org_role(organization_id, array['owner', 'manager']));

create policy org_field_mappings_select on public.org_field_mappings
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy org_field_mappings_write on public.org_field_mappings
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy fill_sessions_select on public.fill_sessions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy fill_sessions_insert on public.fill_sessions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy fill_sessions_update on public.fill_sessions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy fill_session_fields_select on public.fill_session_fields
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy fill_session_fields_insert on public.fill_session_fields
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy form_reports_select on public.form_reports
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy form_reports_insert on public.form_reports
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

-- -----------------------------------------------------------------------------
-- billing
-- -----------------------------------------------------------------------------
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'billing_admin']));

create policy subscriptions_write on public.subscriptions
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'billing_admin']))
  with check (public.has_org_role(organization_id, array['owner', 'billing_admin']));

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'billing_admin']));

create policy usage_events_insert on public.usage_events
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

-- -----------------------------------------------------------------------------
-- audit and privacy
-- audit_logs has select + insert only. Update and delete are additionally blocked by a
-- trigger, so even service_role cannot rewrite history.
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager'])
    or public.has_support_access(organization_id, 'metadata')
  );

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy consent_records_select on public.consent_records
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy consent_records_insert on public.consent_records
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy consent_records_update on public.consent_records
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

-- An organization can see who has been granted access to it; a support user can see their
-- own grants. Only an owner may create or revoke one.
create policy support_access_grants_select on public.support_access_grants
  for select to authenticated
  using (public.is_org_member(organization_id) or granted_to = auth.uid());

create policy support_access_grants_insert on public.support_access_grants
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']));

create policy support_access_grants_update on public.support_access_grants
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));

create policy data_requests_select on public.data_requests
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

create policy data_requests_insert on public.data_requests
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']));

-- =============================================================================
-- Storage policies
--
-- The app normally issues short-lived signed URLs from the server, so these policies are
-- defence in depth: even with a leaked anon session, an object is reachable only by a
-- member of the organization named in its path prefix.
-- =============================================================================

create or replace function public.org_id_from_storage_path(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  candidate text;
begin
  if object_name is null or split_part(object_name, '/', 1) <> 'org' then
    return null;
  end if;
  candidate := split_part(object_name, '/', 2);
  return candidate::uuid;
exception
  when others then
    return null;
end;
$$;

create policy "assistigo documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('customer-documents', 'prepared-files')
    and public.is_org_member(public.org_id_from_storage_path(name))
  );

create policy "assistigo documents write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('customer-documents', 'prepared-files')
    and public.has_org_role(
      public.org_id_from_storage_path(name),
      array['owner', 'manager', 'operator']
    )
  );

create policy "assistigo documents delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('customer-documents', 'prepared-files')
    and public.has_org_role(
      public.org_id_from_storage_path(name),
      array['owner', 'manager']
    )
  );


-- ==========================================================================
-- Migration: 0011_rpc.sql
-- ==========================================================================

-- =============================================================================
-- 0011  RPCs that need to run as more than one statement, atomically
-- Master spec §7.2 (org setup), §9.1 (onboarding), §7.3.2 (customer search)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_organization
--
-- Organizations have no INSERT policy on purpose: an organization without an owner is a
-- broken tenant nobody can administer or erase. This function is the only way to create
-- one, and it always creates the owner membership in the same transaction.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_business_type text default 'other',
  p_city text default null,
  p_district text default null,
  p_state text default null,
  p_locale text default 'en',
  p_monthly_forms text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
  free_plan_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'ASSISTIGO_UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  insert into public.organizations
    (name, business_type, city, district, state, preferred_locale,
     monthly_forms_estimate, created_by)
  values
    (btrim(p_name), coalesce(p_business_type, 'other'), p_city, p_district, p_state,
     coalesce(p_locale, 'en'), p_monthly_forms, actor)
  returning * into new_org;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (new_org.id, actor, 'owner', 'active');

  select id into free_plan_id from public.plans where code = 'free';
  if free_plan_id is not null then
    insert into public.subscriptions
      (organization_id, plan_id, provider, status, current_period_start, current_period_end)
    values
      (new_org.id, free_plan_id, 'mock', 'active', date_trunc('month', now()),
       date_trunc('month', now()) + interval '1 month');
  end if;

  insert into public.audit_logs
    (organization_id, actor_user_id, actor_type, action, entity_type, entity_id, sensitivity)
  values
    (new_org.id, actor, 'user', 'organization.created', 'organization', new_org.id, 'normal');

  return new_org;
end;
$$;

revoke execute on function public.create_organization(text, text, text, text, text, text, text) from public;
grant execute on function public.create_organization(text, text, text, text, text, text, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- accept_invitation
--
-- The invitee is not yet a member, so they cannot read organization_invitations. They present
-- the hash of the token from their emailed link and this function does the rest.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token_hash text)
returns public.organization_members
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.organization_invitations;
  membership public.organization_members;
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then
    raise exception 'ASSISTIGO_UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  select email into actor_email from auth.users where id = actor;

  select * into invite
  from public.organization_invitations
  where token_hash = p_token_hash
  for update;

  if invite is null then
    raise exception 'ASSISTIGO_INVITE_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if invite.status <> 'pending' then
    raise exception 'ASSISTIGO_INVITE_NOT_PENDING' using errcode = 'invalid_parameter_value';
  end if;

  if invite.expires_at < now() then
    update public.organization_invitations set status = 'expired' where id = invite.id;
    raise exception 'ASSISTIGO_INVITE_EXPIRED' using errcode = 'invalid_parameter_value';
  end if;

  -- The link is not a bearer token for anyone who finds it: it only works for the invited
  -- address (spec §19.4).
  if lower(coalesce(actor_email, '')) <> lower(invite.email) then
    raise exception 'ASSISTIGO_INVITE_EMAIL_MISMATCH' using errcode = 'insufficient_privilege';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (invite.organization_id, actor, invite.role, 'active', invite.invited_by)
  on conflict (organization_id, user_id)
    do update set status = 'active', role = excluded.role
  returning * into membership;

  update public.organization_invitations
     set status = 'accepted', accepted_by = actor, accepted_at = now()
   where id = invite.id;

  insert into public.audit_logs
    (organization_id, actor_user_id, actor_type, action, entity_type, entity_id, sensitivity)
  values
    (invite.organization_id, actor, 'user', 'member.accepted', 'organization_member',
     membership.id, 'normal');

  return membership;
end;
$$;

revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- search_customers
--
-- Deliberately SECURITY INVOKER: RLS still applies, so this cannot become a way around
-- tenancy. Ranks full-text matches, exact mobile matches and trigram name similarity.
-- Aadhaar is not searchable, by design (§19.3).
-- -----------------------------------------------------------------------------
create or replace function public.search_customers(
  p_organization_id uuid,
  p_query text default null,
  p_district text default null,
  p_state text default null,
  p_assigned_to uuid default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  customer_code text,
  full_name text,
  full_name_hi text,
  mobile text,
  district text,
  state text,
  date_of_birth date,
  verification_status text,
  created_at timestamptz,
  rank real
)
language sql
stable
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as q,
      public.normalize_mobile(nullif(btrim(coalesce(p_query, '')), '')) as q_mobile
  )
  select
    c.id,
    c.customer_code,
    c.full_name,
    c.full_name_hi,
    c.mobile,
    c.address_json -> 'current' ->> 'district' as district,
    c.address_json -> 'current' ->> 'state' as state,
    c.date_of_birth,
    c.verification_status,
    c.created_at,
    case
      when p.q is null then 0::real
      when p.q_mobile is not null and length(p.q_mobile) = 10 and c.mobile_normalized = p.q_mobile
        then 1.0::real
      when lower(c.customer_code) = lower(p.q) then 0.99::real
      else greatest(
        ts_rank(c.search_vector, plainto_tsquery('simple', p.q)),
        similarity(c.full_name, p.q)
      )
    end as rank
  from public.customers c
  cross join params p
  where c.organization_id = p_organization_id
    and c.deleted_at is null
    and (p_district is null or c.address_json -> 'current' ->> 'district' = p_district)
    and (p_state is null or c.address_json -> 'current' ->> 'state' = p_state)
    and (p_assigned_to is null or c.assigned_to = p_assigned_to)
    and (
      p.q is null
      or c.search_vector @@ plainto_tsquery('simple', p.q)
      or c.full_name % p.q
      or lower(c.customer_code) = lower(p.q)
      or (p.q_mobile is not null and length(p.q_mobile) >= 4
          and c.mobile_normalized like '%' || p.q_mobile)
    )
  order by rank desc, c.created_at desc
  limit least(coalesce(p_limit, 25), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_customers(uuid, text, text, text, uuid, int, int) from public;
grant execute on function public.search_customers(uuid, text, text, text, uuid, int, int)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- dashboard_summary — the home screen counters (§7.3.1) in one round trip.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_organization_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'fillsToday', (
      select count(*) from public.fill_sessions
      where organization_id = p_organization_id
        and status = 'filled'
        and created_at >= date_trunc('day', now())
    ),
    'customersServedToday', (
      select count(distinct customer_id) from public.fill_sessions
      where organization_id = p_organization_id
        and created_at >= date_trunc('day', now())
    ),
    'customersTotal', (
      select count(*) from public.customers
      where organization_id = p_organization_id and deleted_at is null
    ),
    'documentsProcessedToday', (
      select count(*) from public.document_extractions
      where organization_id = p_organization_id
        and status in ('completed', 'accepted', 'review_required')
        and created_at >= date_trunc('day', now())
    ),
    'applicationsOpen', (
      select count(*) from public.applications
      where organization_id = p_organization_id
        and deleted_at is null
        and status in ('draft', 'pending_documents', 'ready_to_fill', 'filled',
                       'submitted', 'pending_followup')
    ),
    'reviewsPending', (
      select count(*) from public.document_extractions
      where organization_id = p_organization_id and status = 'review_required'
    ),
    'fieldsFilledThisMonth', (
      select coalesce(sum(filled_fields_count), 0) from public.fill_sessions
      where organization_id = p_organization_id
        and created_at >= date_trunc('month', now())
    )
  );
$$;

revoke execute on function public.dashboard_summary(uuid) from public;
grant execute on function public.dashboard_summary(uuid) to authenticated, service_role;


-- ==========================================================================
-- Migration: 0012_extension_pairing.sql
-- ==========================================================================

-- =============================================================================
-- 0012  Extension pairing codes
-- Master spec §15.1.2; docs/EXTENSION.md §3
--
-- Transport for one step only: moving a signed-in dashboard session into the Chrome extension
-- without a password ever being typed into extension UI.
--
-- The row is deliberately short-lived and single-use:
--   * `code_hash` is SHA-256 of the code. The code itself is never stored, so a database leak
--     cannot be replayed against this table.
--   * `session_payload` is the dashboard's Supabase session, AES-256-GCM encrypted by the
--     application (packages/core/src/privacy/crypto.ts) with the code hash as AAD, so a row
--     cannot be transplanted onto a different code.
--   * `expires_at` is minutes at most, and `consumed_at` makes redemption one-shot.
--
-- No customer data is ever written here.
-- =============================================================================

create table public.extension_pairing_codes (
  code_hash       text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- v1.<iv>.<tag>.<ciphertext> — see packages/core/src/privacy/crypto.ts
  session_payload text not null,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index extension_pairing_codes_expires_idx
  on public.extension_pairing_codes (expires_at);

-- One live code per user: minting a new one invalidates the last, so an abandoned connect tab
-- cannot leave a redeemable code behind.
create unique index extension_pairing_codes_live_user_idx
  on public.extension_pairing_codes (user_id) where consumed_at is null;

alter table public.extension_pairing_codes enable row level security;

-- No policies, by design: only the pairing routes reach this table, through service_role.
-- An operator's own JWT must not be able to read another row, or their own encrypted session.

-- -----------------------------------------------------------------------------
-- Redemption, as one atomic statement.
--
-- Runs as the definer so the pair route can call it without service_role, and so the
-- "check unconsumed, then mark consumed" pair cannot interleave with a second redemption of
-- the same code. Returns nothing when the code is unknown, expired or already used — the
-- caller cannot tell which, on purpose.
-- -----------------------------------------------------------------------------
-- Output columns are deliberately not named `user_id` / `session_payload`: in a SQL-language
-- table function those names would be ambiguous against the table's own columns.
create function public.consume_extension_pairing_code(p_code_hash text)
returns table (paired_user_id uuid, sealed_session text)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.extension_pairing_codes
     set consumed_at = now()
   where code_hash = p_code_hash
     and consumed_at is null
     and expires_at > now()
  returning extension_pairing_codes.user_id, extension_pairing_codes.session_payload;
$$;

revoke all on function public.consume_extension_pairing_code(text) from public;
grant execute on function public.consume_extension_pairing_code(text) to service_role;

-- -----------------------------------------------------------------------------
-- Housekeeping. Consumed and expired rows have no value; the sweep keeps the encrypted
-- session payloads from lingering (docs/SECURITY.md — retention).
-- -----------------------------------------------------------------------------
create function public.purge_extension_pairing_codes()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.extension_pairing_codes
     where expires_at < now() - interval '1 hour'
        or consumed_at < now() - interval '1 hour'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.purge_extension_pairing_codes() from public;
grant execute on function public.purge_extension_pairing_codes() to service_role;


-- ==========================================================================
-- Migration: 0013_document_extraction_uniqueness.sql
-- ==========================================================================

-- =============================================================================
-- 0013  One current extraction per document
-- Master spec §12.1, §12.6; docs/AI_PIPELINE.md §1
--
-- The `ocr.extract` job must be idempotent (§17.5): a retry after a transient storage or
-- provider failure has to replace its own previous attempt rather than stack a second copy of
-- the same fields into the operator's review queue.
--
-- History is not lost by collapsing this to one row. Provenance for values the operator
-- *accepted* lives in `customer_field_values` (source document, confidence, status), and the
-- accept/reject decision itself is in `audit_logs`. What this table holds is the current
-- proposal, and there is only ever one of those per document.
-- =============================================================================

-- Collapse any pre-existing duplicates before the constraint goes on, keeping the newest row
-- for each document. A fresh database has nothing to do here.
delete from public.document_extractions e
 using public.document_extractions newer
 where e.document_id = newer.document_id
   and (newer.created_at, newer.id) > (e.created_at, e.id);

alter table public.document_extractions
  add constraint document_extractions_one_per_document unique (document_id);

-- -----------------------------------------------------------------------------
-- Storage accounting for the storage entitlement (§22.3)
--
-- `security definer` so the caller does not need to read every document row to learn a single
-- total — the number is a plan measurement, not customer data. Deleted documents are excluded
-- because their bytes are removed from the bucket at delete time (docs/SECURITY.md §10).
-- -----------------------------------------------------------------------------
create or replace function public.storage_used_bytes(org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(d.size_bytes), 0)::bigint
  from public.documents d
  where d.organization_id = org
    and d.deleted_at is null
    and public.is_org_member(org);
$$;

revoke execute on function public.storage_used_bytes(uuid) from public;
grant execute on function public.storage_used_bytes(uuid) to authenticated, service_role;


-- ==========================================================================
-- Migration: 0014_enqueue_job_rpc.sql
-- ==========================================================================

-- =============================================================================
-- 0014  enqueue_job — the one way an operator can queue background work
-- Master spec §17.5; docs/SECURITY.md §2
--
-- `jobs` has RLS enabled and deliberately no policies (0010): it is service-role territory,
-- because a table that drives background execution is not something a tenant should be able to
-- write to freely. But an operator pressing "Read this document" genuinely does need to queue an
-- `ocr.extract`, and doing that with the service-role client from a route handler would put RLS
-- behind a single application-code check instead of two gates.
--
-- So this follows the same shape as `create_organization` in 0011: the table stays closed, and
-- one `security definer` function provides a narrow, validated entry point that re-checks
-- membership in the database.
-- =============================================================================

-- Job types an operator may trigger. Everything else — retention sweeps, billing aggregation,
-- adapter health checks — is scheduled infrastructure and stays service-role only.
create or replace function public.enqueue_job(
  p_type            text,
  p_organization_id uuid,
  p_payload         jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor    uuid := auth.uid();
  existing uuid;
  new_id   uuid;
begin
  if actor is null then
    raise exception 'ASSISTIGO_UNAUTHENTICATED' using errcode = 'insufficient_privilege';
  end if;

  if p_type not in ('ocr.extract', 'document.derivative') then
    raise exception 'ASSISTIGO_JOB_TYPE_NOT_ALLOWED' using errcode = 'insufficient_privilege';
  end if;

  -- Same roles that may upload a document may queue work about it (docs/SECURITY.md §3).
  if not public.has_org_role(p_organization_id, array['owner', 'manager', 'operator']) then
    raise exception 'ASSISTIGO_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- Deduplicate against work that is still in flight, so pressing the button twice is harmless.
  if p_idempotency_key is not null then
    select j.id into existing
    from public.jobs j
    where j.type = p_type
      and j.idempotency_key = p_idempotency_key
      and j.status in ('pending', 'running', 'retry')
    limit 1;

    if existing is not null then
      return null;
    end if;
  end if;

  insert into public.jobs (organization_id, type, payload, idempotency_key, created_by)
  values (p_organization_id, p_type, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, actor)
  returning id into new_id;

  return new_id;

exception
  -- Two requests raced past the check above; the partial unique index caught the second one.
  -- That is the deduplication working, not a failure.
  when unique_violation then
    return null;
end;
$$;

revoke execute on function public.enqueue_job(text, uuid, jsonb, text) from public;
grant execute on function public.enqueue_job(text, uuid, jsonb, text) to authenticated, service_role;


-- ==========================================================================
-- Migration: 0015_claim_document_job.sql
-- ==========================================================================

-- =============================================================================
-- 0015  claim_document_job — claim one document's extraction job, by document
-- Master spec §17.5; docs/ARCHITECTURE.md §7; docs/AI_PIPELINE.md §10
--
-- `claim_jobs` (0009) is the scheduler's entry point: it takes whatever is due,
-- from any organization, in run order. That is right for a worker and wrong for
-- a request. `POST /api/documents/:id/process` wants to finish reading the
-- document the operator just uploaded, and only that one — draining the shared
-- queue inside a user's request would make one tenant's upload wait on another
-- tenant's work.
--
-- So this claims by document instead of by position. It takes the same lease as
-- `claim_jobs` and is completed through the same `complete_job`, so the retry and
-- backoff policy stays in one place.
--
-- It also handles the case that made documents hang in the first place: a job
-- queued when no worker existed is still `pending`, so pressing "Read again"
-- finds it and runs it, rather than being deduplicated into doing nothing.
--
-- service_role only. The route handler has already authorized the caller against
-- the document's organization before it gets here.
-- =============================================================================

-- `p_extraction_mode` exists for one specific case: a document that has been sitting at
-- `processing` because nothing ever ran its job. Pressing "Read again" on it is deduplicated by
-- `enqueue_job` — correctly, the work is already queued — so without this the operator's newly
-- chosen reading method would be ignored in favour of the one queued the first time. Rewriting
-- the payload as part of the claim keeps that atomic: there is no window in which the job could
-- be claimed by the scheduler between the rewrite and the run. Null leaves the payload alone.
create or replace function public.claim_document_job(
  p_document_id    uuid,
  p_worker_id      text,
  p_lease_seconds  int default 120,
  p_extraction_mode text default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_extraction_mode is not null
     and p_extraction_mode not in ('auto', 'non_ai', 'ai') then
    raise exception 'ASSISTIGO_INVALID_EXTRACTION_MODE' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with claimable as (
    select j.id
      from public.jobs j
     where j.type = 'ocr.extract'
       and j.payload ->> 'documentId' = p_document_id::text
       and j.status in ('pending', 'retry')
       and j.run_after <= now()
       and (j.locked_until is null or j.locked_until < now())
     order by j.created_at
       for update skip locked
     limit 1
  )
  update public.jobs j
     set status       = 'running',
         attempts     = j.attempts + 1,
         locked_by    = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         payload      = case
                          when p_extraction_mode is null then j.payload
                          else jsonb_set(
                                 j.payload,
                                 '{extractionMode}',
                                 to_jsonb(p_extraction_mode),
                                 true
                               )
                        end,
         updated_at   = now()
    from claimable c
   where j.id = c.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_document_job(uuid, text, int, text)
  from public, authenticated;
grant execute on function public.claim_document_job(uuid, text, int, text) to service_role;

-- The claim filters on a payload key, so give it an index rather than a sequential scan over
-- every job ever queued.
create index if not exists jobs_ocr_document_idx
  on public.jobs ((payload ->> 'documentId'))
  where type = 'ocr.extract';


-- ==========================================================================
-- Migration: 0016_derivative_storage_usage.sql
-- ==========================================================================

-- =============================================================================
-- 0016  Prepared files count towards the storage entitlement
-- Master spec §13 (document tools), §22.3 (limits enforced server-side)
--
-- Phase 6 turns on the document tools, which means `document_derivatives` starts holding real
-- objects in the `prepared-files` bucket. Those bytes occupy the same Supabase project as the
-- source documents and cost the same money, but `storage_used_bytes` — written in 0013, when
-- nothing wrote derivatives — only counted `documents`.
--
-- Left alone, an organization on a 500 MB plan could park unlimited prepared files: a
-- 16-photo A4 sheet at 300 DPI is a couple of megabytes, and an operator generates several per
-- customer. An entitlement that silently stops applying is a billing bug nobody finds.
--
-- Derivatives are hard-deleted (there is no `deleted_at` on the table), so unlike documents
-- there is no soft-delete to exclude: a row present means bytes present.
-- =============================================================================

create or replace function public.storage_used_bytes(org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  -- The membership check gates the whole total, and is the reason this is `security definer`:
  -- the function reads every row of two tenant tables to return one number, so it has to prove
  -- the caller belongs to the organization it is being asked about.
  select case
    when public.is_org_member(org) then
      coalesce((
        select sum(d.size_bytes)
        from public.documents d
        where d.organization_id = org
          and d.deleted_at is null
      ), 0)
      + coalesce((
        select sum(v.size_bytes)
        from public.document_derivatives v
        where v.organization_id = org
      ), 0)
    else 0
  end::bigint;
$$;

revoke execute on function public.storage_used_bytes(uuid) from public;
grant execute on function public.storage_used_bytes(uuid) to authenticated, service_role;


-- ==========================================================================
-- Migration: 0017_ai_vendor_settings.sql
-- ==========================================================================

-- =============================================================================
-- 0017  Organization AI vendor settings
-- Master spec §12.3, §19.3; docs/AI_PIPELINE.md §2; docs/DEVELOPMENT_RULES.md §1 rule 10
--
-- Each organization may configure its own AI vision vendor (base URL, model, API key, and an
-- optional custom extraction prompt) instead of the deployment-wide provider in environment
-- variables. This is a new sensitive-data surface — a third-party API key stored at rest — so
-- it gets its own table rather than a key inside the generic `organizations.settings` jsonb:
--
--   * `api_key_encrypted` is AES-256-GCM ciphertext (packages/core/src/privacy/crypto.ts),
--     never plaintext. The application never returns the decrypted key to a client; the
--     settings API only ever reports whether one is set.
--   * Writing this row still does not turn AI processing on for a document — that remains
--     gated on `organizations.settings.ai_processing_enabled`, which an owner sets separately
--     and which the extraction pipeline checks as the authoritative gate (rule 10). Configuring
--     a vendor here without enabling that flag configures a key that is never used.
--   * Only an owner may create, change or remove this row (docs/SECURITY.md §3, "Org security
--     settings: owner only") — a manager can change ordinary org settings but not this.
-- =============================================================================

create table public.organization_ai_settings (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  provider         text not null default 'deepseek'
                     check (provider in (
                       'openai', 'anthropic', 'deepseek', 'gemini', 'ollama', 'openrouter', 'custom'
                     )),
  wire_format      text not null default 'openai_compatible'
                     check (wire_format in ('openai_compatible', 'anthropic_messages')),
  base_url         text,
  model            text,
  -- v1.<iv>.<tag>.<ciphertext> — see packages/core/src/privacy/crypto.ts. Never plaintext.
  api_key_encrypted text,
  custom_prompt    text check (custom_prompt is null or length(custom_prompt) <= 8000),
  updated_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.organization_ai_settings.api_key_encrypted is
  'AES-256-GCM ciphertext. Plaintext is never stored and never returned to a client (docs/SECURITY.md §4).';
comment on column public.organization_ai_settings.custom_prompt is
  'Replaces the default transcription prompt and asks the model to map the document to customer.* fields directly. Every value it proposes still passes the Aadhaar-masking safety gate and the same review rules as any other extraction (packages/ai/src/safety.ts) before a human ever sees it.';

alter table public.organization_ai_settings enable row level security;

create trigger organization_ai_settings_set_updated_at
  before update on public.organization_ai_settings
  for each row execute function public.set_updated_at();

-- Any active member may see which vendor/model is configured (surfaced in the upload panel as
-- "read by"), but never the key — the application layer never selects api_key_encrypted for a
-- non-owner response. Only an owner may write.
create policy organization_ai_settings_select on public.organization_ai_settings
  for select using (public.is_org_member(organization_id));

create policy organization_ai_settings_insert on public.organization_ai_settings
  for insert with check (public.has_org_role(organization_id, array['owner']));

create policy organization_ai_settings_update on public.organization_ai_settings
  for update using (public.has_org_role(organization_id, array['owner']));

create policy organization_ai_settings_delete on public.organization_ai_settings
  for delete using (public.has_org_role(organization_id, array['owner']));


-- ==========================================================================
-- Migration: 0018_billing_plan_sync.sql
-- ==========================================================================

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


-- ==========================================================================
-- Migration: 0019_graduation_marksheet_document_type.sql
-- ==========================================================================

-- =============================================================================
-- 0019  Graduation marksheet document class
-- Master spec §12.2; docs/AI_PIPELINE.md §3
--
-- Degree and university marksheets were landing on `unknown`, which put only the universal
-- fields in scope and threw away the roll number, registration number, college, course and
-- result the operator actually needed. `marksheet_graduation` gives them a first-class class,
-- and the extractor a field allow-list to match (packages/ai/src/rules.ts).
--
-- The column keeps its check constraint rather than moving to an enum: `DOCUMENT_TYPES` in
-- packages/core/src/documents/types.ts is the source of truth, and a text check is what the
-- rest of this schema uses (0004).
-- =============================================================================

alter table public.documents
  drop constraint if exists documents_document_type_check;

alter table public.documents
  add constraint documents_document_type_check
  check (document_type in (
    'aadhaar_like', 'pan', 'voter_id', 'marksheet_10', 'marksheet_12', 'marksheet_graduation',
    'caste_certificate', 'income_certificate', 'residence_certificate',
    'photo', 'signature', 'receipt', 'application_pdf', 'generic', 'unknown'));


-- ==========================================================================
-- Migration: 0020_schemes_catalog.sql
-- ==========================================================================

-- =============================================================================
-- 0020  Scheme & vacancy catalogue
-- Master spec §14.6; docs/ARCHITECTURE.md §7; docs/SECURITY.md §2–§3
--
-- The tracked half of the scheme matcher. The eligibility *rules* for the high-volume central
-- and state schemes ship in the build (packages/core/src/schemes/catalog.ts) so that an empty
-- database still has something to sell; this table exists for the half that a build cannot hold:
--
--   * Live application windows. A recruitment cycle's real dates change with every notification,
--     so the built-ins ship with none and the countdown UI stays silent. A centre — or, later, a
--     sync worker — puts the real dates here and the lifecycle badges light up.
--   * Local schemes. A Jan Seva Kendra's district welfare scheme will never be in a global
--     catalogue, and it is often the most billable thing on its counter.
--   * Corrections. When a state revises an age limit mid-cycle, the centre that noticed should
--     not have to wait for a release.
--
-- Precedence follows `portal_adapters` exactly: `organization_id is null` is the platform-wide
-- catalogue, a row with an organization_id is that centre's own, and an org row overrides a
-- global one with the same slug (packages/core/src/schemes/catalog.ts, `mergeSchemes`).
--
-- No personal data lives here. These are published government rules, so nothing in this table is
-- subject to the retention, export or erasure paths in 0008 — it is reference data that happens
-- to be tenant-scoped.
-- =============================================================================

create table public.schemes_catalog (
  id                        uuid primary key default gen_random_uuid(),
  -- null = platform-wide catalogue, writable only by service_role.
  organization_id           uuid references public.organizations (id) on delete cascade,
  slug                      text not null
                              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  category                  text not null
                              check (category in ('recruitment', 'welfare', 'scholarship',
                                                  'certificate', 'business_loan')),

  -- Localised copy, always {"en": ..., "hi": ...} (docs/DEVELOPMENT_RULES.md, en + hi).
  title                     jsonb not null,
  short_description         jsonb not null,
  benefits_summary          jsonb not null,
  benefit_highlight         jsonb not null,

  portal_name               text not null,
  portal_url                text not null,
  -- Links to portal_adapters.slug when the extension can autofill this form. Deliberately not a
  -- foreign key: a scheme is worth listing before anyone has mapped its form.
  adapter_slug              text,
  official_notification_url text,

  -- The window. All four together are `SchemeSchedule` in the domain layer.
  application_start_date    date,
  application_end_date      date,
  is_always_open            boolean not null default false,
  exam_date                 date,

  -- A typical centre service charge, not a government fee and not a price Assistigo sets.
  estimated_operator_fee    int not null default 0
                              check (estimated_operator_fee between 0 and 10000),
  -- `SchemeEligibilityCriteria`. Validated with Zod on read: a malformed criterion must not be
  -- able to tell a citizen they qualify for something they do not.
  eligibility               jsonb not null default '{}'::jsonb,
  pitch_template            jsonb not null,
  upcoming_pitch_template   jsonb not null,

  -- Provenance. Which claim about a government rule is this, and who stands behind it?
  source                    text not null default 'manual'
                              check (source in ('manual', 'built_in', 'sync', 'ai_notification')),
  source_url                text,
  last_synced_at            timestamptz,
  verified_at               timestamptz,
  verified_by               uuid references auth.users (id) on delete set null,
  -- Unpublished rows are drafts. A global draft is invisible to tenants until someone verifies
  -- it, so an automated import can never quietly become advice given at a counter.
  is_published              boolean not null default true,

  created_by                uuid references auth.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint schemes_catalog_window_ordered
    check (application_start_date is null
           or application_end_date is null
           or application_start_date <= application_end_date),
  -- "Open all year" and "closes on a date" cannot both be true; the domain layer lets
  -- is_always_open win, and disagreeing data is a bug worth refusing at write time.
  constraint schemes_catalog_evergreen_has_no_end
    check (not is_always_open or application_end_date is null),
  constraint schemes_catalog_localised
    check (title->>'en' is not null and title->>'hi' is not null
           and short_description->>'en' is not null and short_description->>'hi' is not null
           and benefits_summary->>'en' is not null and benefits_summary->>'hi' is not null
           and benefit_highlight->>'en' is not null and benefit_highlight->>'hi' is not null
           and pitch_template->>'en' is not null and pitch_template->>'hi' is not null
           and upcoming_pitch_template->>'en' is not null
           and upcoming_pitch_template->>'hi' is not null),
  constraint schemes_catalog_eligibility_is_object
    check (jsonb_typeof(eligibility) = 'object')
);

comment on table public.schemes_catalog is
  'Tracked government schemes, scholarships and vacancies. Reference data only — no personal data. organization_id null is the platform catalogue; an org row of the same slug overrides it.';
comment on column public.schemes_catalog.eligibility is
  'SchemeEligibilityCriteria as JSON. Re-validated with Zod on every read (packages/core/src/schemes/types.ts); a row that fails is skipped rather than shown, because a malformed rule is worse than a missing scheme.';
comment on column public.schemes_catalog.is_published is
  'Global rows are hidden from tenants until published, so an unverified import cannot become counter advice.';

create unique index schemes_catalog_global_slug_idx
  on public.schemes_catalog (slug) where organization_id is null;
create unique index schemes_catalog_org_slug_idx
  on public.schemes_catalog (organization_id, slug) where organization_id is not null;
create index schemes_catalog_category_idx on public.schemes_catalog (category);
-- The hub's default view: what is open or opening, soonest deadline first.
create index schemes_catalog_window_idx
  on public.schemes_catalog (application_end_date, application_start_date)
  where is_published;

create trigger schemes_catalog_set_updated_at
  before update on public.schemes_catalog
  for each row execute function public.set_updated_at();

alter table public.schemes_catalog enable row level security;

-- Read: the published platform catalogue, plus everything belonging to your own organization
-- (drafts included — an owner has to be able to see the row they are still writing).
create policy schemes_catalog_select on public.schemes_catalog
  for select to authenticated
  using (
    (organization_id is null and is_published)
    or (organization_id is not null and public.is_org_member(organization_id))
  );

-- Write: your own organization's rows only, and only owners and managers. Editing a scheme
-- changes what every operator at the counter tells citizens, so it sits with org settings rather
-- than with day-to-day customer work. Platform rows are service_role only, by omission.
create policy schemes_catalog_write on public.schemes_catalog
  for all to authenticated
  using (organization_id is not null
         and public.has_org_role(organization_id, array['owner', 'manager']))
  with check (organization_id is not null
              and public.has_org_role(organization_id, array['owner', 'manager']));


-- ==========================================================================
-- Migration: 0021_platform_admin_and_scrapers.sql
-- ==========================================================================

-- =============================================================================
-- 0021  Platform admin roster, scraper sources/runs, and the scheme staging queue
-- Master spec §6.1 (platform roles), §19.5 (audit); docs/SECURITY.md §2
--
-- Everything in this file is *internal staff* infrastructure. Three rules shape it:
--
--   1. No tenancy column. These tables are not tenant data and must never be reachable through a
--      tenant's session. They carry `organization_id` nowhere, which is the clearest possible
--      statement that no RLS tenancy predicate applies.
--
--   2. No personal data. Scraper sources are public government notification pages; a queue row is
--      a claim about a published rule. Nothing here is subject to the retention, export or
--      erasure paths in 0008 — and nothing here should ever be given a column that would change
--      that.
--
--   3. RLS on, and no write policy for `authenticated`. Every table below is service_role-only
--      for writes, following `jobs` and `billing_webhook_events` in 0010. Authorization happens
--      server-side in the /admin route handlers (apps/web/lib/admin/context.ts), and RLS is the
--      second gate: a stolen or forged user JWT presented straight to PostgREST reaches none of
--      it, because there is no policy that could let it through.
--
-- The one exception is a self-read policy on `platform_admins`: a signed-in user may see their
-- OWN row and nobody else's. That keeps the roster of internal staff from being enumerable while
-- still letting a client learn whether it should render an "Admin" link.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform_admins — the roster of internal staff (§6.1)
--
-- Membership here grants panel access. It grants NO access to customer data: there is no path
-- from a row in this table to a `customers` row, and support access still runs through the
-- time-limited, reasoned, audited `support_access_grants` in 0008.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  -- Mirrors PLATFORM_ROLES in packages/core/src/auth/roles.ts. A membership carries exactly one
  -- role, as with organization_members.
  role        text not null
                check (role in ('super_admin', 'content_manager', 'scraper_operator',
                                'support_admin')),
  -- Denormalised from auth.users so the team screen can render without reading the auth schema.
  -- Internal staff addresses, not citizen data.
  email       text not null,
  -- Soft disable, so revoking access keeps the audit trail attached to a real row.
  is_active   boolean not null default true,
  notes       text check (notes is null or length(notes) <= 2000),
  granted_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.platform_admins is
  'Internal Assistigo staff with Super Admin panel access (spec §6.1). Grants no access to customer data — see support_access_grants.';
comment on column public.platform_admins.is_active is
  'Soft disable. Revoking sets this false rather than deleting, so audit rows keep pointing at a real roster entry.';

create index platform_admins_active_idx on public.platform_admins (role) where is_active;

create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helper: is the caller internal staff, optionally in one of these roles?
--
-- security definer so a policy can call it without the caller needing to read the roster (which
-- the self-read policy below deliberately forbids).
--
-- Not currently used by any policy — the panel authorises in the route handler and then uses the
-- service role. It exists because the alternative, when the first policy does need it, is
-- inlining a subquery against platform_admins into that policy, and role checks that live in two
-- places drift.
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin(roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and a.is_active
      and (roles is null or a.role = any (roles))
  );
$$;

comment on function public.is_platform_admin(text[]) is
  'True when the caller is active internal staff, optionally restricted to the given platform roles.';

-- -----------------------------------------------------------------------------
-- scraper_sources — what we watch
--
-- `fetcher` is the ingestion strategy, not a URL scheme:
--   manual   a person pastes a notification and it is parsed into a candidate
--   fixture  candidates come from config->'items'; used by seeds and tests
--   http     fetches source_url over the network, and only when the deployment has explicitly
--            enabled it (SCRAPER_HTTP_ENABLED). See apps/web/lib/admin/scraper/fetchers/http.ts.
--
-- source_url is constrained to https so a source can never be configured to read a plaintext or
-- file:// location. Spec §7.3 forbids scraping protected government data; these are public
-- notification pages, and the fetcher checks that again at request time.
-- -----------------------------------------------------------------------------
create table public.scraper_sources (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name                  text not null check (length(btrim(name)) between 1 and 120),
  portal_name           text not null check (length(btrim(portal_name)) between 1 and 120),
  source_url            text not null check (source_url like 'https://%'),
  fetcher               text not null default 'manual'
                          check (fetcher in ('manual', 'fixture', 'http')),
  is_enabled            boolean not null default true,
  -- A notification page is not a live feed. One hour is the floor and two weeks the ceiling.
  interval_minutes      int not null default 1440 check (interval_minutes between 60 and 20160),
  -- Fetcher-specific options. Entity ids, selectors and fixtures only — never credentials: a
  -- source that needs a login is a source we are not entitled to scrape.
  config                jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(config) = 'object'),
  last_run_at           timestamptz,
  last_status           text check (last_status in ('pending', 'running', 'succeeded', 'partial',
                                                    'failed', 'cancelled')),
  -- Drives the "unhealthy source" badge, and eventually an automatic disable.
  consecutive_failures  int not null default 0 check (consecutive_failures >= 0),
  notes                 text check (notes is null or length(notes) <= 2000),
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.scraper_sources is
  'Public government notification pages the ingestion pipeline watches. No credentials, no personal data.';
comment on column public.scraper_sources.config is
  'Fetcher options — selectors and fixtures. Never credentials: a source needing a login is one we may not scrape (spec §7.3).';

create index scraper_sources_due_idx on public.scraper_sources (last_run_at) where is_enabled;

create trigger scraper_sources_set_updated_at
  before update on public.scraper_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- scraper_runs — one row per execution, kept for the health history
-- -----------------------------------------------------------------------------
create table public.scraper_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.scraper_sources (id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'running', 'succeeded', 'partial', 'failed',
                                     'cancelled')),
  trigger        text not null default 'manual' check (trigger in ('manual', 'schedule')),
  triggered_by   uuid references auth.users (id) on delete set null,
  items_found    int not null default 0 check (items_found >= 0),
  items_staged   int not null default 0 check (items_staged >= 0),
  -- Found again, byte-identical to something already staged or already live.
  items_skipped  int not null default 0 check (items_skipped >= 0),
  -- Sanitised message only. A fetch error can quote a page, so the writer truncates and strips
  -- it (apps/web/lib/admin/scraper/run.ts) before it reaches this column.
  error_text     text check (error_text is null or length(error_text) <= 2000),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint scraper_runs_finished_when_terminal
    check (status in ('pending', 'running') or finished_at is not null)
);

create index scraper_runs_source_recent_idx
  on public.scraper_runs (source_id, started_at desc);

create trigger scraper_runs_set_updated_at
  before update on public.scraper_runs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- scraped_schemes_queue — the staging inbox
--
-- This table is the whole reason the pipeline is safe. Nothing a scraper produces is live: a
-- candidate lands here, is diffed against what is published, and a human approves the diff before
-- it becomes advice given at a counter. There is deliberately no auto-publish path and no
-- confidence threshold that bypasses review.
-- -----------------------------------------------------------------------------
create table public.scraped_schemes_queue (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.scraper_sources (id) on delete cascade,
  run_id              uuid references public.scraper_runs (id) on delete set null,

  -- The scheme this candidate is about. Slug rather than a foreign key, because the commonest
  -- candidate is for a scheme the catalogue has never seen.
  slug                text not null
                        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  category            text not null
                        check (category in ('recruitment', 'welfare', 'scholarship',
                                            'certificate', 'business_loan')),
  -- The live global row this would update, when there is one.
  target_scheme_id    uuid references public.schemes_catalog (id) on delete set null,

  -- The candidate, shaped like a SchemeDefinition minus its id. Re-validated with Zod on read
  -- (packages/core/src/platform/scraper.ts) exactly as schemes_catalog rows are.
  payload             jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- The computed diff against the live row at staging time, so the inbox renders without
  -- recomputing and a reviewer sees what the pipeline actually saw.
  proposed_changes    jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(proposed_changes) = 'array'),
  change_kind         text not null
                        check (change_kind in ('new', 'deadline_only', 'update', 'no_change')),

  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'superseded')),
  -- Advisory ordering only. Nothing publishes because this number is high.
  confidence          numeric(3, 2) not null default 0.50
                        check (confidence between 0 and 1),
  source_url          text not null check (source_url like 'https://%'),
  -- FNV-1a of the candidate's stable serialisation. Re-finding the same notification on the next
  -- poll must not produce a second inbox row.
  content_hash        text not null check (content_hash ~ '^[0-9a-f]{16}$'),
  fetcher_note        text check (fetcher_note is null or length(fetcher_note) <= 500),

  reviewed_by         uuid references auth.users (id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text check (review_note is null or length(review_note) <= 2000),
  -- Set on approval, so the inbox row points at what it became.
  published_scheme_id uuid references public.schemes_catalog (id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint scraped_queue_reviewed_has_reviewer
    check (status = 'pending' or status = 'superseded' or
           (reviewed_by is not null and reviewed_at is not null)),
  constraint scraped_queue_approved_has_scheme
    check (status <> 'approved' or published_scheme_id is not null)
);

comment on table public.scraped_schemes_queue is
  'Staging inbox for scraped scheme candidates. Nothing here is visible to tenants until a human approves it into schemes_catalog. No auto-publish path exists.';
comment on column public.scraped_schemes_queue.confidence is
  'Fetcher self-assessment, 0-1. Orders the inbox and decides nothing — there is no threshold above which a candidate publishes itself.';

-- One pending row per distinct candidate. A re-poll that finds the same notification bumps
-- nothing; a genuinely changed notification hashes differently and gets its own row.
create unique index scraped_queue_pending_hash_idx
  on public.scraped_schemes_queue (content_hash) where status = 'pending';
create index scraped_queue_inbox_idx
  on public.scraped_schemes_queue (status, created_at desc);
create index scraped_queue_slug_idx on public.scraped_schemes_queue (slug, status);
create index scraped_queue_source_idx on public.scraped_schemes_queue (source_id, created_at desc);

create trigger scraped_schemes_queue_set_updated_at
  before update on public.scraped_schemes_queue
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Scheduled scraping is a background job like any other.
-- -----------------------------------------------------------------------------
alter table public.jobs drop constraint jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('ocr.extract', 'document.derivative', 'retention.sweep',
                  'billing.aggregate', 'adapter.healthcheck', 'notification.send',
                  'data.export', 'data.delete', 'scraper.run'));

-- -----------------------------------------------------------------------------
-- platform_metrics — the analytics the panel renders
--
-- A single RPC rather than queries in the application, so that the whole surface of what internal
-- staff can learn about tenants is one reviewable function. Spec §6.1 lets internal roles see
-- organization metadata, usage and error reports; it does not let them see customer records.
--
-- Accordingly this returns COUNTS ONLY. There is no customer name, no mobile number, no document
-- title and no field value anywhere in the result, and the /admin pages have no other source of
-- tenant data (apps/web/lib/admin/metrics.ts). Adding a column here that identifies a citizen
-- would be a privacy regression, not a feature.
--
-- security definer + revoked from authenticated: only the service role may call it, and only
-- after the route handler has established that the caller is internal staff.
-- -----------------------------------------------------------------------------
create or replace function public.platform_metrics(window_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with span as (select (now() - make_interval(days => greatest(window_days, 1))) as since)
  select jsonb_build_object(
    'windowDays', greatest(window_days, 1),
    'generatedAt', now(),
    'tenants', jsonb_build_object(
      'total',     (select count(*) from public.organizations where deleted_at is null),
      'new',       (select count(*) from public.organizations, span
                     where deleted_at is null and created_at >= span.since),
      'active',    (select count(distinct organization_id) from public.fill_sessions, span
                     where created_at >= span.since),
      'byPlan',    (select coalesce(jsonb_object_agg(plan_code, plan_count), '{}'::jsonb)
                      from (select plan_code, count(*) as plan_count
                              from public.organizations
                             where deleted_at is null
                             group by plan_code) plans)
    ),
    'members', jsonb_build_object(
      'total',  (select count(*) from public.organization_members where status = 'active'),
      'byRole', (select coalesce(jsonb_object_agg(role, role_count), '{}'::jsonb)
                   from (select role, count(*) as role_count
                           from public.organization_members
                          where status = 'active'
                          group by role) roles)
    ),
    -- Volumes, never contents.
    'usage', jsonb_build_object(
      'customers',    (select count(*) from public.customers where deleted_at is null),
      'applications', (select count(*) from public.applications),
      'documents',    (select count(*) from public.documents where deleted_at is null),
      'fillSessions', (select count(*) from public.fill_sessions, span
                        where created_at >= span.since),
      'fieldsFilled', (select coalesce(sum(filled_fields_count), 0) from public.fill_sessions, span
                        where created_at >= span.since)
    ),
    -- The safety counters from 0006. Surfaced here so "we never fill these" is a number an owner
    -- can read off a dashboard rather than a claim in a document (spec §19.7).
    'safety', jsonb_build_object(
      'captchaFieldsSeen', (select coalesce(sum(captcha_fields_count), 0)
                              from public.fill_sessions, span where created_at >= span.since),
      'otpFieldsSeen',     (select coalesce(sum(otp_fields_count), 0)
                              from public.fill_sessions, span where created_at >= span.since),
      'paymentFieldsSeen', (select coalesce(sum(payment_fields_count), 0)
                              from public.fill_sessions, span where created_at >= span.since)
    ),
    'jobs', jsonb_build_object(
      'pending',   (select count(*) from public.jobs where status in ('pending', 'retry')),
      'running',   (select count(*) from public.jobs where status = 'running'),
      'failed',    (select count(*) from public.jobs, span
                     where status = 'failed' and created_at >= span.since),
      'completed', (select count(*) from public.jobs, span
                     where status = 'completed' and created_at >= span.since)
    ),
    'catalog', jsonb_build_object(
      'globalSchemes',    (select count(*) from public.schemes_catalog where organization_id is null),
      'publishedSchemes', (select count(*) from public.schemes_catalog
                            where organization_id is null and is_published),
      'closingSoon',      (select count(*) from public.schemes_catalog
                            where organization_id is null and is_published
                              and application_end_date is not null
                              and application_end_date between current_date
                                                           and current_date + 7),
      -- A published window that has already lapsed is the catalogue's most damaging state: a
      -- centre is being shown a countdown for a form nobody can submit.
      'expired',          (select count(*) from public.schemes_catalog
                            where organization_id is null and is_published
                              and application_end_date is not null
                              and application_end_date < current_date),
      'globalAdapters',   (select count(*) from public.portal_adapters where organization_id is null),
      'activeAdapters',   (select count(*) from public.portal_adapters
                            where organization_id is null and status = 'active')
    ),
    'scrapers', jsonb_build_object(
      'sources',      (select count(*) from public.scraper_sources),
      'enabled',      (select count(*) from public.scraper_sources where is_enabled),
      'unhealthy',    (select count(*) from public.scraper_sources where consecutive_failures >= 3),
      'queuePending', (select count(*) from public.scraped_schemes_queue where status = 'pending'),
      'queueApproved',(select count(*) from public.scraped_schemes_queue, span
                        where status = 'approved' and reviewed_at >= span.since),
      'queueRejected',(select count(*) from public.scraped_schemes_queue, span
                        where status = 'rejected' and reviewed_at >= span.since)
    )
  );
$$;

comment on function public.platform_metrics(int) is
  'Aggregate platform analytics for the Super Admin panel. Counts only — returns no customer name, contact, document or field value (spec §6.1).';

revoke execute on function public.platform_metrics(int) from public, authenticated, anon;
grant execute on function public.platform_metrics(int) to service_role;

-- -----------------------------------------------------------------------------
-- platform_tenant_rows — the tenant list, metadata and volumes only
--
-- Same contract as platform_metrics: organization metadata plus counts. No join reaches a
-- customer, document or field-value row, so there is no shape of this result that leaks a
-- citizen. Ordered and paged in SQL because the tenant list is the one admin screen that grows
-- without bound.
-- -----------------------------------------------------------------------------
create or replace function public.platform_tenant_rows(
  search text default null,
  row_limit int default 50,
  row_offset int default 0
)
returns table (
  id uuid,
  name text,
  business_type text,
  city text,
  state text,
  plan_code text,
  created_at timestamptz,
  member_count bigint,
  customer_count bigint,
  application_count bigint,
  fill_sessions_30d bigint,
  last_activity_at timestamptz
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
    (select count(*) from public.organization_members m
      where m.organization_id = o.id and m.status = 'active'),
    (select count(*) from public.customers c
      where c.organization_id = o.id and c.deleted_at is null),
    (select count(*) from public.applications a where a.organization_id = o.id),
    (select count(*) from public.fill_sessions f
      where f.organization_id = o.id and f.created_at >= now() - interval '30 days'),
    (select max(f.created_at) from public.fill_sessions f where f.organization_id = o.id)
  from public.organizations o
  where o.deleted_at is null
    and (search is null or btrim(search) = '' or o.name ilike '%' || btrim(search) || '%')
  order by o.created_at desc
  limit greatest(least(row_limit, 200), 1)
  offset greatest(row_offset, 0);
$$;

comment on function public.platform_tenant_rows(text, int, int) is
  'Tenant list for the Super Admin panel: organization metadata and volume counts only (spec §6.1).';

revoke execute on function public.platform_tenant_rows(text, int, int)
  from public, authenticated, anon;
grant execute on function public.platform_tenant_rows(text, int, int) to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- All four tables: RLS on, no write policy for `authenticated`. The panel authorises in the route
-- handler and then acts with the service role, which bypasses RLS — so the absence of policies
-- here is the second gate, not an oversight. It means a user JWT presented directly to PostgREST
-- can read and write none of this, whatever the application layer believes.
-- -----------------------------------------------------------------------------
alter table public.platform_admins        enable row level security;
alter table public.scraper_sources        enable row level security;
alter table public.scraper_runs           enable row level security;
alter table public.scraped_schemes_queue  enable row level security;

-- The single exception: you may read your own roster row, and nobody else's. This lets a client
-- learn "am I staff?" without the roster of internal staff being enumerable by any signed-in user.
create policy platform_admins_select_self on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));


-- ==========================================================================
-- Migration: 0022_document_drop_bot.sql
-- ==========================================================================

-- =============================================================================
-- 0022  Walk-in document drop: intake sessions and inbound files
-- Master spec §9.1 (walk-in intake), §12 (documents), §19.3 (private storage),
-- §12.7 (retention); docs/SECURITY.md §2, §4
--
-- A walk-in citizen sends their Aadhaar, marksheet and photo to the centre over WhatsApp,
-- Telegram or a plain mobile browser page. Those files land here first — in a staging area the
-- operator has to claim — and only become `documents` when the operator presses Intake, which
-- is also the moment a `customers` row appears. Three properties shape the schema:
--
--   1. Staging, not storage. A drop session is unclaimed intake, so it carries an `expires_at`
--      and is swept away two hours later (see `purge_expired_document_drops` below). Nothing
--      here is part of the customer record until conversion copies it across.
--
--   2. `sender_id` is personal data, held on purpose. It is the number the citizen messaged
--      from, and pre-filling it is the entire time saving this feature exists for. It must never
--      reach a log line, an error report or an audit metadata blob (§19.6) — the application
--      side enforces that through packages/core/src/privacy/redact.ts.
--
--   3. The webhook has no session. Meta and Telegram present no user JWT, so intake writes run
--      with the service role and RLS is the second gate for the dashboard side only — the same
--      split as `billing_webhook_events` in 0010.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations.counter_drop_code — the permanent code on a printed counter standee
--
-- Distinct from a session code: a laminated tent card cannot be reissued every fifteen minutes,
-- so this one never expires and mints a fresh session on each inbound "START <code>". Unique
-- across the platform because a citizen's message resolves to exactly one centre.
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column counter_drop_code text
    check (counter_drop_code is null or counter_drop_code ~ '^[A-Z0-9]{4,12}$');

alter table public.organizations
  add constraint organizations_counter_drop_code_key unique (counter_drop_code);

comment on column public.organizations.counter_drop_code is
  'Permanent code printed on the counter standee. Resolves an inbound message to this centre and mints a new drop session (spec 9.1).';

-- -----------------------------------------------------------------------------
-- document_drop_sessions
-- -----------------------------------------------------------------------------
create table public.document_drop_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,

  -- Short, readable, and printed on screen next to the QR so an operator can say it out loud.
  session_code     text not null check (session_code ~ '^[A-Z0-9-]{4,24}$'),
  channel          text not null check (channel in ('whatsapp', 'telegram', 'web')),

  -- The citizen's WhatsApp number / Telegram chat id, normalised by the application layer.
  -- Personal data (see header note 2).
  sender_id        text check (sender_id is null or length(sender_id) <= 64),
  sender_name      text check (sender_name is null or length(sender_name) <= 120),

  status           text not null default 'active'
                     check (status in ('active', 'ready', 'converted', 'expired', 'abandoned')),
  customer_id      uuid references public.customers (id) on delete set null,

  -- Channel bookkeeping only — never a customer value.
  metadata         jsonb not null default '{}'::jsonb,

  created_by       uuid references auth.users (id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '2 hours'),
  converted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.document_drop_sessions is
  'Unclaimed walk-in intake. Becomes a customer + documents only when an operator converts it; swept after two hours otherwise (spec 12.7).';

comment on column public.document_drop_sessions.sender_id is
  'The citizen messaging identifier (phone number or chat id). Personal data: never log it, never put it in audit metadata (19.6).';

-- A code only has to be unambiguous while it can still be messaged. Restricting uniqueness to
-- live sessions keeps the short four-digit format usable instead of exhausting it over months.
create unique index document_drop_sessions_live_code_key
  on public.document_drop_sessions (session_code)
  where status in ('active', 'ready');

create index document_drop_sessions_queue_idx
  on public.document_drop_sessions (organization_id, status, created_at desc);

create index document_drop_sessions_expiry_idx
  on public.document_drop_sessions (expires_at)
  where status in ('active', 'ready');

create trigger document_drop_sessions_set_updated_at
  before update on public.document_drop_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- document_drop_files
--
-- Mirrors the shape of `documents` deliberately: same bucket, same MIME allow-list, same 15 MB
-- ceiling, same org-scoped path rule. Conversion is then a copy between two rows that agree on
-- what a file is, with no revalidation gap in between.
-- -----------------------------------------------------------------------------
create table public.document_drop_files (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null references public.document_drop_sessions (id) on delete cascade,
  organization_id         uuid not null references public.organizations (id) on delete cascade,

  original_filename       text not null,
  storage_bucket          text not null default 'customer-documents',
  storage_path            text not null,
  mime_type               text not null
                            check (mime_type in ('image/jpeg', 'image/png', 'image/webp',
                                                 'application/pdf')),
  size_bytes              bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  sha256                  text,

  -- The citizen's own hint (a WhatsApp caption, or the button they tapped on the web page).
  -- A starting point for the operator, never a decision: classification still runs on intake.
  suggested_document_type text not null default 'unknown'
                            check (suggested_document_type in (
                              'aadhaar_like', 'pan', 'voter_id', 'marksheet_10', 'marksheet_12',
                              'marksheet_graduation', 'caste_certificate', 'income_certificate',
                              'residence_certificate', 'photo', 'signature', 'receipt',
                              'application_pdf', 'generic', 'unknown')),

  converted_document_id   uuid references public.documents (id) on delete set null,
  created_at              timestamptz not null default now(),

  unique (organization_id, storage_bucket, storage_path)
);

alter table public.document_drop_files
  add constraint document_drop_files_path_is_org_scoped
  check (storage_path like ('org/' || organization_id::text || '/%'));

create index document_drop_files_session_idx
  on public.document_drop_files (session_id, created_at);

comment on table public.document_drop_files is
  'One inbound file in a drop session. Promoted into documents on conversion; deleted with its session otherwise.';

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Read/write roles follow `documents` in 0010: viewers may look at the queue, operators may
-- work it, and only owners/managers may delete. Webhook intake carries no user JWT and so is
-- reached by none of these policies — it runs as the service role.
-- -----------------------------------------------------------------------------
alter table public.document_drop_sessions enable row level security;
alter table public.document_drop_files    enable row level security;

create policy document_drop_sessions_select on public.document_drop_sessions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy document_drop_sessions_insert on public.document_drop_sessions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_drop_sessions_update on public.document_drop_sessions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_drop_sessions_delete on public.document_drop_sessions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

create policy document_drop_files_select on public.document_drop_files
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer']));

create policy document_drop_files_insert on public.document_drop_files
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_drop_files_update on public.document_drop_files
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy document_drop_files_delete on public.document_drop_files
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

-- -----------------------------------------------------------------------------
-- purge_expired_document_drops — housekeeping for intake nobody claimed (§12.7)
--
-- Two steps, in this order and not the other one:
--
--   1. Mark stale live sessions `expired`. This is what closes the race with an operator
--      pressing Intake at the same moment: conversion only accepts an `active` or `ready`
--      session, so once a session is marked it can no longer be claimed and its bytes are safe
--      to remove.
--   2. Delete every session already marked `expired` or `abandoned`, cascading to its files.
--
-- Storage objects are NOT removed here. Postgres cannot delete from the storage backend, and
-- dropping rows out of `storage.objects` would leave the bytes orphaned in the bucket. The
-- sweep in apps/web/lib/document-drop/purge.ts marks, removes the objects, then calls this
-- function for the rows — which is also why step 1 is idempotent and safe to run twice.
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_document_drops()
returns table (expired_count int, deleted_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  marked  int;
  removed int;
begin
  update public.document_drop_sessions
     set status = 'expired'
   where status in ('active', 'ready')
     and expires_at < now();
  get diagnostics marked = row_count;

  delete from public.document_drop_sessions
   where status in ('expired', 'abandoned');
  get diagnostics removed = row_count;

  return query select marked, removed;
end;
$$;

revoke execute on function public.purge_expired_document_drops() from public;
grant execute on function public.purge_expired_document_drops() to service_role;

comment on function public.purge_expired_document_drops() is
  'Marks stale drop sessions expired, then deletes expired/abandoned ones. Storage objects are removed by the application sweep before this runs.';


-- ==========================================================================
-- Migration: 0023_platform_channel_settings.sql
-- ==========================================================================

-- =============================================================================
-- 0023  Platform channel settings: WhatsApp and Telegram bot configuration
-- Master spec §9.1 (walk-in intake), §6.1 (platform roles); docs/DEVELOPMENT_RULES.md §5
--
-- Today the WhatsApp Cloud API and Telegram Bot API credentials that power walk-in document
-- drop (0022) live only in deployment environment variables. This table lets a Super Admin
-- configure them from the browser instead, without editing `.env` or redeploying on key
-- rotation. It is deliberately shaped after `organization_ai_settings` (0017):
--
--   * `access_token_encrypted`, `app_secret_encrypted` and `bot_token_encrypted` are
--     AES-256-GCM ciphertext (packages/core/src/privacy/crypto.ts), never plaintext. The
--     application layer never returns a decrypted secret to a client — only whether one is set.
--   * This is platform (deployment-wide) configuration, not tenant configuration: every centre
--     shares one WhatsApp number and one Telegram bot, so — like `platform_admins` in 0021 —
--     there is no `organization_id` here and RLS grants nothing to `authenticated`. Only the
--     service role reads or writes this table; the admin API enforces
--     `platform.team.manage` (owner-tier) before it ever reaches that client.
--   * A row existing here does not obligate its use: `apps/web/lib/document-drop/whatsapp.ts`
--     and `telegram.ts` check this table first and fall back to environment variables when a
--     channel has no row or is disabled, so an existing env-configured deployment is unaffected
--     until a Super Admin explicitly saves a row.
-- =============================================================================

create table public.platform_channel_settings (
  channel                  text primary key check (channel in ('whatsapp', 'telegram')),
  is_enabled               boolean not null default false,

  -- WhatsApp: phoneNumberId, botNumber, verifyToken live here in the clear (none is a secret on
  -- its own — the phone number is printed on the standee, the verify token only authenticates
  -- Meta's one-time handshake). Telegram: botUsername, webhookSecret.
  config                   jsonb not null default '{}'::jsonb,

  -- v1.<iv>.<tag>.<ciphertext> — see packages/core/src/privacy/crypto.ts. Never plaintext.
  access_token_encrypted   text,  -- WhatsApp Graph API token
  app_secret_encrypted     text,  -- WhatsApp X-Hub-Signature-256 secret
  bot_token_encrypted      text,  -- Telegram bot token

  updated_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.platform_channel_settings is
  'Deployment-wide WhatsApp/Telegram bot configuration, editable from the Super Admin panel. Service role only — see header note.';
comment on column public.platform_channel_settings.access_token_encrypted is
  'AES-256-GCM ciphertext. Plaintext is never stored and never returned to a client (docs/SECURITY.md §4).';
comment on column public.platform_channel_settings.app_secret_encrypted is
  'AES-256-GCM ciphertext. Plaintext is never stored and never returned to a client (docs/SECURITY.md §4).';
comment on column public.platform_channel_settings.bot_token_encrypted is
  'AES-256-GCM ciphertext. Plaintext is never stored and never returned to a client (docs/SECURITY.md §4).';

alter table public.platform_channel_settings enable row level security;

create trigger platform_channel_settings_set_updated_at
  before update on public.platform_channel_settings
  for each row execute function public.set_updated_at();

-- No policies for `authenticated` or `anon`: this table is reached only through the service-role
-- client in apps/web/lib/admin/channels/service.ts and the document-drop channel adapters, both
-- gated in application code (the admin API requires `platform.team.manage` before it ever opens
-- that client — same shape as platform_admins in 0021).


-- ==========================================================================
-- Migration: 0024_roaming_customers_and_access_grants.sql
-- ==========================================================================

-- =============================================================================
-- 0024  Cross-operator roaming access: links, consent challenges, time-boxed grants
-- Master spec §11 (customers), §19.2 (consent), §19.5 (audit), §19.9 (time-boxed access);
-- docs/SECURITY.md §2, §4; DPDP Act 2023
--
-- A citizen registered at their home centre walks into a different centre in another town. That
-- centre must be able to (a) find them, (b) tell them which schemes they qualify for, and
-- (c) — only with the citizen's own consent, proved by an OTP sent to their phone — read the
-- profile and documents needed to fill a form. Then the door shuts again on a timer.
--
-- Four properties shape everything below.
--
--   1. Linking grants nothing. `customer_roaming_links` is a bookmark: it says this centre has
--      served this person. It appears in NO policy predicate. Every read of another tenant's
--      customer row, field values or documents still requires an active grant, so the worst case
--      for a leaked customer id is a row in a join table.
--
--   2. The pre-auth view is not RLS-shaped. What Operator B may see before consent is a masked
--      projection — "Rahul K.", the last four digits, age, category, state, which document types
--      are on file — and RLS is row-level, not column-level. So there is no policy that lets a
--      merely-linked operator select `customers`; the projection is built server-side by
--      apps/web/lib/roaming/, which authorises first and then reads through
--      `roaming_customer_search()` below. Same shape as the Super Admin panel's
--      `platform_tenant_rows()` in 0021.
--
--   3. The OTP never passes through a user session. `customer_access_challenges` holds a salted
--      hash of a six-digit code — brute-forceable in microseconds by anyone who can read the
--      row. It therefore has RLS enabled and no policy at all: only the service role touches it,
--      from the route handler that generates the code and hands it to WhatsApp. An operator who
--      could read or mint a challenge could grant themselves access without the citizen ever
--      being asked, which is the one failure this whole feature exists to prevent. For the same
--      reason `customer_access_grants` has no insert or update policy either.
--
--   4. A grant is time-boxed and self-cancelling. `expires_at` is capped at 12 hours by a check
--      constraint, the policies compare against `now()` rather than a swept status column, and
--      `expire_roaming_access_grants()` only tidies the label afterwards. Access ends when the
--      clock says so, whether or not any sweep has run.
--
-- Note on §14.5 and DEVELOPMENT_RULES rule 3 ("Assistigo never retrieves or auto-enters an
-- OTP"): that rule is about a government portal's OTP, and it is untouched — the form engine
-- still refuses to fill an OTP field. The code here is Assistigo's own consent challenge,
-- generated by this system, read aloud by the citizen from their own phone, and typed by the
-- operator.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- consent_records gains a subject for this feature
--
-- DPDP consent is purpose-specific (§19.2): "another centre may see my saved profile for the
-- next two hours" is a different thing from "Assistigo may store my documents" or "an AI vendor
-- may read my documents", so it gets its own value rather than being folded into
-- 'customer_data'. Default-named constraint from 0008, dropped and recreated with the same three
-- values plus this one.
-- -----------------------------------------------------------------------------
alter table public.consent_records drop constraint consent_records_consent_subject_check;
alter table public.consent_records add constraint consent_records_consent_subject_check
  check (consent_subject in ('customer_data', 'document_storage', 'ai_processing', 'roaming_access'));

-- -----------------------------------------------------------------------------
-- customer_roaming_links — "this centre has served this person"
--
-- organization_id is the visiting centre. The customer row stays owned by, and counted against,
-- the home centre: roaming does not copy a citizen's record around the country.
-- -----------------------------------------------------------------------------
create table public.customer_roaming_links (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  customer_id      uuid not null references public.customers (id) on delete cascade,
  linked_by        uuid references auth.users (id) on delete set null,
  notes            text check (notes is null or length(notes) <= 500),
  last_served_at   timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  unique (organization_id, customer_id)
);

comment on table public.customer_roaming_links is
  'A visiting centre has served a customer registered elsewhere. A bookmark only: it appears in no RLS predicate and grants no access to the record (0024 header note 1).';
comment on column public.customer_roaming_links.organization_id is
  'The visiting centre. The customer row remains owned by their home centre.';

create index customer_roaming_links_org_idx
  on public.customer_roaming_links (organization_id, last_served_at desc);
create index customer_roaming_links_customer_idx
  on public.customer_roaming_links (customer_id);

-- A centre cannot roam-link its own customer: that would put the same person in two lists and
-- make "roaming" mean nothing. Needs a subquery, so it is a trigger rather than a check.
create or replace function public.reject_self_roaming_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'ASSISTIGO_ROAMING_LINK_SAME_ORG: this customer already belongs to this centre'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger customer_roaming_links_reject_self
  before insert or update on public.customer_roaming_links
  for each row execute function public.reject_self_roaming_link();

-- -----------------------------------------------------------------------------
-- customer_access_grants — the consent window itself
--
-- One row per "the citizen said yes, at this counter, for this long". It is the only thing in
-- the schema that lets a session reach across a tenant boundary, so it names all four parties:
-- who was granted access, on behalf of which centre, over whose record, and why.
-- -----------------------------------------------------------------------------
create table public.customer_access_grants (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  -- The visiting centre. Deliberately not the customer's home organization.
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  granted_to_user_id uuid not null references auth.users (id) on delete cascade,

  purpose            text not null default 'form_filling'
                       check (purpose in ('form_filling', 'scheme_application',
                                          'profile_update', 'document_access')),
  -- The scheme the citizen agreed to, e.g. 'ssc-gd-constable-2026'. Recorded because consent is
  -- given for a purpose, not in general (§19.2). Not a foreign key: a centre's own scheme row
  -- may be edited or removed and the consent record must survive it unchanged.
  target_scheme_slug text check (target_scheme_slug is null
                                 or target_scheme_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  status             text not null default 'active'
                       check (status in ('active', 'expired', 'revoked')),
  auth_method        text not null default 'otp'
                       check (auth_method in ('otp', 'qr_consent', 'biometric')),

  granted_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  revoked_by         uuid references auth.users (id) on delete set null,

  -- DPDP 2023: the consent this grant rests on, written in the same flow (§19.2).
  consent_record_id  uuid references public.consent_records (id) on delete set null,
  ip_address         inet,
  user_agent         text,
  created_at         timestamptz not null default now(),

  -- The ceiling is the point. A counter queue and a form-filling cycle fit inside a few hours;
  -- anything longer is standing access to another tenant's citizen, which this is not.
  constraint customer_access_grants_is_time_boxed
    check (expires_at > granted_at and expires_at <= granted_at + interval '12 hours'),
  constraint customer_access_grants_revoked_has_timestamp
    check (status <> 'revoked' or revoked_at is not null)
);

comment on table public.customer_access_grants is
  'A time-boxed, consent-backed window in which one operator may read one customer registered at another centre. Written only by the service role, after an OTP the citizen read off their own phone (0024 header note 3).';
comment on column public.customer_access_grants.expires_at is
  'Hard ceiling of 12 hours from granted_at. Policies compare against now(), so access ends on the clock whether or not the sweep has run.';

-- The index the policy predicate uses: does this user hold a live grant over this customer?
create index customer_access_grants_live_idx
  on public.customer_access_grants (granted_to_user_id, customer_id, expires_at)
  where status = 'active' and revoked_at is null;
create index customer_access_grants_customer_idx
  on public.customer_access_grants (customer_id, granted_at desc);
create index customer_access_grants_org_idx
  on public.customer_access_grants (organization_id, granted_at desc);
create index customer_access_grants_sweep_idx
  on public.customer_access_grants (expires_at) where status = 'active';

-- -----------------------------------------------------------------------------
-- customer_access_challenges — the outstanding OTP
--
-- RLS is enabled and there is no policy, for any role, ever. See header note 3.
-- -----------------------------------------------------------------------------
create table public.customer_access_challenges (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  requested_by       uuid not null references auth.users (id) on delete cascade,

  purpose            text not null default 'form_filling'
                       check (purpose in ('form_filling', 'scheme_application',
                                          'profile_update', 'document_access')),
  target_scheme_slug text check (target_scheme_slug is null
                                 or target_scheme_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- What the citizen was told they were agreeing to. The grant minted from this challenge may
  -- not be longer, so the operator cannot widen the window after the fact.
  duration_minutes   int not null default 120 check (duration_minutes between 15 and 720),
  channel            text not null default 'whatsapp' check (channel in ('whatsapp', 'sms')),

  -- Per-row random salt plus the HMAC of the code. Never the code.
  otp_salt           text not null check (length(otp_salt) between 16 and 128),
  otp_hash           text not null check (otp_hash ~ '^[0-9a-f]{64}$'),
  attempts_left      smallint not null default 5 check (attempts_left >= 0),

  expires_at         timestamptz not null default (now() + interval '5 minutes'),
  consumed_at        timestamptz,
  created_at         timestamptz not null default now(),

  constraint customer_access_challenges_is_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

comment on table public.customer_access_challenges is
  'An outstanding consent OTP. RLS on, no policy for any role: the row holds a hash of a six-digit code, and whoever can read it can grant themselves access without asking the citizen (0024 header note 3).';
comment on column public.customer_access_challenges.otp_hash is
  'HMAC-SHA256 of the code under otp_salt, written by apps/web/lib/roaming/otp.ts. The code itself exists only in the outbound WhatsApp message.';

create index customer_access_challenges_open_idx
  on public.customer_access_challenges (customer_id, requested_by, created_at desc)
  where consumed_at is null;
create index customer_access_challenges_sweep_idx
  on public.customer_access_challenges (expires_at);

-- =============================================================================
-- Security helpers
-- =============================================================================

-- Does the caller hold a live grant over this customer? The predicate every roaming policy
-- below is built from. security definer so a policy can call it without the caller needing to
-- read customer_access_grants.
create or replace function public.has_active_customer_grant(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_access_grants g
    where g.customer_id = p_customer_id
      and g.granted_to_user_id = auth.uid()
      and g.status = 'active'
      and g.revoked_at is null
      and g.expires_at > now()
  );
$$;

comment on function public.has_active_customer_grant(uuid) is
  'True when the calling user holds an unexpired, unrevoked roaming access grant over this customer. Compares against now(), so a grant lapses on its own.';

revoke execute on function public.has_active_customer_grant(uuid) from public;
grant execute on function public.has_active_customer_grant(uuid) to authenticated, service_role;

-- The full read test: a working member of the customer's home centre, or a live grant holder.
-- viewer is excluded to match customer_field_values in 0010 — the roles that may read a
-- citizen's field-level record are the ones that may act on it.
create or replace function public.has_customer_access(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.customers c
      where c.id = p_customer_id
        and public.has_org_role(c.organization_id, array['owner', 'manager', 'operator'])
    )
    or public.has_active_customer_grant(p_customer_id);
$$;

comment on function public.has_customer_access(uuid) is
  'Home-centre member (owner/manager/operator) or live roaming grant holder. The application-side gate; the RLS policies spell the same test out inline so each stays readable on its own.';

revoke execute on function public.has_customer_access(uuid) from public;
grant execute on function public.has_customer_access(uuid) to authenticated, service_role;

-- Has any centre the caller belongs to bookmarked this customer? Display state only — never an
-- access test (header note 1).
create or replace function public.has_customer_roaming_link(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_roaming_links l
    join public.organization_members m on m.organization_id = l.organization_id
    where l.customer_id = p_customer_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.has_customer_roaming_link(uuid) is
  'Display state only: one of the caller centres has served this customer before. Grants nothing — see has_active_customer_grant.';

revoke execute on function public.has_customer_roaming_link(uuid) from public;
grant execute on function public.has_customer_roaming_link(uuid) to authenticated, service_role;

-- =============================================================================
-- Row Level Security for the new tables
--
-- Writes are service-role-only on all three, by omission:
--   * a link insert has to check a row in another tenant, which the caller cannot see;
--   * a grant insert is the consent decision itself and must not be self-served;
--   * a challenge is a hashed secret nobody but the server may touch.
-- Authorization for all three happens in apps/web/lib/roaming/, before the service role is
-- reached — the same split as the Super Admin panel (docs/SECURITY.md §2).
-- =============================================================================

alter table public.customer_roaming_links      enable row level security;
alter table public.customer_access_grants      enable row level security;
alter table public.customer_access_challenges  enable row level security;

-- A centre sees its own bookmarks; a home centre sees who has been serving its citizens.
create policy customer_roaming_links_select on public.customer_roaming_links
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    or exists (
      select 1 from public.customers c
      where c.id = customer_id and public.is_org_member(c.organization_id)
    )
  );

-- The grantee sees their own sessions; the visiting centre's owners and managers see what their
-- staff were granted; the home centre sees every grant over its own citizens, because "who has
-- been given access to my customer" is the question a data fiduciary has to be able to answer.
create policy customer_access_grants_select on public.customer_access_grants
  for select to authenticated
  using (
    granted_to_user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'manager'])
    or exists (
      select 1 from public.customers c
      where c.id = customer_id
        and public.has_org_role(c.organization_id, array['owner', 'manager', 'operator'])
    )
  );

-- customer_access_challenges: no policy. Deliberate. See header note 3.

-- =============================================================================
-- Existing policies gain the roaming-grant path
--
-- Each is dropped and recreated rather than patched, so the whole predicate stays readable in
-- one place. Nothing already permitted is removed: every clause below is the 0010 predicate
-- with one `or` added.
-- =============================================================================

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or public.has_support_access(organization_id, 'customer_records')
    -- Roaming: the whole row, but only inside a live consent window. A merely-linked centre
    -- reaches nothing here — the masked pre-auth card is built server-side instead.
    or public.has_active_customer_grant(id)
  );

drop policy if exists customer_field_values_select on public.customer_field_values;
create policy customer_field_values_select on public.customer_field_values
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or public.has_support_access(organization_id, 'customer_records')
    or public.has_active_customer_grant(customer_id)
  );

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or public.has_support_access(organization_id, 'documents')
    or (customer_id is not null and public.has_active_customer_grant(customer_id))
  );

drop policy if exists document_derivatives_select on public.document_derivatives;
create policy document_derivatives_select on public.document_derivatives
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator', 'viewer'])
    or (customer_id is not null and public.has_active_customer_grant(customer_id))
  );

-- document_extractions is deliberately NOT opened. It carries raw OCR text — the whole document,
-- not the fields a human accepted — and a visiting centre filling a form needs the confirmed
-- profile and the files, never the unreviewed transcript.

-- -----------------------------------------------------------------------------
-- Storage: the bytes behind a grant
--
-- A signed URL is minted with the caller's own client, so it is subject to these policies. The
-- 0010 policy asks "are you a member of the organization in the object's path", which a visiting
-- operator is not. This adds the one other way in: an object that a row the caller may read
-- points at, where that row belongs to a customer they hold a live grant over.
-- -----------------------------------------------------------------------------
create policy "assistigo roaming documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('customer-documents', 'prepared-files')
    and (
      exists (
        select 1 from public.documents d
        where d.storage_bucket = storage.objects.bucket_id
          and d.storage_path = storage.objects.name
          and d.deleted_at is null
          and d.customer_id is not null
          and public.has_active_customer_grant(d.customer_id)
      )
      or exists (
        select 1 from public.document_derivatives v
        where v.storage_bucket = storage.objects.bucket_id
          and v.storage_path = storage.objects.name
          and v.customer_id is not null
          and public.has_active_customer_grant(v.customer_id)
      )
    )
  );

-- =============================================================================
-- roaming_customer_search — the platform-wide lookup by mobile
--
-- The one query in the product that crosses every tenant boundary at once, so it is pinned here
-- where it can be reviewed rather than assembled in application code:
--
--   * Exact ten digits only. A prefix or name search across the platform would be a directory of
--     every citizen the product has ever served; an exact number is something the person
--     standing at the counter just told the operator.
--   * Service role only. authenticated cannot execute it, so no browser holding an operator's
--     JWT can call it through PostgREST. The route handler authorises first
--     (apps/web/lib/roaming/service.ts) and masks the result before it leaves the server.
--   * Returns the columns the masked card and the scheme evaluator need, and no others. There is
--     no address, no father's name, no encrypted value and no identity fragment beyond what
--     identity_summary_json already holds masked.
-- =============================================================================
create or replace function public.roaming_customer_search(
  p_mobile text,
  p_exclude_organization_id uuid default null,
  p_limit int default 5
)
returns table (
  customer_id           uuid,
  home_organization_id  uuid,
  full_name             text,
  mobile                text,
  district              text,
  state                 text,
  date_of_birth         date,
  gender                text,
  category              text,
  education_json        jsonb,
  certificates_json     jsonb,
  identity_summary_json jsonb,
  verification_status   text,
  created_at            timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with needle as (
    select public.normalize_mobile(p_mobile) as digits
  )
  select
    c.id,
    c.organization_id,
    c.full_name,
    c.mobile,
    coalesce(
      c.address_json -> 'permanent' ->> 'district',
      c.address_json -> 'current' ->> 'district'
    ),
    coalesce(
      c.address_json -> 'permanent' ->> 'state',
      c.address_json -> 'current' ->> 'state'
    ),
    c.date_of_birth,
    c.gender,
    c.category,
    c.education_json,
    c.certificates_json,
    c.identity_summary_json,
    c.verification_status,
    c.created_at
  from public.customers c
  cross join needle n
  where c.deleted_at is null
    and length(n.digits) = 10
    and c.mobile_normalized = n.digits
    and (p_exclude_organization_id is null or c.organization_id <> p_exclude_organization_id)
  order by c.updated_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

comment on function public.roaming_customer_search(text, uuid, int) is
  'Platform-wide lookup by exact ten-digit mobile. Service role only; the caller must authorise first and mask before responding (0024 header note 2).';

revoke execute on function public.roaming_customer_search(text, uuid, int) from public;
revoke execute on function public.roaming_customer_search(text, uuid, int) from authenticated;
grant execute on function public.roaming_customer_search(text, uuid, int) to service_role;

-- =============================================================================
-- roaming_linked_customers — a centre's own roaming list, already masked
--
-- Same reasoning as above: RLS cannot express "these columns of another tenant's row", so the
-- projection is a function. Unlike the search this one is safe for authenticated, because it
-- returns nothing but the caller's own bookmarks and every value in it is already masked or
-- non-identifying.
-- =============================================================================
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
    split_part(btrim(c.full_name), ' ', 1),
    -- First letter of the last word, so the operator can tell two Rahuls apart without the
    -- centre learning a family name it has no consent for.
    nullif(left(split_part(reverse(btrim(c.full_name)), ' ', 1), 1), ''),
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
    -- Authorisation, inside the definer: membership of the centre being listed.
    and public.is_org_member(p_organization_id)
  order by l.last_served_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.roaming_linked_customers(uuid, int, int) is
  'The visiting centre roaming list: given name, family initial, last four digits, district and live-session state. Never a full name, number or address.';

revoke execute on function public.roaming_linked_customers(uuid, int, int) from public;
grant execute on function public.roaming_linked_customers(uuid, int, int) to authenticated, service_role;

-- =============================================================================
-- roaming_customer_card — the pre-auth projection, by id — service role only
--
-- What the customer detail page and the roaming access-state route call once they already know
-- *which* customer, as opposed to `roaming_customer_search`, which is how the id was learned in
-- the first place.
--
-- Service role only, deliberately NOT granted to `authenticated`, and the caller is passed in as
-- a parameter rather than read from `auth.uid()`. The obvious design — grant it to `authenticated`
-- and let the definer check `has_customer_roaming_link()` / `has_active_customer_grant()` against
-- `auth.uid()` — was tried and rejected: this function returns the *raw* full name, mobile and
-- education/certificate JSON (annual income, disability percentage, marksheet numbers), because
-- masking those into a display string is `apps/web/lib/roaming/card.ts`'s job, not SQL's. Granting
-- that to `authenticated` would let any member of a centre that has ever bookmarked a customer
-- call this function directly over PostgREST — bypassing the Next.js layer, and with it the
-- masking, entirely. `roaming_customer_search` avoids the same trap by never being reachable
-- except through the trusted server, which has already resolved the real caller from a verified
-- JWT before this is ever invoked.
--
-- Returns zero rows rather than raising when the named caller has no standing, so the route
-- handler's "not found" and "not authorised" answers stay indistinguishable to the client, as
-- everywhere else in this schema.
-- =============================================================================
create or replace function public.roaming_customer_card(p_customer_id uuid, p_caller_user_id uuid)
returns table (
  customer_id           uuid,
  home_organization_id  uuid,
  full_name             text,
  mobile                text,
  district              text,
  state                 text,
  date_of_birth         date,
  gender                text,
  category              text,
  education_json        jsonb,
  certificates_json     jsonb,
  identity_summary_json jsonb,
  verification_status   text,
  is_linked             boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.organization_id,
    c.full_name,
    c.mobile,
    coalesce(
      c.address_json -> 'permanent' ->> 'district',
      c.address_json -> 'current' ->> 'district'
    ),
    coalesce(
      c.address_json -> 'permanent' ->> 'state',
      c.address_json -> 'current' ->> 'state'
    ),
    c.date_of_birth,
    c.gender,
    c.category,
    c.education_json,
    c.certificates_json,
    c.identity_summary_json,
    c.verification_status,
    exists (
      select 1
      from public.customer_roaming_links l
      join public.organization_members m on m.organization_id = l.organization_id
      where l.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
    )
  from public.customers c
  where c.id = p_customer_id
    and c.deleted_at is null
    and (
      exists (
        select 1
        from public.customer_roaming_links l
        join public.organization_members m on m.organization_id = l.organization_id
        where l.customer_id = c.id and m.user_id = p_caller_user_id and m.status = 'active'
      )
      or exists (
        select 1
        from public.customer_access_grants g
        where g.customer_id = c.id
          and g.granted_to_user_id = p_caller_user_id
          and g.status = 'active'
          and g.revoked_at is null
          and g.expires_at > now()
      )
    );
$$;

comment on function public.roaming_customer_card(uuid, uuid) is
  'Raw pre-auth projection for one customer, by id. Service role only — masking happens in apps/web/lib/roaming/card.ts, not here (0024 header note 2 and the note on this function).';

revoke execute on function public.roaming_customer_card(uuid, uuid) from public;
revoke execute on function public.roaming_customer_card(uuid, uuid) from authenticated;
grant execute on function public.roaming_customer_card(uuid, uuid) to service_role;

-- =============================================================================
-- expire_roaming_access_grants — housekeeping only
--
-- Access has already ended by the time this runs: every policy compares expires_at against
-- now(), so a lapsed grant stops working the moment it lapses, sweep or no sweep. This exists to
-- make the label honest for the audit trail and the UI, and to drop spent challenges — a
-- consumed or expired challenge row is a hashed secret with no remaining purpose.
-- =============================================================================
create or replace function public.expire_roaming_access_grants()
returns table (grants_expired int, challenges_deleted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  expired int;
  dropped int;
begin
  update public.customer_access_grants
     set status = 'expired'
   where status = 'active'
     and expires_at <= now();
  get diagnostics expired = row_count;

  delete from public.customer_access_challenges
   where expires_at < now() - interval '1 hour'
      or consumed_at < now() - interval '1 hour';
  get diagnostics dropped = row_count;

  return query select expired, dropped;
end;
$$;

comment on function public.expire_roaming_access_grants() is
  'Marks lapsed grants expired and deletes spent OTP challenges. Cosmetic for access control — the policies already compare against now().';

revoke execute on function public.expire_roaming_access_grants() from public;
grant execute on function public.expire_roaming_access_grants() to service_role;


-- ==========================================================================
-- Migration: 0025_document_drop_roaming_intake.sql
-- ==========================================================================

-- =============================================================================
-- 0025 — saving a walk-in drop onto a roaming customer
--
-- Master spec §9.1 (walk-in intake), §19.3 (private storage); docs/SECURITY.md §2 (roaming).
--
-- The gap this closes. Migration 0024 let a visiting operator holding a live, OTP-consented
-- grant *read* a roaming citizen's profile and files. It deliberately did not let them write
-- one, because at the time nothing needed to: a visiting centre filled a form from documents
-- that already existed.
--
-- Walk-in drop changes that. The citizen standing at a visiting counter hands over a fresh
-- document, and the only useful place for it is their own record at their home centre — so it
-- is there the next time they walk into either centre. Staging it at the visiting centre
-- instead would fork the citizen's file across two organizations, which is the outcome the
-- roaming design exists to avoid.
--
-- The shape of the permission, and why each half is needed:
--
--   * `organization_id` on the new row must be the customer's HOME organization, not the
--     caller's. The document belongs to the citizen's file. `has_org_role` therefore cannot be
--     the test — the caller has no role there at all — so the grant is the whole authority, and
--     the `organization_id = customers.organization_id` equality is what stops that authority
--     from being used to write a row into any *other* organization.
--   * `uploaded_by` must be the caller. A grant names one user (0024), so the row records which
--     human acted, in an organization they are not a member of. `audit_logs` carries the same
--     fact; this makes it legible on the document itself.
--   * INSERT only. No update, no delete. A visiting operator may add to the citizen's file and
--     may not alter or remove what the home centre holds — the same asymmetry 0024 struck for
--     reads, applied to writes.
--
-- Nothing here widens what a *bookmark* can do: `has_active_customer_grant` is unchanged, so a
-- centre that has merely looked the citizen up still writes nothing until the citizen consents
-- to an OTP and that consent is still live.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- documents — the insert path for a grant holder
--
-- Replaces 0010's org-role-only policy with the same test plus the roaming clause. The org-role
-- arm is copied verbatim so ordinary intake is untouched.
-- -----------------------------------------------------------------------------
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or (
      customer_id is not null
      and public.has_active_customer_grant(customer_id)
      -- The row must land in the customer's own centre, written by the grant holder themselves.
      and uploaded_by = auth.uid()
      and exists (
        select 1
        from public.customers c
        where c.id = documents.customer_id
          and c.organization_id = documents.organization_id
          and c.deleted_at is null
      )
    )
  );

comment on policy documents_insert on public.documents is
  'Home-centre roles, or a live roaming grant holder writing into the customer''s own organization (0025).';

-- -----------------------------------------------------------------------------
-- storage — the bytes behind that insert
--
-- The document row points at an object under `org/<home org>/...`, and 0010's write policy asks
-- whether the caller is a member of the organization in the path. A visiting operator is not,
-- so without this the row would insert and the copy would fail.
--
-- The object path is not yet claimed by any `documents` row at the moment of the copy — the row
-- is inserted after the bytes land — so this policy cannot look the object up the way the 0024
-- read policy does. It authorises on the path itself instead, and `documentStoragePath` in
-- packages/core makes that precise. A customer document is written to
--
--     org/<home org id>/customer/<customer id>/<document id>/<filename>
--
-- so this requires the caller to hold a live grant over the customer named in segment 4, and
-- that customer to live in the organization named in segment 2. The reachable set is exactly
-- the folder of one citizen who has consented — not the home centre's bucket at large.
-- `split_part` rather than `storage.foldername`, to match `org_id_from_storage_path` in 0010.
-- -----------------------------------------------------------------------------
create policy "assistigo roaming documents write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and split_part(storage.objects.name, '/', 3) = 'customer'
    and exists (
      select 1
      from public.customers c
      where c.id::text = split_part(storage.objects.name, '/', 4)
        and c.organization_id = public.org_id_from_storage_path(storage.objects.name)
        and c.deleted_at is null
        and public.has_active_customer_grant(c.id)
    )
  );

comment on policy "assistigo roaming documents write" on storage.objects is
  'A live roaming grant holder may add bytes under the consenting customer''s own folder (0025). Read stays governed by the 0024 policy; delete is never granted.';


-- ==========================================================================
-- Migration: 0026_allow_full_aadhaar.sql
-- ==========================================================================

-- =============================================================================
-- 0026  Allow full Aadhaar storage
-- Product decision (docs/DEVELOPMENT_RULES.md §1 rule 5): the last-four-only default and the
-- legal-review-gated org flag are lifted. The full 12-digit Aadhaar number may now be stored in
-- identity_summary_json.aadhaar, alongside identity_summary_json.aadhaar_last4. The field stays
-- high-risk (always reviewed, masked on display with audited reveal) and is still never logged,
-- searched, or indexed.
-- =============================================================================

-- The trigger from 0003_customers.sql rejected any twelve-digit value under
-- identity_summary_json.aadhaar. Replace it with one that only keeps the aadhaar_last4 format
-- check, which is an unrelated data-integrity guard, not a policy gate.
create or replace function public.reject_full_aadhaar()
returns trigger
language plpgsql
as $$
begin
  if (new.identity_summary_json ->> 'aadhaar_last4') is not null
     and (new.identity_summary_json ->> 'aadhaar_last4') !~ '^[0-9]{4}$' then
    raise exception 'ASSISTIGO_INVALID_AADHAAR_LAST4: expected exactly four digits'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- organizations.settings.allow_full_aadhaar is no longer read anywhere in the app — full Aadhaar
-- storage is now the product default for every organization, not a per-org opt-in — but the key
-- stays for now so a future re-introduction of per-org control has somewhere to land.
alter table public.organizations
  alter column settings set default jsonb_build_object(
    'ai_processing_enabled', false,
    'allow_full_aadhaar', true,
    'retention', 'keep',
    'overwrite_filled_fields', false
  );

update public.organizations
   set settings = jsonb_set(settings, '{allow_full_aadhaar}', 'true')
 where settings ->> 'allow_full_aadhaar' = 'false';

comment on column public.organizations.settings is
  'allow_full_aadhaar is currently unused by the app — full Aadhaar storage is unconditional. Kept for a possible future per-org control.';

