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
