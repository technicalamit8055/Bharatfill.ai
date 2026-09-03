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
