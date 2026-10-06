-- =============================================================================
-- 0033  Google Vertex AI as an organization AI vendor
-- Master spec §12.3; docs/AI_PIPELINE.md §2
--
-- Vertex AI's API-key ("express mode") endpoint speaks Google's own generateContent shape, not
-- chat-completions, so it needs a third `wire_format` beside the two from 0017. `vertex` is the
-- UI preset that selects it.
--
-- Nothing new is stored and nothing is retained differently: the key is still AES-256-GCM
-- ciphertext in `api_key_encrypted`, and `organizations.settings.ai_processing_enabled` is still
-- the gate. Vertex is the same vendor as the existing `gemini` preset, billed through the Google
-- Cloud account instead of AI Studio prepay.
-- =============================================================================

alter table public.organization_ai_settings
  drop constraint if exists organization_ai_settings_provider_check;

alter table public.organization_ai_settings
  add constraint organization_ai_settings_provider_check
  check (provider in (
    'openai', 'anthropic', 'deepseek', 'gemini', 'vertex', 'ollama', 'openrouter', 'custom'
  ));

alter table public.organization_ai_settings
  drop constraint if exists organization_ai_settings_wire_format_check;

alter table public.organization_ai_settings
  add constraint organization_ai_settings_wire_format_check
  check (wire_format in ('openai_compatible', 'anthropic_messages', 'vertex_generate_content'));
