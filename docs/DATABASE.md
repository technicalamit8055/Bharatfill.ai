# Database

Derived from master spec §18.

**Migrations live in `supabase/migrations/`**, not `packages/database/migrations` as sketched in
spec §26. The Supabase CLI reads that path with no configuration, so `supabase db reset`,
`supabase db diff` and the CI `database` job all work out of the box; a second copy synced from
elsewhere would be a drift hazard for no benefit. `packages/database/` holds the seed data,
the RLS test suite and generated types.

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

| File                              | Contents                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `0001_extensions_and_helpers.sql` | `pgcrypto`, `set_updated_at()`, `is_org_member()`, `has_org_role()`, `current_org_role()`                              |
| `0002_organizations.sql`          | `organizations`, `organization_members`, `organization_invitations`                                                    |
| `0003_customers.sql`              | `customers`, `customer_field_values`                                                                                   |
| `0004_documents.sql`              | `documents`, `document_extractions`, `document_derivatives`, `document_requirement_presets`, storage bucket + policies |
| `0005_applications.sql`           | `applications`, `application_status_events`, `application_documents`                                                   |
| `0006_form_engine.sql`            | `portal_adapters`, `fill_sessions`, `fill_session_fields`, `form_reports`, `org_field_mappings`                        |
| `0007_billing.sql`                | `plans`, `subscriptions`, `usage_events`                                                                               |
| `0008_audit_and_privacy.sql`      | `audit_logs`, `consent_records`, `support_access_grants`, `data_requests`                                              |
| `0009_jobs.sql`                   | `jobs` table + claim/complete functions                                                                                |
| `0010_rls_policies.sql`           | every RLS policy in one reviewable place, plus storage policies                                                        |
| `0011_rpc.sql`                    | `create_organization`, `accept_invitation`, `search_customers`, `dashboard_summary`                                    |

Seed data is **separate from migrations** (`packages/database/seed/`), per spec §25.4.

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

`customers.identity_summary_json` stores masked summaries only:

```json
{ "aadhaar_last4": "1234", "pan_masked": "ABCXX1234X", "voter_id_last4": "7788" }
```

Full PAN / bank account live encrypted in `customer_field_values.value_encrypted`.
There is no column anywhere for a full Aadhaar number in the MVP.

### `document_drop_sessions` — staging, not storage (0022)

Walk-in intake lands in `document_drop_sessions` + `document_drop_files` before it is anything to
do with a customer. The two tables mirror `documents` on purpose — same bucket, same MIME
allow-list, same 15 MB ceiling, same `org/<organization_id>/%` path rule — so conversion is a copy
between rows that already agree on what a file is.

Three things about this schema are load-bearing:

- **`sender_id` is personal data held deliberately.** It is the number the citizen messaged from,
  and pre-filling it is the whole time saving. It must never reach a log, an error report or audit
  metadata (§19.6); `redact()` strips it, and nothing should offer it in the first place.
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
jobs                 (status, run_after) where status in ('pending','retry')
```

## 7. Seed data rules (spec §32)

Fake only. Specifically:

| Field             | Rule                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Mobile            | starts `99000` — a range reserved for testing, never allocated to real subscribers           |
| Aadhaar last four | always `0000`                                                                                |
| PAN               | pattern-valid but with `ZZZ` issuer block, e.g. `ZZZPD1234Q`                                 |
| Names             | common Indian names, but paired with fake DOB/address so no real identity is reconstructable |
| Documents         | generated PDFs/PNGs stamped **DEMO ONLY — NOT A VALID DOCUMENT**                             |

`npm run db:seed` creates one demo organization, four members (one per role), ~30 customers,
document fixtures, applications across every status, and the demo portal adapters.

## 8. RLS test coverage

`packages/database/rls-tests` asserts, for each tenant table:

1. a member of org A can read their own rows,
2. a member of org B **cannot** read org A's rows,
3. a `viewer` cannot insert or update,
4. a `billing_admin` cannot read documents or customer field values,
5. `audit_logs` cannot be updated or deleted by anyone,
6. anonymous access returns zero rows.
