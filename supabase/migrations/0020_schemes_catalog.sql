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
