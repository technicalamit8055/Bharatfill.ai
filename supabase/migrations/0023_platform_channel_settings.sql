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
