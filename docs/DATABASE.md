# Database

Derived from master spec §18.

**Migrations live in `supabase/migrations/`**, not `packages/database/migrations` as sketched in
spec §26. The Supabase CLI reads that path with no configuration, so `supabase db reset`,
`supabase db diff` and the CI `database` job all work out of the box; a second copy synced from
elsewhere would be a drift hazard for no benefit. `packages/database/` holds the seed script and
fixtures (`src/seed/`) and the RLS test suite (`rls-tests/`). Generated DB types live with their
only consumer, in `apps/web/lib/supabase/database.types.ts`.

---

## 1. Conventions

- UUID primary keys (`gen_random_uuid()`).
- Every tenant table has `organization_id uuid not null references organizations(id)`.
- `created_at` / `updated_at` are `timestamptz not null default now()`; `updated_at` is
  maintained by the `set_updated_at()` trigger.
- Soft delete (`deleted_at`) on business records that need audit history:
  `organizations`, `customers`, `documents`. Hard delete is reserved for privacy erasure.
- Enumerated values are Postgres `text` + `check` constraints rather than native enums, so a new
  status does not require a type migration during the MVP.
- All identifiers `snake_case`.

## 2. Migration order

| File                                           | Contents                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_extensions_and_helpers.sql`              | `pgcrypto`, `set_updated_at()`, `is_org_member()`, `has_org_role()`, `current_org_role()`                                                                                                                           |
| `0002_organizations.sql`                       | `organizations`, `organization_members`, `organization_invitations`                                                                                                                                                 |
| `0003_customers.sql`                           | `customers`, `customer_field_values`                                                                                                                                                                                |
| `0004_documents.sql`                           | `documents`, `document_extractions`, `document_derivatives`, `document_requirement_presets`, storage bucket + policies                                                                                              |
| `0005_applications.sql`                        | `applications`, `application_status_events`, `application_documents`                                                                                                                                                |
| `0006_form_engine.sql`                         | `portal_adapters`, `fill_sessions`, `fill_session_fields`, `form_reports`, `org_field_mappings`                                                                                                                     |
| `0007_billing.sql`                             | `plans`, `subscriptions`, `usage_events`                                                                                                                                                                            |
| `0008_audit_and_privacy.sql`                   | `audit_logs`, `consent_records`, `support_access_grants`, `data_requests`                                                                                                                                           |
| `0009_jobs.sql`                                | `jobs` table + claim/complete functions                                                                                                                                                                             |
| `0010_rls_policies.sql`                        | every RLS policy in one reviewable place, plus storage policies                                                                                                                                                     |
| `0011_rpc.sql`                                 | `create_organization`, `accept_invitation`, `search_customers`, `dashboard_summary`                                                                                                                                 |
| `0012_extension_pairing.sql`                   | `extension_pairing_codes` (SHA-256 code hash, encrypted session, one live code per user; no policies), `consume_extension_pairing_code()`, `purge_extension_pairing_codes()` — both service_role only               |
| `0013_document_extraction_uniqueness.sql`      | collapses duplicate `document_extractions` and adds `unique (document_id)`; `storage_used_bytes(org)` for the storage entitlement                                                                                   |
| `0014_enqueue_job_rpc.sql`                     | `enqueue_job()` — `security definer` entry point letting owner/manager/operator queue `ocr.extract` / `document.derivative` only, with in-flight idempotency                                                        |
| `0015_claim_document_job.sql`                  | `claim_document_job()` — service_role claim of one document's `ocr.extract` job (optionally rewriting `extractionMode`); `jobs_ocr_document_idx`                                                                    |
| `0016_derivative_storage_usage.sql`            | `storage_used_bytes()` now also sums `document_derivatives.size_bytes`                                                                                                                                              |
| `0017_ai_vendor_settings.sql`                  | `organization_ai_settings` — per-org AI vendor (provider preset, wire format, base URL, model, encrypted API key, custom prompt); owner-only writes                                                                 |
| `0018_billing_plan_sync.sql`                   | `sync_organization_plan_code()` trigger on `subscriptions` → `organizations.plan_code`                                                                                                                              |
| `0019_graduation_marksheet_document_type.sql`  | adds `marksheet_graduation` to the `documents.document_type` check                                                                                                                                                  |
| `0020_schemes_catalog.sql`                     | `schemes_catalog` — global (`organization_id is null`) and per-org scheme/vacancy rows, en+hi copy, application window, eligibility JSON                                                                            |
| `0021_platform_admin_and_scrapers.sql`         | `platform_admins`, `scraper_sources`, `scraper_runs`, `scraped_schemes_queue`, `is_platform_admin()`, `platform_metrics()`, `platform_tenant_rows()`; adds `scraper.run` job type                                   |
| `0022_document_drop_bot.sql`                   | `organizations.counter_drop_code`, `document_drop_sessions`, `document_drop_files`, `purge_expired_document_drops()`                                                                                                |
| `0023_platform_channel_settings.sql`           | `platform_channel_settings` — deployment-wide WhatsApp/Telegram credentials, encrypted; service_role only                                                                                                           |
| `0024_roaming_customers_and_access_grants.sql` | `customer_roaming_links`, `customer_access_grants`, `customer_access_challenges`, grant helpers, roaming RPCs; `roaming_access` consent subject; grant clause on four tenant tables' select policies + storage read |
| `0025_document_drop_roaming_intake.sql`        | second arm on `documents_insert` and a `storage.objects` insert policy, so a live grant holder can add a document to the customer's home org                                                                        |
| `0026_allow_full_aadhaar.sql`                  | `reject_full_aadhaar()` reduced to the `aadhaar_last4` format check; `settings.allow_full_aadhaar` default and backfill set to `true` (key no longer read)                                                          |
| `0027_scheme_logos.sql`                        | `schemes_catalog.logo_path` (shape-checked `<slug>/<uuid>.<png|jpg|webp>`); private `scheme-logos` bucket, 256 KB, PNG/JPEG/WebP, no storage policies                                                            |
| `0028_scheme_artwork.sql`                      | `schemes_catalog.banner_path` and `illustration_path` (same shape check as `logo_path`) for the scheme detail page; `scheme-logos` bucket limit raised to 1 MB                                                    |

Seed data is **separate from migrations** (`packages/database/src/seed/`), per spec §25.4.

## 3. Security helper functions

```sql
-- active membership in the org
create function public.is_org_member(org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from organization_members m
      where m.organization_id = org
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
  $$;

-- active membership with one of the given roles
create function public.has_org_role(org uuid, roles text[]) returns boolean ...
```

`security definer` is required so the policies on `organization_members` do not recurse.

## 4. Role vocabulary

`owner` · `manager` · `operator` · `viewer` · `billing_admin`

Membership status: `active` · `invited` · `suspended`.

## 5. Key design notes

### `customers` vs `customer_field_values`

`customers` holds the **confirmed** profile — what the operator has accepted. Fast to query,
drives search and autofill.

`customer_field_values` holds **field-level provenance**: which document a value came from, its
confidence, and its verification status (`extracted` → `operator_verified` →
`customer_confirmed`, or `rejected` / `expired`). Encrypted values (PAN, bank account) live only
here, in `value_encrypted`. An extracted value does not touch `customers` until a human accepts it
(spec §9.3, §12.6).

### Search

`customers` carries a generated `search_vector tsvector` over name, mobile, customer code,
village and district, with a GIN index. Aadhaar is deliberately excluded — it must never be a
search key (spec §19.3).

Mobile search also matches on a normalized last-10-digit column so `98765 43210`,
`+919876543210` and `9876543210` all find the same customer.

### Sensitive columns

`customers.identity_summary_json` holds identity summaries:

```json
{
  "aadhaar": "<12 digits>",
  "aadhaar_last4": "1234",
  "pan_masked": "ABCXX1234X",
  "voter_id_last4": "7788"
}
```

Full PAN / bank account live encrypted in `customer_field_values.value_encrypted`.

**Full Aadhaar is stored since 0026.** `customer.aadhaar` maps to `identity_summary_json.aadhaar`
(field registry: `high_risk`, `storage.kind = 'json'`), and its accepted value is also written to
`customer_field_values.value_text` with a masked `display_value`. It is **not** field-encrypted —
only `storage.kind = 'encrypted'` keys (PAN, bank account) go to `value_encrypted` — so it is
protected by RLS, masking on every display path, and whatever at-rest encryption the database host
provides — not by `FIELD_ENCRYPTION_KEY`. The `customers_reject_full_aadhaar` trigger from 0003 still exists
but, after 0026, only rejects a malformed `aadhaar_last4`. `organizations.settings.allow_full_aadhaar`
is defaulted and backfilled to `true` and is read by nothing; storage is unconditional.

Consequence for 0024: `roaming_customer_search()` / `roaming_customer_card()` return
`identity_summary_json` raw, which now can carry the full number. Their service-role-only grant is
what keeps that out of a browser — `apps/web/lib/roaming/card.ts` derives "which documents are on
file" from it and forwards nothing else. The 0024 comment saying that column "already holds
masked" values predates 0026.

### `extension_pairing_codes` (0012)

The one table that holds an operator's session. Only `code_hash` (SHA-256) is stored, never the
code; `session_payload` is AES-256-GCM ciphertext with the code hash as AAD, so a row cannot be
moved onto another code. A partial unique index allows one unconsumed code per user, and
redemption is a single `update … returning` inside `consume_extension_pairing_code()` so two
redemptions cannot interleave. RLS is on with no policies; only the pairing routes reach it.

### One extraction per document (0013)

`document_extractions` is the _current proposal_, not a history: `unique (document_id)` lets the
`ocr.extract` handler `upsert` on retry instead of stacking a second copy into review. Accepted
values keep their provenance in `customer_field_values`, and the decision is in `audit_logs`.

### Queueing and claiming jobs (0014, 0015)

`jobs` stays policy-less. `enqueue_job()` is the narrow `security definer` door for a signed-in
operator: two job types only, a membership re-check in SQL, and a `null` return (not an error)
when the same idempotency key is already in flight. `claim_document_job()` is service_role only
and claims by `payload->>'documentId'`, which is what lets the inline runner finish one upload
without draining another tenant's queue (docs/ARCHITECTURE.md §7).

### `storage_used_bytes` (0013, 0016)

`security definer` because it sums rows the caller could read anyway into a plan number; the
whole total is gated on `is_org_member(org)` and returns 0 otherwise. 0016 adds
`document_derivatives` — prepared files cost the same bytes, and derivatives are hard-deleted, so
there is no soft-delete to exclude.

### `organization_ai_settings` — a third-party key at rest (0017)

A table of its own, not a key in `organizations.settings`, because it holds a secret.
`api_key_encrypted` is AES-256-GCM ciphertext (AAD `<org id>:ai_vendor_api_key`); the settings
API reports only whether a key is set. Any member may select the row (to show "read by"), only an
owner may write it — stricter than ordinary org settings. Writing a row does **not** enable AI
reading: `organizations.settings.ai_processing_enabled` is still the gate the pipeline checks.
`provider` is a UI preset (`openai`, `anthropic`, `deepseek`, `gemini`, `ollama`, `openrouter`,
`custom`); what is actually spoken is `wire_format` (`openai_compatible` | `anthropic_messages`).

### `plan_code` sync (0018)

A `billing_admin` may write `subscriptions` but not `organizations`, so the trigger (definer)
copies the plan's code onto `organizations.plan_code` for `active` / `trialing` / `past_due`
rows. Other statuses leave `plan_code` alone — failed billing degrades access, it never rewrites
data (§22.4).

### `marksheet_graduation` (0019)

A check-constraint change, not an enum, matching `DOCUMENT_TYPES` in
`packages/core/src/documents/types.ts`. The `ocr-extract` handler falls back to a status-only
update on `23514` so a database that has not run 0019 does not fail extraction.

### `schemes_catalog` — reference data, tenant-scoped (0020)

Eligibility rules for the high-volume schemes ship in the build
(`packages/core/src/schemes/catalog.ts`); this table holds what a build cannot — real application
windows, a centre's local schemes, and corrections. Precedence copies `portal_adapters`: a null
`organization_id` is the platform catalogue, and an org row with the same slug overrides it
(`mergeSchemes`). No personal data, so none of the retention/export/erasure paths apply.

- `eligibility` is re-validated with Zod on every read; a row that fails is skipped, because a
  malformed rule that tells a citizen they qualify is worse than a missing scheme.
- `is_published = false` hides a **global** row from every tenant; members still see their own
  org's drafts.
- Tenant writes are owner/manager on their own org rows only; global rows are service_role only,
  by omission. There is currently no tenant UI that writes org rows — only the `/admin` panel and
  the seed write this table.
- `logo_path` (0027) is an object path in the private `scheme-logos` bucket, never a URL, so a row
  cannot point browsers at a third-party host. It is set only by the admin panel's artwork card,
  apart from the editor form, and an org override inherits the platform row's images
  (`inheritPlatformArtwork`). A built-in gets a logo by being copied into a global draft row first
  ("Add to catalogue" on `/admin/schemes`).
- `banner_path` and `illustration_path` (0028) follow the same rules in the same bucket: the
  detail page's hero banner and the picture beside "What the customer gets". Each kind is
  inherited on its own, and an upload outranks any artwork bundled in
  `apps/web/lib/schemes/artwork.ts` (`resolveSchemeImages`).

### Platform staff tables (0021)

`platform_admins`, `scraper_sources`, `scraper_runs` and `scraped_schemes_queue` carry no
`organization_id` and no personal data, and have RLS on with no write policy for anyone but
service_role; the only policy is a self-read on `platform_admins`. The panel authorises in
`apps/web/lib/admin/context.ts` and then uses the service role (docs/SECURITY.md §2).

- `scraped_schemes_queue` is the whole safety argument for scraping: nothing a fetcher produces is
  live until a human approves it. `confidence` orders the inbox and decides nothing; the partial
  unique index on `content_hash where status = 'pending'` stops a re-poll re-queuing the same
  notification.
- `scraper_sources.source_url` must be `https://`, `config` must never hold credentials, and
  `scraper_runs.error_text` is sanitised and capped at 2 000 chars before it is written.
- `platform_metrics()` / `platform_tenant_rows()` are the only tenant data the panel reads, and
  return counts and organization metadata only; both are revoked from `authenticated`.
- `is_platform_admin()` exists but no policy uses it yet.
- `scraper.run` was added to the `jobs.type` check, but no job handler exists for it; scheduled
  scraping runs through `POST /api/admin/scrapers/run` instead.

### `document_drop_sessions` — staging, not storage (0022)

Walk-in intake lands in `document_drop_sessions` + `document_drop_files` before it is anything to
do with a customer. The two tables mirror `documents` on purpose — same bucket, same MIME
allow-list, same 15 MB ceiling, same `org/<organization_id>/%` path rule — so conversion is a copy
between rows that already agree on what a file is.

Three things about this schema are load-bearing:

- **`sender_id` is personal data held deliberately.** It is the number the citizen messaged from,
  and pre-filling it is the whole time saving. It must never reach a log, an error report or audit
  metadata (§19.6). No call site passes it today, but note that `redact()` would **not** catch
  it: `sender_id` / `senderId` / `chatId` match none of its sensitive-key patterns, so the rule
  rests on call sites not offering it.
- **`expires_at` defaults to two hours.** An unclaimed session holds identity documents that
  nobody has yet taken responsibility for, so the window is the length of a counter queue, not a
  working day (§12.7).
- **Status transitions are the concurrency control.** Conversion, discard and the retention sweep
  all move a session out of `active`/`ready` with a _conditional_ update before touching its
  bytes. Whoever moves it first wins; everybody else gets a plain refusal. That single rule is
  what stops two operators creating two customers for one walk-in, and stops the sweep deleting
  files out from under an intake in progress.

Staged bytes **are** readable before conversion, through
`POST /api/document-drop/sessions/:id/files/:fileId/signed-url` — five-minute URL, `document.download`,
one `drop_file.previewed` audit row per issue. The queue used to withhold them, which was right
while the only choice was "take the whole session or discard it"; per-file intake made it wrong,
because telling a father's Aadhaar from his son's is not something a WhatsApp caption can do, and
an operator who cannot look will take everything onto one profile and untangle it afterwards.

A save may also take a **subset** of a session's files (`fileIds`). When files are left behind the
session returns to `ready` so the remainder can go to a different customer; the conditional claim
still happens first, and is released deliberately at the end.

`purge_expired_document_drops()` marks and deletes rows only — Postgres cannot reach the storage
backend, and deleting from `storage.objects` would orphan the bytes. The application sweep in
`apps/web/lib/document-drop/purge.ts` marks, removes the objects, then deletes the rows it
stripped, in that order.

`organizations.counter_drop_code` is the permanent code on a printed standee, unique
platform-wide. It never expires and mints a fresh session per inbound message, which is what keeps
two people at one counter out of one intake.

### `platform_channel_settings` — bot credentials, editable from the panel (0023)

The WhatsApp number and Telegram bot behind walk-in intake are **deployment-wide**, not per-tenant:
every centre shares them. So this table has no `organization_id`, holds exactly two rows keyed by
`channel`, and — like `platform_admins` in 0021 — grants nothing to `authenticated`. Only the
service role touches it, behind a `platform.team.manage` check in the admin API.

- **The three token columns are AES-256-GCM ciphertext**, never plaintext, encrypted under a
  channel-scoped AAD so a WhatsApp ciphertext cannot be transplanted into the Telegram row. The
  API returns only `hasAccessToken` / `hasAppSecret` / `hasBotToken` — a decrypted secret never
  reaches a browser.
- **Non-secret settings live in `config` jsonb** (phone number id, bot number, verify token, bot
  username, webhook secret). None is a secret on its own: the number is printed on the standee,
  and the verify token only authenticates Meta's one-time handshake.
- **A row here does not obligate its use.** The channel adapters read this table first and fall
  back to `WHATSAPP_*` / `TELEGRAM_*` when a row is missing, disabled, or missing its token — so
  an existing env-configured deployment is unaffected until a Super Admin explicitly saves one.

### `fill_session_fields`

Stores `proposed_value_preview` — a **masked, truncated** preview (e.g. `Am… K…`,
`98•••••210`), never the full value. This makes fill sessions debuggable without turning the
audit trail into a PII store.

### Cross-operator roaming access (0024)

A customer registered at one centre can walk into another and be served there, with the
citizen's own time-boxed consent standing in for a second registration. Three tables:

- **`customer_roaming_links`** — a bookmark: "this centre has served this person." It appears in
  **no RLS predicate anywhere**. Linking a customer grants nothing; it only makes them reachable
  by id on the visiting centre's own roaming list.
- **`customer_access_grants`** — the consent window itself: who was granted access, over whose
  record, for how long (capped at 12 hours by a check constraint), and under which
  `consent_records` row. RLS on `customers`, `customer_field_values`, `documents` and
  `document_derivatives` was extended with one clause each — `has_active_customer_grant(id)` —
  so a live grant reads exactly like home-org membership for those four tables and nothing else
  (`applications`, `fill_sessions` and `document_extractions` are deliberately untouched).
- **`customer_access_challenges`** — an outstanding six-digit OTP. RLS is enabled and **carries
  no policy for any role**, including `service_role` reached through PostgREST with a user JWT:
  the row holds a salted hash of a code a citizen reads off their own phone, and only
  `apps/web/lib/roaming/service.ts`, using the service-role client, ever touches it.

Two RPCs cross tenant boundaries and are **service-role-only**, callable only from the trusted
server after it has resolved the real caller from a verified session — never granted to
`authenticated`, because both return raw values (full name, mobile, certificate/education JSON)
that only `apps/web/lib/roaming/card.ts` is allowed to mask before they reach a client:

- `roaming_customer_search(mobile, exclude_org, limit)` — the platform-wide lookup by exact
  ten-digit mobile.
- `roaming_customer_card(customer_id, caller_user_id)` — the pre-auth projection for one customer,
  once its id is already known. Takes the caller as an explicit parameter rather than reading
  `auth.uid()`, because it is invoked via the admin client — an `auth.uid()`-based check would
  silently see no caller and return nothing.

Two more RPCs mask in SQL and so remain safe for `authenticated`:
`roaming_linked_customers()` (a centre's own roaming list — given name, family initial, last-four
mobile) and the boolean checks `has_customer_roaming_link()` / `has_active_customer_grant()`,
which back the RLS policies themselves.

Limits held in the schema rather than in code: a challenge lives at most 15 minutes (default 5),
carries 5 attempts, and stores an HMAC-SHA256 of the code under a per-row salt; the grant it mints
may not exceed the `duration_minutes` (15–720) the citizen was told. Grant consent is recorded in
`consent_records` under its own subject, `roaming_access`, added to the check constraint here.

`expire_roaming_access_grants()` (service_role) marks lapsed grants `expired` and deletes spent
challenges. It is housekeeping only — every policy compares `expires_at` to `now()` — and nothing
in the application calls it yet, so spent challenge rows (hashes, not codes) currently linger
until it is scheduled.

### Writing to a roaming customer (0025)

0024 opened reading only. 0025 opens **one** write, because a walk-in drop handed over at a
visiting counter has nowhere sensible to go otherwise: staging it at the visiting centre would
fork the citizen's file across two organizations, which is the outcome roaming exists to prevent.

`documents_insert` gained a second arm. A caller with no role in the organization may insert when
_all_ of the following hold, and the conjunction is the safety property:

- they hold a live grant over the row's `customer_id` (`has_active_customer_grant`);
- `organization_id` equals that customer's **own** `organizations` row — so the authority cannot
  be turned toward any other tenant;
- `uploaded_by` is the caller themselves — a grant names one user, so the row records which human
  acted inside an organization they are not a member of.

`update` and `delete` are untouched: a visiting operator may add to the citizen's file and may
not alter or remove what the home centre holds — 0024's read asymmetry, applied to writes. A
matching `storage.objects` insert policy admits the bytes, scoped by path to
`org/<home org>/customer/<granted customer>/…` rather than to the home centre's bucket at large.

The application layer verifies the grant itself before it gets here
(`resolveRoamingDestination` in `apps/web/lib/document-drop/service.ts`), and neither gate is
trusted to be the only one. `packages/database/rls-tests/roaming_access.test.ts` covers the
boundaries; the write is audited as `drop_file.saved_to_roaming`, which carries the grant id.

## 6. Indexes

```sql
customers            (organization_id, deleted_at), gin(search_vector), (organization_id, mobile_normalized)
customer_field_values(organization_id, customer_id, field_key) unique
documents            (organization_id, customer_id), (organization_id, status)
applications         (organization_id, status), (organization_id, customer_id), (organization_id, deadline_at)
fill_sessions        (organization_id, created_at desc), (organization_id, customer_id)
audit_logs           (organization_id, created_at desc), (organization_id, entity_type, entity_id)
usage_events         (organization_id, event_type, created_at)
jobs                 (status, run_after) where status in ('pending','retry'), ((payload->>'documentId')) where type = 'ocr.extract'
schemes_catalog      unique (slug) where organization_id is null, unique (organization_id, slug) where organization_id is not null,
                     (application_end_date, application_start_date) where is_published
scraped_schemes_queue unique (content_hash) where status = 'pending', (status, created_at desc)
document_drop_sessions unique (session_code) where status in ('active','ready'), (organization_id, status, created_at desc),
                     (expires_at) where status in ('active','ready')
customer_access_grants (granted_to_user_id, customer_id, expires_at) where status = 'active' and revoked_at is null
```

A drop `session_code` is unique only while live, so the short format is not exhausted over months.

## 7. Seed data rules (spec §32)

Fake only. Specifically:

| Field             | Rule                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Mobile            | starts `99000` — a range reserved for testing, never allocated to real subscribers             |
| Aadhaar last four | always `0000`; the seed writes no full Aadhaar (`identity_summary_json.aadhaar` is left unset) |
| PAN               | pattern-valid but with `ZZZ` issuer block, e.g. `ZZZPD1234Q`                                   |
| Names             | common Indian names, but paired with fake DOB/address so no real identity is reconstructable   |
| Documents         | generated PDFs/PNGs stamped **DEMO ONLY — NOT A VALID DOCUMENT**                               |

`npm run db:seed` creates one demo organization, four members (one per role), ~30 customers,
document fixtures, applications across every status, and the demo portal adapters.

## 8. RLS test coverage

`packages/database/rls-tests` runs against a real local Supabase only (`harness.ts` refuses any
non-loopback URL) with two organizations, one member per role in each. `npm run test:rls`.

| File                     | Asserts                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness.ts`             | fixtures: orgs A/B, a user per role, service-role and anon clients                                                                                                                                                                                                                                                                                                     |
| `tenancy.test.ts`        | org B reads zero org A `customers`, `customer_field_values`, `applications`, `fill_sessions`, `consent_records`, `organization_ai_settings`, `schemes_catalog`, `organizations`; no cross-org insert/update; published global schemes visible to all, unpublished hidden, no tenant write to the global catalogue                                                      |
| `roles.test.ts`          | `viewer` read-only and no `customer_field_values`; `billing_admin` sees no customers/documents/field values/applications but writes `subscriptions`; 0018 `plan_code` sync; operator cannot delete customers/applications or remove members; `organization_ai_settings` owner-only writes; anonymous reads return zero rows                                            |
| `audit.test.ts`          | `audit_logs` cannot be updated or deleted by anyone, service role included; owner/manager read, operator cannot; no cross-org read or insert                                                                                                                                                                                                                           |
| `platform.test.ts`       | 0021 tables invisible and unwritable to tenant sessions and anon; `platform_admins` self-read only, no self-grant or self-promotion; `platform_metrics()` / `platform_tenant_rows()` refused to tenant sessions; no tenant write to global schemes                                                                                                                     |
| `roaming_access.test.ts` | 0024/0025: no access before a grant; a link grants nothing; pre-auth card only via the service-role RPC; a grant opens the four tables to the grant holder only, never `document_extractions` or writes to the customer row; expiry and revocation deny on their own; 12-hour ceiling and self-link rejection; the single 0025 document insert and all of its refusals |

Not yet covered: `document_drop_sessions` / `document_drop_files` (0022) and
`platform_channel_settings` (0023). The suite needs Docker for `supabase start`.
