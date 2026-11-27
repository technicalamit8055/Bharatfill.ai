-- =============================================================================
-- 0051  Mapping contributions — operator-taught field mappings shared for review
-- Master spec §14.3 (priority 2 org override / 6 manual mapping), §9.6 (anonymised metadata)
-- docs/FORM_ENGINE.md §6c
--
-- When an operator maps a box the engine did not recognise, the centre keeps it as an
-- `org_field_mappings` row. If they leave "share" ticked, the portal's side of that mapping is
-- also stored here for Bharatfill staff to review. An approved contribution is written into a
-- global `portal_adapters` row, which is how one centre's fix reaches every centre.
--
-- No customer value is ever stored here. Every text column is page text cleaned by
-- packages/form-engine/src/contributions.ts (emails and PAN-shaped text dropped, long digit
-- runs masked) before it is sent.
-- =============================================================================

create table public.mapping_contributions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,

  page_origin        text not null check (page_origin ~ '^https?://'),
  path_pattern       text not null default '/',
  field_signature    text not null,
  tag_name           text not null check (tag_name in ('input', 'select', 'textarea')),
  input_type         text not null,
  label_text         text check (char_length(label_text) <= 200),
  aria_label         text check (char_length(aria_label) <= 200),
  placeholder        text check (char_length(placeholder) <= 200),
  section_heading    text check (char_length(section_heading) <= 200),
  name_attribute     text check (char_length(name_attribute) <= 80),
  id_attribute       text check (char_length(id_attribute) <= 80),
  customer_field     text not null check (customer_field like 'customer.%'),

  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  portal_adapter_id  uuid references public.portal_adapters (id) on delete set null,
  reviewed_by        uuid references auth.users (id) on delete set null,
  reviewed_at        timestamptz,

  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One live answer per centre per box: re-teaching the same box replaces the earlier one.
  unique (organization_id, page_origin, field_signature),
  -- Something must identify the box, or the contribution can never become an adapter field.
  constraint mapping_contributions_identifiable
    check (coalesce(label_text, aria_label, placeholder, name_attribute, id_attribute) is not null)
);

comment on table public.mapping_contributions is
  'Operator-taught field mappings shared for staff review. Portal metadata only — never a customer value.';

create index mapping_contributions_queue_idx
  on public.mapping_contributions (status, page_origin, created_at desc);

create trigger mapping_contributions_set_updated_at
  before update on public.mapping_contributions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS. A centre may write and read back its own rows (the upsert needs the read). Review
-- happens in /admin through the service-role client, so there is no platform policy here and
-- no centre can see another centre's contributions.
-- -----------------------------------------------------------------------------
alter table public.mapping_contributions enable row level security;

create policy mapping_contributions_select on public.mapping_contributions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']));

create policy mapping_contributions_insert on public.mapping_contributions
  for insert to authenticated
  with check (
    status = 'pending'
    and reviewed_by is null
    and portal_adapter_id is null
    and public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
  );

-- A centre may change its own answer, which sends it back to the queue; it may never mark its own
-- contribution approved or point it at an adapter.
create policy mapping_contributions_update on public.mapping_contributions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager', 'operator']))
  with check (
    status = 'pending'
    and reviewed_by is null
    and portal_adapter_id is null
    and public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
  );

create policy mapping_contributions_delete on public.mapping_contributions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));
