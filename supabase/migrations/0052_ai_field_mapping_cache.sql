-- =============================================================================
-- 0052  AI field-mapping cache — one model answer per portal box, shared by every centre
-- Master spec §14.3 (priority 5, AI-assisted mapping using field metadata only)
-- docs/FORM_ENGINE.md §6d
--
-- The model is asked about a box only when nothing earlier in the resolution order placed it.
-- Its answer depends only on the box's cleaned metadata (label, section, options …), never on a
-- customer, so it is the same for every centre and is cached here by a hash of that metadata.
-- One call per box per prompt version, instead of one on every "Detect fields".
--
-- No customer value and no tenant id is stored: a row is "on this portal, a box described like
-- this is probably customer.father_name". `customer_field` null caches "the model found no match".
-- =============================================================================

create table public.ai_field_mapping_cache (
  descriptor_hash  text primary key check (descriptor_hash ~ '^[0-9a-f]{64}$'),
  portal_host      text not null check (char_length(portal_host) <= 255),
  customer_field   text check (customer_field like 'customer.%'),
  confidence       numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  prompt_version   text not null,
  created_at       timestamptz not null default now()
);

comment on table public.ai_field_mapping_cache is
  'Model answers for portal boxes, keyed by a hash of cleaned field metadata. No customer or tenant data.';

create index ai_field_mapping_cache_age_idx on public.ai_field_mapping_cache (created_at);

-- Read and written only by the server with the service-role key. No tenant can see or poison it.
alter table public.ai_field_mapping_cache enable row level security;
