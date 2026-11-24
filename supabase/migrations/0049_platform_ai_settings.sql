-- =============================================================================
-- 0049  One AI setup for every centre
-- docs/AI_PIPELINE.md §2; docs/SECURITY.md §4
--
-- A single row, same shape as `organization_ai_settings` (0017) plus the on/off switch. Service
-- role only, like `platform_channel_settings` (0023): no policies for tenants. With no row, centres
-- keep using their earlier setting; once saved, this row replaces all of them. The citizen app's
-- organization is never covered (application rule, apps/web/lib/jobs/handlers/ocr-extract.ts).
-- =============================================================================

create table public.platform_ai_settings (
  id                boolean primary key default true check (id),
  enabled           boolean not null default false,
  provider          text not null
                      check (provider in (
                        'openai', 'anthropic', 'deepseek', 'gemini', 'vertex', 'ollama',
                        'openrouter', 'custom'
                      )),
  wire_format       text not null
                      check (wire_format in (
                        'openai_compatible', 'anthropic_messages', 'vertex_generate_content'
                      )),
  base_url          text,
  model             text,
  -- AES-256-GCM ciphertext (packages/core/src/privacy/crypto.ts). Never plaintext.
  api_key_encrypted text,
  custom_prompt     text check (custom_prompt is null or length(custom_prompt) <= 8000),
  updated_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.platform_ai_settings is
  'The one AI vendor setup all centres share, edited at /admin/ai. Service role only.';

alter table public.platform_ai_settings enable row level security;
revoke all on public.platform_ai_settings from anon, authenticated;

create trigger platform_ai_settings_set_updated_at
  before update on public.platform_ai_settings
  for each row execute function public.set_updated_at();
