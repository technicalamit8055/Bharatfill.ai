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
