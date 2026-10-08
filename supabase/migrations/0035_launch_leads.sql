-- =============================================================================
-- 0035  Launch leads
--
-- Pre-launch early-access list. While public sign-ups are closed (SIGNUPS_ENABLED=off), the
-- landing page's launch dialog asks a cyber cafe / CSC operator for a WhatsApp number, shop name
-- and city so the team can message them on launch day.
--
-- These are prospective operators, not citizens, and no customer data is ever stored here. The
-- row is kept until the person creates an account or asks to be removed; platform staff delete
-- it from /admin/launch-leads (product decision, 2026-10-07).
--
-- Access: nobody but the service role. The public form writes through a server action that
-- validates the input first, and the admin console reads through the service role after its own
-- permission gate — so RLS is enabled with no policies at all, and table grants are revoked
-- from anon and authenticated as a second lock.
-- =============================================================================

create table public.launch_leads (
  id               uuid primary key default gen_random_uuid(),
  -- Bare 10-digit Indian mobile, normalised by the app (no +91). Unique, so submitting twice
  -- keeps one row rather than two.
  whatsapp_number  text not null unique check (whatsapp_number ~ '^[6-9][0-9]{9}$'),
  shop_name        text not null check (length(btrim(shop_name)) between 2 and 80),
  city             text not null check (length(btrim(city)) between 2 and 60),
  -- The language the form was filled in, so the launch message can be sent in the same one.
  locale           text not null default 'en' check (locale in ('en', 'hi')),
  -- Which wording of the consent line the person agreed to.
  consent_version  text not null check (length(consent_version) <= 40),
  created_at       timestamptz not null default now()
);

comment on table public.launch_leads is
  'Pre-launch early-access contacts from the landing page. Operators, never citizens. Kept until the person signs up or asks to be removed.';

create index launch_leads_created_at_idx on public.launch_leads (created_at desc);

alter table public.launch_leads enable row level security;

revoke all on table public.launch_leads from anon, authenticated;
