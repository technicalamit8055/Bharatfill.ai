# Security and Privacy

Derived from master spec §19, §18.3, §24.2.

This document is engineering guidance, not legal advice. Before production launch with real
identity documents, obtain a professional legal/privacy review (spec §19.1). Assistigo processes
digital personal data under India's DPDP Act 2023 and DPDP Rules 2025.

---

## 1. Threat model summary

| Threat                                      | Mitigation                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Operator A reads Operator B's customers     | `organization_id` on every tenant row + RLS + API context check                              |
| Stolen access token used against the API    | Short Supabase JWT lifetime, session revocation, role checks per request                     |
| Document leaked via URL sharing             | Private buckets, signed URLs with ≤5 min expiry, no public bucket                            |
| Aadhaar/PAN leaked via logs                 | Central redaction helper, `no-console` rules, structured logging only                        |
| Malicious host page attacking the extension | Content script treats DOM as untrusted, Zod-validates every message, sanitises rendered text |
| Extension exfiltrating data                 | Bundled code only, no remote scripts, minimal permissions, values never persisted            |
| Support staff snooping                      | Support access grant table, time-boxed, reason-recorded, audited                             |
| AI provider retaining documents             | Provider is off by default; org-level opt-in; no training use; request-id-only audit         |
| Forged WhatsApp/Telegram webhook delivery   | HMAC `X-Hub-Signature-256` / secret-token header, constant-time compare; unconfigured → 404  |
| Leaked walk-in drop code                    | Add-only endpoint, 2 h session expiry, 10 files/session, 60 counter sessions/h, uniform 404  |
| Visiting centre reading another's citizen   | Citizen-read OTP or in-app approval → 12 h-max grant naming one user (30 days only when the citizen trusts the centre in the app, 0042); linking alone grants nothing |
| Internal staff reading customer records     | Panel reads counts only via three service-role RPCs; records still need a support grant      |
| Console reached with a dashboard session    | Separate portal sign-in mints a signed, 12 h, user- and portal-bound console session         |
| Citizen (phone) account acting as a centre  | Active membership only for a confirmed-email, non-anonymous, non-`citizen` principal (0037)  |
| billing_admin reading files via Storage API | Storage read policy admits only the roles that may read document rows (0037)                 |

## 2. Tenancy and RLS

Every tenant table has `organization_id uuid not null` and `alter table ... enable row level
security`. Policies are built from two SQL helper functions:

```sql
public.is_org_member(org uuid)          -- active membership exists
public.has_org_role(org uuid, roles text[])  -- active membership with one of these roles
```

Rules:

- `select`: `is_org_member(organization_id)`.
- `insert` / `update` / `delete`: `has_org_role(...)` with the roles allowed for that entity.
- `billing_admin` alone never grants access to `documents`, `document_extractions`,
  `document_derivatives` or `customer_field_values` (spec §18.3).
- `viewer` gets read-only access to `customers`, `documents`, `applications` and `fill_sessions`,
  and **no access at all to `customer_field_values`** — that table carries encrypted identity
  values and raw extraction provenance, which a read-only role has no reason to hold. A viewer
  still sees the confirmed profile through `customers`.
- Service role bypasses RLS. Every holder authorises before it opens the client:

  | Holder                                                 | Gate before the service role                                                  |
  | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
  | migrations, seed script                                | not reachable over HTTP                                                       |
  | `/api/jobs/run`                                        | bearer `JOB_RUNNER_SECRET`, fails closed                                      |
  | inline runner in `/api/documents/:id/process`          | caller authorised against the document's org; claims only that document's job |
  | `/api/billing/webhook`                                 | bearer `BILLING_WEBHOOK_SECRET`, fails closed                                 |
  | `/api/extension/pairing-code`, `/api/extension/pair`   | signed-in session / one-time hashed code                                      |
  | Super Admin panel, `/api/admin/*` except scrapers/run  | roster or `ADMIN_EMAILS`, console session, then platform permission           |
  | `/api/admin/scrapers/run`                              | bearer `JOB_RUNNER_SECRET`                                                    |
  | `/api/webhooks/whatsapp`, `/api/webhooks/telegram`     | signature / secret token (see "Walk-in intake")                               |
  | `/drop/[code]`, `POST /api/document-drop/public/:code` | a live drop code; add-only                                                    |
  | `POST /api/document-drop/sessions/:id/simulate`        | 404 in production; session checked under caller's RLS first                   |
  | `apps/web/lib/roaming/service.ts`                      | `customer.roaming_link` / `customer.roaming_authenticate`                     |

### Platform tables (migrations 0021, 0023)

`platform_admins`, `scraper_sources`, `scraper_runs`, `scraped_schemes_queue` and
`platform_channel_settings` are internal staff infrastructure, not tenant data. They carry **no
`organization_id`**, hold no personal data, and have RLS enabled with **no policy for
`authenticated`** — the same shape as `jobs` and
`billing_webhook_events`. A tenant's JWT presented directly to PostgREST therefore reaches none
of them, whatever the application layer believes.

The one exception is a self-read policy on `platform_admins`: a signed-in user may select their
own row and nobody else's, so a client can learn "am I staff?" without the roster of internal
staff becoming enumerable.

The Super Admin panel is consequently a holder of the service-role client. It authorises first —
`apps/web/lib/admin/context.ts` verifies the JWT, looks the caller up on the roster, checks the
console session, and throws before either client is handed out — and only then acts with the
service role to read tenant aggregates and write global catalogue rows. All three tenant reads go
through `platform_metrics()`, `platform_tenant_rows()` and `platform_tenant_detail()` (0030), which
return **counts and organization metadata only**; no admin screen has another source of tenant
data, so "internal staff cannot see customer records" is a property of three reviewable SQL
functions rather than of application code. The audit log viewer reads platform rows only
(`organization_id is null`); a centre's own trail is not reachable from any filter.
Reading a centre's actual records still requires a `support_access_grant` (§19.9), which the panel
does not issue.

Access is 404, not 403, for non-staff. `ADMIN_EMAILS` is a bootstrap that treats listed emails as
Super Admins without a roster row, so the first owner can open `/admin` on a fresh database; a
mature deployment should leave it empty. Platform roles and their permissions
(`packages/core/src/platform/permissions.ts`) are a separate axis from tenant roles and carry no
customer-data permission:

| Platform role      | Can                                                                                                          | Signs in at    |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | -------------- |
| `support_admin`    | read-only: analytics, tenant list and detail, schemes, forms, scrapers, queue, jobs, audit log               | `/staff/login` |
| `content_manager`  | edit/publish schemes and deadlines, edit portal adapters, review the scraper queue                           | `/staff/login` |
| `scraper_operator` | configure and run scraper sources, view the queue                                                            | `/staff/login` |
| `super_admin`      | everything above, plus team management, walk-in channel settings, tenant suspension and billing overrides    | `/admin/login` |

### Console sign-in: two portals and a console session

The console has two sign-in pages (`packages/core/src/platform/portals.ts`): `/admin/login` for
`super_admin` and `/staff/login` for every other platform role. Each accepts only its own roles —
a Super Admin at the team page is refused, not let in through the lesser door — and both run the
same server action (`apps/web/app/admin/login/actions.ts`), so they cannot drift apart.

A Supabase session alone does not open `/admin`. A successful portal sign-in mints a **console
session** (`apps/web/lib/admin/console-session.ts`): an HMAC-SHA256-signed, `httpOnly`,
`SameSite=Lax` cookie bound to the user id and the portal, with an absolute 12-hour lifetime. The
signing key is derived from the service-role key under a fixed label, so there is no new secret
to provision. Every console page, server action and `/api/admin/*` handler checks it
(`lib/admin/session.ts`, `lib/admin/context.ts`), after the roster:

- staff signed in to the dashboard, but not through a portal, are sent to their portal to confirm
  their password (the page pre-fills the address — "continue as");
- a role change since sign-in moves the role to the other portal and invalidates the session;
- "Lock console" drops the console session and keeps the dashboard session; "Sign out" drops both.

Signed-out requests to `/admin/*` redirect to `/admin/login`; a signed-in non-staff user still gets
a 404 inside the console. The two sign-in pages are public routes and so do confirm that a staff
console exists — a deliberate trade for a real front door. They are `noindex`, give one answer for
an unknown address and a wrong password, sign a non-staff account straight back out, and write
`platform.console_access_denied` when a real account is turned away (not staff, revoked, unconfirmed
bootstrap address, or wrong portal). Successful sign-ins write `platform.admin_signed_in`. The
`next` parameter is restricted to paths inside `/admin` (`safeConsoleNext`).

Not yet: MFA for console sign-in, and a lockout beyond Supabase Auth's own rate limits.

### Tenant suspension and billing overrides (0030)

Super Admins can suspend a centre and move it onto a plan by hand from `/admin/tenants/:id`
(`platform.tenants.manage`, `platform.billing.override`). Both need a written reason (10–200
characters, scrubbed of identifier-shaped text before it is stored or audited) and are audited as
`critical`; suspension also asks for the centre's name to be typed.

- **Suspension** sets `organizations.suspended_at`. The centre keeps every row it owns. The two
  tenant context resolvers refuse to act for it: pages redirect to `/suspended`
  (`lib/auth/session.ts`) and every tenant API route, including the extension's, returns 403
  `errors.organization_suspended` (`lib/api/context.ts`). This is deliberately **not** an RLS
  change: the centre's own members keep read access to their own rows, which no other tenant gains,
  so suspension is an account-state control rather than a confidentiality one. The
  `guard_organization_suspension()` trigger stops an owner clearing or setting the columns through
  `organizations_update`. The public walk-in drop endpoints do not check suspension yet.
- **Plan override** writes a `provider = 'manual'` subscription, and `organizations.plan_code`
  follows through the 0018 sync trigger. It is refused while a paid provider (Razorpay, Stripe)
  owns the live subscription — the provider's webhook would undo it and the invoice would
  disagree — and onto a retired plan (`decidePlanOverride`). `guard_manual_subscription()` stops a
  tenant session creating or editing a `manual` row, so a comp cannot be widened by its recipient.

Tenant detail is read through `platform_tenant_detail()` — organization metadata and counts, no
phone or email, no customer record — the third of the panel's three tenant reads.

`platform_channel_settings` (0023) holds the deployment-wide WhatsApp/Telegram credentials. The
access token, app secret and bot token are AES-256-GCM ciphertext under a channel-scoped AAD, and
the admin API returns only `hasAccessToken` / `hasAppSecret` / `hasBotToken`. Reads and writes
require `platform.team.manage` (Super Admin only) and are audited as
`platform.channel_settings_updated` / `platform.channel_webhook_registered`.

The scraper's `http` fetcher is the only outbound request Assistigo makes that no user initiated.
It is off unless `SCRAPER_HTTP_ENABLED=on`, and then only to `gov.in` / `nic.in` / `ac.in` plus
`SCRAPER_ALLOWED_HOSTS` (host allow-list, which is also the SSRF control), only where
`robots.txt` allows, with a 2 MB / 15 s cap, no cross-host redirects and no credentials. Nothing
it stages is live until a human approves it in the review queue.

RLS is verified by `packages/database/rls-tests`, which must pass before pilot (spec §23.3).

### Operator principals (migration 0037)

Citizen phone sign-in for the Citizen Vault bridge will put citizens in the same `auth.users`
as operators, and `create_organization` is granted to `authenticated`. So an **active**
`organization_members` row may belong only to an operator principal, enforced by the
`organization_members_operator_principal` trigger (insert, and update of `user_id` / `status`):
the auth user has a confirmed email, is not anonymous, and is not tagged
`app_metadata.principal = 'citizen'` (writable only by the service role). The trigger, not the
RPCs, carries the check, so `create_organization`, `accept_invitation` and service-role inserts
are all covered; a refused `create_organization` rolls its organization back. A phone-only
account fails on the first rule. `is_operator_principal()` is not granted to any client role.
Tests: `rls-tests/operator_principal.test.ts`.

The same migration narrowed the 0010 Storage read policy from `is_org_member()` to the roles
that may read `documents` / `document_derivatives` / `document_drop_files` (owner, manager,
operator, viewer). Before it, a `billing_admin` could list and download every customer file under
their organization's prefix while being unable to read a single document row.

### Citizen Vault (migration 0038, docs/VAULT_BRIDGE_DESIGN.md)

Citizens of the mobile app sign in by phone OTP into this project. A `before insert` trigger on
`auth.users` tags every phone-only sign-up `app_metadata.principal = 'citizen'`;
`is_citizen_principal()` also treats any phone-only account as a citizen, and
`citizen_accounts` refuses a row for anyone else. Citizen routes resolve
`apps/web/lib/citizen/context.ts` (bearer token, `getUser()`, citizen principal, else 404).

- **No operator policy on any citizen table** — not for owners, not with a live grant. A centre
  reads documents only through the server file route, which writes `vault_access_events` before it
  sends a byte; a `SELECT` policy could not. Citizens select their own rows; **nobody writes
  directly** — citizen routes write with the service role after resolving the citizen.
- **Secrets, no policy for any client role:** `citizen_vault_keys` (wrapped document key, PIN HMAC
  and failure counters), `vault_access_challenges` (share-code HMACs), `vault_unlock_attempts`.
- **Time boxes are CHECKs:** grant ≤ 2 h, share code ≤ 15 min, access request ≤ 15 min.
- **Append-only history:** a trigger refuses update/delete on `vault_access_events` for every
  role, service role included, except the foreign-key cascade nulling a link (design D13).
- **Storage:** bucket `citizen-vault`, private, `application/octet-stream` only (the phone
  encrypts before upload), **no `storage.objects` policy for `authenticated`**.
- **Keys:** `VAULT_MASTER_KEY` wraps one random AES-256 key per citizen (AAD `<citizen_id>:vault_key`)
  and derives the PIN and mobile HMAC keys (`apps/web/lib/citizen/secrets.ts`). Unset → every
  vault route fails closed (`errors.vault.unavailable`). Account deletion destroys the wrapped key
  first, so synced bytes are unreadable even if their removal fails.
- **Vault PIN** (restore on a new phone): weak PINs refused at sign-up; 5 wrong in a row → 24 h
  lock; 10 wrong over the account's life → the PIN path is off (recycled-number guard). Each wrong
  PIN is an event the citizen can see.
- **Sync** (`/api/citizen/documents*`): the phone encrypts each document (AES-256-GCM, AAD
  `<citizen_id>:<document_id>:vault_document`, format v1 in `@assistigo/core`) and PUTs the
  ciphertext to a short-lived signed upload URL for `citizen/<citizen>/<document>`; the server
  never handles plaintext. Confirm re-reads the object and checks length and SHA-256, removing
  row and bytes on mismatch. Every sync call carries `x-bharatfill-device`, checked against a
  live `citizen_devices` row of this citizen; only those calls count as account activity, so an
  OTP sign-in alone (e.g. a recycled number) never resets the restore inactivity guard. A cloud
  copy is deleted only on an explicit delete or "phone only" — never because a phone lacks it.
- `citizen_id_for_mobile()` and `create_citizen_account()` are service-role only.
- Permission `vault.access`: owner, manager, operator. Viewer and billing_admin hold none.
- Never logged: the phone, the citizen's name, document titles, the PIN, share codes, keys
  (`redact()` drops `vault_pin`, `share_code`, `display_name`, `document_title`, `wrapped_key`,
  `data_key`). Log lines carry citizen and grant ids only.
- Under-18 citizens are not restricted (product owner, 2026-11-17). DPDP §9 requires verifiable
  parental consent for a child's data; **legal review before pilot**.

Tests: `rls-tests/citizen_vault.test.ts`, `packages/core/src/citizen-vault/citizen-vault.test.ts`,
`apps/web/lib/citizen/secrets.test.ts`.

**App accounts as customers (migration 0041).** Every app account also has a `customers` row in
the platform organization "BharatDoc app", and each synced file is decrypted by the server and
stored as a normal `documents` row there (plaintext in the private `customer-documents` bucket,
same protection as an operator upload). Controls:

- The organization has **no members, ever** (trigger on `organization_members`, service role
  included), so no centre reads an app customer without a roaming grant the citizen gave
  (app approval, 0039, or SMS OTP, 0024) — the same consent step as any other centre's customer.
- The one extra thing a grant opens for an app customer is **reading** `document_extractions`, so
  the operator at the counter can do the human review. Review writes go through
  `POST /api/documents/:id/review` on the service role, after `resolveDocumentScope`
  (`apps/web/lib/documents/scope.ts`) re-proves the grant with the caller's JWT. Other centres'
  extractions stay closed to grant holders.
- The citizen deleting a document or the account deletes the customer-side copy and its bytes
  first (`apps/web/lib/citizen/app-customer.ts`).
- The app organization keeps `ai_processing_enabled = false`, so app documents are read by the
  local OCR only (DEVELOPMENT_RULES §1 rule 10). Turning AI reading on for them is a product and
  legal decision.

Tests: `rls-tests/citizen_app_customers.test.ts`, `apps/web/lib/citizen/app-customer.test.ts`,
`apps/web/lib/documents/scope.test.ts`.

### Cross-operator roaming access (migration 0024)

The one place a tenant's row is _meant_ to become readable to a different tenant's session, and
it is consent-gated and time-boxed rather than role-based:

- A `customer_roaming_links` row only bookmarks a customer to a visiting centre. It carries no
  weight in any RLS policy — a centre that has bookmarked a citizen can see nothing about them
  beyond a masked pre-auth card until the citizen consents.
- `customers`, `customer_field_values`, `documents` and `document_derivatives` each gained one
  extra `or has_active_customer_grant(id)` clause. A grant names one user, not an organization, so
  a colleague at the same counter gets nothing from a teammate's grant. `applications`,
  `fill_sessions` and `document_extractions` were deliberately left untouched — a roaming session
  unlocks the confirmed profile and its files, never another centre's operational history or the
  raw OCR transcript behind a document.
- The OTP itself never has a select policy: `customer_access_challenges` is unreadable through
  PostgREST by any role but `service_role`, which only `apps/web/lib/roaming/service.ts` uses.
  `customer_access_grants` likewise has no insert/update policy for `authenticated` — a grant is
  minted only after that code verifies the code the citizen supplied.
- **One write crosses the boundary (migration 0025), and only one.** A grant holder may _insert_ a
  document for the consenting citizen into that citizen's **home** organization — the walk-in drop
  handed over at a visiting counter. `organization_id` must equal the customer's own centre and
  `uploaded_by` must be the grant holder, so the permission cannot be aimed at another tenant or
  laundered through a colleague's name. `update` and `delete` stay closed: a visiting centre may
  add to a citizen's file and may never alter or remove what the home centre holds. The bytes are
  admitted by a matching `storage.objects` insert policy scoped to
  `org/<home org>/customer/<granted customer>/…`. Extraction is deliberately **not** queued for
  such a document — `document_extractions` was never opened to a grant holder, so the visiting
  operator could not read the transcript in any case.
- The platform-wide search (`roaming_customer_search`) and the by-id pre-auth projection
  (`roaming_customer_card`) are both **service-role-only**, never granted to `authenticated`, even
  though the boolean checks that gate the RLS policies (`has_active_customer_grant`,
  `has_customer_roaming_link`) are safe to expose. The difference is what each returns: the
  boolean checks leak nothing, while the two RPCs return raw name/mobile/certificate data that
  only the server is trusted to mask before it reaches a client — granting either to
  `authenticated` would let a bookmarking centre read that raw data straight over PostgREST.
  Since 0026 that raw output includes `identity_summary_json`, which may hold the **full
  Aadhaar**; `apps/web/lib/roaming/card.ts` uses it only to derive "which documents are on file".
- Search is exact ten-digit mobile only (never prefix or name), at most 5 results, and every
  lookup is audited — including one that found nothing.
- The consent OTP: six digits, sent only over WhatsApp to the mobile on the citizen's home record
  (SMS is modelled but unimplemented — no gateway is configured, and choosing one is a product
  owner decision). At most 3 requests per operator per customer per 15 minutes, 5 minutes to
  live, 5 attempts, stored as HMAC-SHA256 under a per-row salt, and never returned by the API.
  The grant it mints cannot outlast the duration the citizen was told (15–720 minutes).
- Routes: `GET /api/customers/roaming/search`, `POST /api/customers/roaming/link`
  (`customer.roaming_link`); `GET /api/customers/:id/roaming` (`customer.view`);
  `POST /api/customers/:id/roaming/request-otp`, `…/verify-otp`, `…/revoke`
  (`customer.roaming_authenticate`). Owner, manager and operator hold both roaming permissions;
  viewer and billing_admin hold neither.
- `expire_roaming_access_grants()` is not scheduled by anything yet. Access still ends on time
  (policies compare against `now()`); what lingers is the `active` label and spent challenge
  hashes.
- **Citizen locks (migration 0046, product owner 2026-11-23).** A citizen can lock the centre
  that created their profile from the BharatDoc app (`apps/web/lib/roaming/citizen-locks.ts`,
  only records whose mobile is their verified number). `customer_citizen_locks` has a select
  policy for the centre's members and no write policy; a trigger requires the lock to name the
  record's own centre. While locked, the home-centre clause of `customers_select`,
  `customer_field_values_select`, `documents_select`, `document_derivatives_select`,
  `has_customer_access` and the `assistigo documents read` storage policy is closed; the
  roaming-grant clause is not, so a new approval (time-boxed grant) reopens the record for the
  operator it names. Locking ends any live grant the centre holds. The centre still lists the
  customer through `centre_customer_list` (masked, `is_locked`) and still gets the masked card and
  scheme matches through `roaming_customer_card`. `can_request_customer_access` (link, or own
  locked record) gates every request path. Writes that do not read the record first are not
  blocked by the lock; the routes all load the customer first. Audited as
  `customer.citizen_locked` / `customer.citizen_unlocked` (`sensitive`).
- **One request button (0046).** `POST /api/customers/:id/roaming/request-access` checks
  `can_request_customer_access` before reading the number, then sends to the BharatDoc app when
  the number has an app account, otherwise a WhatsApp code. The response reveals which; accepted
  by the product owner. 0045's copy of an approved customer was dropped by 0046.

### Walk-in intake (migrations 0022, 0023, 0025)

A citizen sends documents over WhatsApp, Telegram or the `/drop/<code>` page before they are a
customer. None of those callers has a user session, so intake runs with the service role and each
entry point carries its own fail-closed gate. The dashboard side (queue, preview, convert,
discard) runs under the operator's JWT and RLS as usual: `document_drop_sessions` /
`document_drop_files` follow `documents` — viewers read, operators work, owners/managers delete.

| Entry point                              | Authentication                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/webhooks/whatsapp` (handshake) | `hub.verify_token` compared in constant time; mismatch → 403                                                                                    |
| `POST /api/webhooks/whatsapp`            | HMAC-SHA256 of the **raw** body under the app secret vs `X-Hub-Signature-256`, constant time; no app secret configured → every delivery refused |
| `POST /api/webhooks/telegram`            | `X-Telegram-Bot-Api-Secret-Token` vs the configured secret, constant time; unset → refused                                                      |
| `POST /api/document-drop/public/:code`   | the code itself: a live session code, or the organization's permanent `counter_drop_code`                                                       |

Shared rules:

- **Unconfigured means 404**, not a half-working endpoint. Credentials resolve from
  `platform_channel_settings` first (2 s lookup ceiling) and fall back to `WHATSAPP_*` /
  `TELEGRAM_*`.
- **Authenticated deliveries always get 200**, including ones that fail per message: a non-2xx
  earns a provider retry that would re-download and re-store a citizen's documents.
- **The session is resolved before media is downloaded**, so a stranger messaging the bot costs
  one lookup, not a fetch from Meta's or Telegram's CDN. Downloads are capped at 15 MB on the
  declared size, `content-length` and actual bytes.
- **Add-only.** No inbound path can read, list or preview anything in a session. Unknown,
  expired, malformed and already-claimed codes return one indistinguishable 404.
- **Limits**: 15 MB per file, sniffed MIME allow-list (JPEG, PNG, WebP, PDF), 10 files per
  session, two-hour session expiry (`DROP_SESSION_TTL_MINUTES`), and at most 60 sessions per hour
  minted from one counter code — the only path that creates a session with no authenticated
  caller. There is no per-IP rate limit on the public upload route.
- **Staged, not trusted.** Only an operator's convert (`POST …/sessions/:id/convert`) creates a
  customer, promotes files into `documents` and queues extraction; extracted values still need
  review. Convert re-checks permissions per effect: `document.upload`, plus `customer.create`
  when it makes a profile, plus `customer.roaming_authenticate` for a roaming save.
- The citizen's `sender_id` is stored on the session to pre-fill the profile; it is personal data
  and must never be logged or put in audit metadata (§5).

### Sessions roster (migration 0031)

`/settings/sessions` lets every member see where their own account is signed in and sign those
places out (spec §19.4; AUTH-05). It reads GoTrue's `auth.sessions` through two security-definer
functions, `list_my_auth_sessions()` and `revoke_my_auth_session(id)`, both scoped by
`auth.uid()` and the JWT's `session_id`, and granted to `authenticated` only:

- No argument names a user, so nobody — an owner included — can list or end another member's
  sessions from here. `revoke_my_auth_session` returns `false` alike for an unknown id, a foreign
  id and the caller's current session, so it cannot be used to probe ids.
- Revoking deletes the session row; its refresh tokens cascade, and GoTrue's `/user` check (what
  `getUser()` calls on every dashboard request and extension API call) rejects the access token at
  once. Only a direct PostgREST call holding the old JWT keeps working until it expires (≤ 1 h).
- "Sign out all other sessions" is GoTrue's own `signOut({ scope: 'others' })`, as on password reset.
- A paired extension holds the session of the browser it was paired from (docs/EXTENSION.md §3),
  so it is never its own row; signing that browser out disconnects it too. The page says so.
- The roster shows a coarse browser / OS / device class (`summarizeUserAgent`, no versions or
  models) and the session's IP. The raw User-Agent never leaves the server.
- Sign-in, refresh and extension refresh all run on our server, so `lib/supabase/forwarded-client.ts`
  forwards the browser's `User-Agent` and first `X-Forwarded-For` address to Supabase Auth. Without
  that every session would be recorded as Node at our server's IP. This changes what GoTrue keeps on
  `auth.sessions` (the person's IP rather than ours) — the same value `audit_logs.ip_address`
  already holds, with the same processor — and makes GoTrue's per-IP rate limits per person rather
  than shared by every centre.

## 3. Role permission matrix

| Capability               | owner |    manager    | operator |  viewer  | billing_admin |
| ------------------------ | :---: | :-----------: | :------: | :------: | :-----------: |
| View customers           |   ✓   |       ✓       |    ✓     |    ✓     |       –       |
| Create/edit customers    |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Delete customer          |   ✓   |       ✓       |    –     |    –     |       –       |
| Upload / view documents  |   ✓   |       ✓       |    ✓     | ✓ (view) |       –       |
| Delete document          |   ✓   |       ✓       |    –     |    –     |       –       |
| Review extraction        |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Reveal sensitive field   |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Roaming lookup / link    |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Roaming OTP / revoke     |   ✓   |       ✓       |    ✓     |    –     |       –       |
| View walk-in drop queue  |   ✓   |       ✓       |    ✓     |    ✓     |       –       |
| Open / convert drop      |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Preview staged drop file |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Discard drop session     |   ✓   |       ✓       |    –     |    –     |       –       |
| Run fill session         |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Portal logins: save/edit/remove (`credential.manage`) | ✓ | ✓ | ✓ | – | – |
| Portal logins: reveal, one-click login, slip (`credential.use`) | ✓ | ✓ | ✓ | – | – |
| Create/edit applications |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Manage members / roles   |   ✓   | ✓ (not owner) |    –     |    –     |       –       |
| Manage billing           |   ✓   |       –       |    –     |    –     |       ✓       |
| Org security / AI vendor |   ✓   |       –       |    –     |    –     |       –       |
| Export / delete org data |   ✓   |       –       |    –     |    –     |       –       |

Implemented once in `packages/core/src/auth/permissions.ts` and mirrored by RLS policies.

## 4. Sensitive data handling

### Aadhaar-like identifiers

- The full number may be stored, in `identity_summary_json.aadhaar` (migration 0026,
  DEVELOPMENT_RULES §1 rule 5). `identity_summary_json.aadhaar_last4` remains available for
  callers that only need four digits (e.g. a portal field that explicitly asks for just that).
  Storage is unconditional for every organization: the old per-org
  `settings.allow_full_aadhaar` opt-in is backfilled to `true` and no longer read, and the
  database trigger that refused a twelve-digit value now only validates `aadhaar_last4`.
- "With customer consent" is the product rule, but **no code path checks a consent record**
  before storing or filling the number; it rests on the operator.
- It is **not** field-encrypted. `customer.aadhaar` is a `json`-storage key, so it sits in
  `customers.identity_summary_json` and in `customer_field_values.value_text` (with a masked
  `display_value`), protected by RLS and whatever at-rest encryption the database host provides —
  not by `FIELD_ENCRYPTION_KEY`, unlike PAN and bank
  account, which only ever exist as `value_encrypted` ciphertext.
- The full value reaches a client in exactly two ways: `POST /api/customers/:id/reveal` (one
  field, `customer.reveal_sensitive`, audited `critical`) and `POST /api/forms/map`, which returns
  a value only for a portal field it actually mapped, for the extension to fill.
- Extraction masks an Aadhaar-like number out of every field's value and source snippet except
  `customer.aadhaar` itself — a stray number that leaked into an unrelated field is not the
  customer's reviewed Aadhaar value, and is still masked (`packages/ai/src/safety.ts`).
- Display is always masked (`XXXX XXXX 1234`) — `GET /api/customers/:id` and the field-value
  `display_value` mask both Aadhaar keys; revealing it is an explicit audited action, exactly as
  for any other sensitive field. It is `high_risk`, so an extracted value is always
  `needs_review`.
- Aadhaar is never a search key and is never indexed, and is never written to a log, error
  report, or portal adapter report.

### PAN, bank account

- Stored encrypted (AES-256-GCM) in `customer_field_values.value_encrypted`, never in plaintext
  columns.
- Masked by default; revealing requires permission `customer.reveal_sensitive` and writes an
  audit entry with sensitivity `critical`.

### Encryption

`packages/core/src/privacy/crypto.ts` — AES-256-GCM, key from `FIELD_ENCRYPTION_KEY`
(base64, 32 bytes). Ciphertext format: `v1.<iv_b64>.<tag_b64>.<ct_b64>`. The version prefix
exists so keys can be rotated without ambiguity. Encryption happens server-side only.

Every ciphertext is bound to its context by GCM additional data, so a value cannot be moved to
another row and still decrypt:

| Ciphertext                                          | AAD                              |
| --------------------------------------------------- | -------------------------------- |
| `customer_field_values.value_encrypted` (PAN, bank) | organization, customer and field |
| `customer_portal_credentials.*_encrypted` (0036)    | organization, customer, row and part (`login_id` / `password` / `security_answer`) |
| `organization_ai_settings.api_key_encrypted` (0017) | `<org id>:ai_vendor_api_key`     |
| `platform_channel_settings.*_encrypted` (0023)      | channel-scoped                   |
| `extension_pairing_codes.session_payload` (0012)    | the pairing code's hash          |

### Third-party credentials

- **Organization AI vendor key** — owner-only (`org.security`); the settings API reports only
  whether one is set. A vendor base URL must be `https://` and may not be localhost, a private
  range or the cloud metadata address, so an owner account cannot make the server probe
  internal infrastructure. For a Google `googleapis.com` endpoint the key is sent as a `key=`
  query parameter as well as a bearer header, so it can appear in that vendor's request logs.
- **Walk-in channel tokens** — Super Admin only, encrypted at rest, never returned (§2).
- Environment secrets are read through `apps/web/lib/env.ts`; only the Supabase URL/anon key and
  the app URL/environment are `NEXT_PUBLIC_`.

### Documents

- Bucket `customer-documents`, private, no public policy.
- Upload path: `org/<organization_id>/customer/<customer_id>/<document_id>/<filename>`.
- Access only through `POST /api/documents/:id/signed-url` (≤ 300 s expiry, audited).
- MIME type and magic-byte sniffing on upload; extension is not trusted.
- Generated derivatives have EXIF stripped.
- Walk-in drop files are staged in the same bucket under `org/<organization_id>/drop/<session_id>/…`,
  with the same 15 MB ceiling and sniffed MIME allow-list. An operator may preview one through
  `POST /api/document-drop/sessions/:id/files/:fileId/signed-url` (5 min, `document.download`,
  audited `drop_file.previewed`). Unclaimed sessions are deleted — rows and bytes — by the sweep
  on `/api/jobs/run` two hours after they open.

### Scheme logos and artwork

- Bucket `scheme-logos` (0027; banners and illustrations since 0028), private, **no storage
  policies at all**: uploads go through the
  platform admin panel with the service role, and tenants cannot read or write the bucket directly.
- Served to signed-in users only by `GET /scheme-logos/<slug>/<uuid>.<ext>`, which checks the path
  shape before touching storage and answers with `nosniff` and a `default-src 'none'; sandbox` CSP.
  Logos are reference imagery with no personal data, so any signed-in user may read any logo.
- Upload type is decided by magic bytes (PNG, JPEG, WebP); SVG is refused. Size is capped per kind
  in the action (logo 256 KB, illustration 512 KB, banner 1 MB) and at 1 MB on the bucket; the
  Server Action body limit is 2 MB to fit a banner. The object path is built on the server from the
  row's slug and a fresh uuid, and the column written is chosen from a fixed map by a validated
  kind — the request never names a column.

## 5. Logging and redaction

Never logged: full Aadhaar / PAN / bank values, raw OCR text, document contents, field values,
customer names, mobile numbers, email addresses.

All log payloads go through `packages/core/src/privacy/redact.ts`, which:

- drops any key matching the sensitive-key list (`aadhaar`, `pan`, `account`, `otp`,
  `password`, `token`, `full_name`, `mobile`, …),
- replaces values with a type tag and length (`"[redacted:string:11]"`),
- truncates deep objects.

Production logs are structured JSON with a trace id. Debug payloads exist only when
`NEXT_PUBLIC_APP_ENV=local` (`logger.debug` is a no-op elsewhere).

The key list is substring-matched, so it catches `customer_mobile` but not an identifier with an
unrelated name. Two such identifiers exist and are kept out by call sites, not by `redact()`:
the walk-in `sender_id` / Telegram `chatId` (a citizen's phone number or chat id), and the
roaming customer's mobile used to address the OTP. Walk-in and roaming log lines carry session,
organization and customer ids, counts, channel and reason codes only — never a sender, a
filename, a caption or the OTP. Webhook rejections log the event name with an empty payload.

## 6. Audit events (spec §19.5)

Recorded in `audit_logs` with sensitivity `normal | sensitive | critical`:

| Category        | Actions                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth / members  | `auth.login_failed`, `auth.password_changed`, `auth.session_revoked`, `extension.paired`, `member.invited` / `accepted` / `removed` / `role_changed`                                                                                                                                                                                                                                                                                                  |
| organization    | `organization.created` / `updated` / `security_updated` / `ai_settings_updated` / `deleted`                                                                                                                                                                                                                                                                                                                                  |
| customers       | `customer.created` / `updated` / `deleted` / `sensitive_revealed` / `exported`                                                                                                                                                                                                                                                                                                                                               |
| roaming (0024)  | `customer.roaming_lookup` / `roaming_linked` / `roaming_otp_requested` / `roaming_access_granted` / `roaming_access_revoked` / `roaming_access_expired`                                                                                                                                                                                                                                                                      |
| vault (0038)    | `vault.lookup` / `unlock_failed` / `grant_created` / `grant_ended` / `document_opened` / `copy_saved` — catalogued now; written by the operator bridge routes (Phase 2 step 4). The citizen-facing record is `vault_access_events`. |
| documents       | `document.uploaded` / `downloaded` / `deleted`, `extraction.completed` / `accepted` / `rejected`, `derivative.created`                                                                                                                                                                                                                                                                                                       |
| walk-in drop    | `drop_session.created` / `converted` / `discarded`, `drop_file.previewed`, `drop_file.saved_to_roaming`                                                                                                                                                                                                                                                                                                                      |
| form filling    | `fill_session.started` / `completed`, `form_report.created`, `adapter.updated`                                                                                                                                                                                                                                                                                                                                               |
| applications    | `application.created` / `updated` / `status_changed` / `deleted` / `document_updated`                                                                                                                                                                                                                                                                                                                                        |
| billing         | `billing.plan_changed`, `billing.webhook_processed`                                                                                                                                                                                                                                                                                                                                                                          |
| privacy         | `consent.granted` / `withdrawn`, `data.export_requested` / `delete_requested` / `deleted`                                                                                                                                                                                                                                                                                                                                    |
| support         | `support.access_granted` / `access_used` / `access_revoked`                                                                                                                                                                                                                                                                                                                                                                  |
| platform (§6.1) | `platform.admin_signed_in` / `admin_granted` / `admin_role_changed` / `admin_revoked`, `platform.scheme_created` / `scheme_updated` / `scheme_deadline_updated` / `scheme_published` / `scheme_deleted`, `platform.adapter_updated`, `platform.scraper_source_updated` / `scraper_run_triggered`, `platform.queue_item_approved` / `queue_item_rejected`, `platform.channel_settings_updated` / `channel_webhook_registered`, `platform.console_access_denied`, `platform.tenant_suspended` / `tenant_reactivated` / `tenant_plan_overridden` |

Platform rows carry `organization_id = null` — they are platform-wide acts — and none is `normal`.
Roaming records the lookup that found nothing too, because a run of empty lookups is what an
operator fishing for numbers looks like; `roaming_access_granted` is `critical`, since it is the
moment another centre's record becomes readable. `drop_session.created` is `sensitive` because
it publishes a code that lets anyone holding it send documents into the organization;
`drop_session.converted` is `critical` because it is the step where staged intake becomes
customer data. An unknown action name defaults to `sensitive`.

The last two are the walk-in intake pair (§9.1). A staged file is bytes a stranger sent about a
person who is not yet a customer, so issuing a signed URL over one is audited exactly as
`document.downloaded` is — reading it is the sensitive act, not claiming it. `drop_file.saved_to_roaming`
is `critical` and records the grant id, because it is the only write in the product that crosses
a tenant boundary.

The action catalogue is `packages/core/src/audit/actions.ts`. Audit rows are insert-only:
no update or delete policy exists for any role.

Catalogued but not yet written by any code path (the feature behind each is not built, or does
not record it): `organization.security_updated`, `organization.deleted`,
`customer.exported`, `customer.roaming_access_expired` (the expiry sweep is unscheduled),
`extraction.completed`, `adapter.updated`, `billing.webhook_processed`, `consent.granted` /
`withdrawn`, `data.export_requested` / `delete_requested` / `deleted`, and all three `support.*`.
`organization.created` and `member.accepted` are written in SQL by
`create_organization` / `accept_invitation` (0011).

## 7. Extension security (spec §15.3, §19.6)

- Permissions requested: `activeTab`, `storage`, `scripting`, `sidePanel`, `downloads` (one-click
  download of a prepared file; docs/EXTENSION.md §1).
- **Deviation, open:** the intended design is no broad `host_permissions` at install time, with
  page access granted per tab by user action. The shipped manifest declares
  `host_permissions: ["http://*/*", "https://*/*"]` and a content script on every http(s) page
  and frame (since c8cd42d). The script only sets a presence marker and listens until asked to
  detect fields, but this diverges from spec §15.2 and needs a product-owner decision before a
  store build (docs/EXTENSION.md §1).
- Never runs on `chrome://`, `chrome-extension://`, `about:`, `file://` or the Chrome Web Store.
- All bundled code; no `eval`, no `new Function`, no remotely hosted scripts.
- Every runtime message is Zod-parsed and the sender verified (`sender.id === chrome.runtime.id`).
- Text taken from the host page is rendered via `textContent`, never `innerHTML`.
- Customer values live in memory for the duration of a fill and in `chrome.storage.session` at
  most; never in `chrome.storage.local`.
- Field values are never written to the console, even in debug builds.

## 8. Abuse prevention (spec §19.7)

Hard-coded refusals in `packages/form-engine/src/safety.ts`:

- `isCaptchaField()` → always skipped, never read.
- `isOtpField()` → always skipped.
- `isPaymentField()` → never filled in the MVP.
- `isSubmitControl()` → the fill executor refuses to click, and never dispatches
  `form.submit()` or a click on `type="submit"`.

These are covered by regression tests that must never be deleted.

### Portal credential vault (spec §19.7a, migration 0036)

The one sanctioned form of credential automation, decided by the product owner on 2026-11-07.
It stores the logins that open a citizen's government accounts, so every layer is narrow:

| Layer | Control |
| --- | --- |
| Storage | Login ID, password, security answer are AES-256-GCM ciphertext bound to row + part (§4 Encryption). The list API returns only a masked hint and `hasPassword` / `hasSecurityAnswer`. |
| Access | `credential.manage` / `credential.use`: owner, manager, operator. RLS has no viewer, support-access or roaming clause; `loadOwnCustomer` pins every route to the caller's own organization. |
| Taking a secret out | Three routes only, each a `critical` audit entry naming portal + part, never the value, with `cache-control: no-store`: `POST …/portal-credentials/:id/reveal` (one part per call), `POST /api/portal-credentials/login-fill`, `POST …/portal-credentials/:id/slip`. |
| Where a password may be typed | `portalForUrl()` — `https:`, default port, no `user:pass@`, host equal to or a dot-boundary subdomain of a catalogue host (all `.gov.in` / `.nic.in`). Checked by the background worker on the tab URL, by the server on the submitted URL (the caller cannot name the portal), and by the content script on its own `location` before typing. |
| What is typed | Login ID and password into the top document only. No click, no submit, no Enter; CAPTCHA and OTP boxes are never written (`apps/extension/tests/portal-login.test.ts`). The form filler's own refusal of password fields is unchanged and now also re-checked on the live element. |
| In the extension | Values pass through the service worker in memory to one `APPLY_PORTAL_LOGIN` message and are never written to `chrome.storage`. The side panel never receives them. |
| Dashboard | A revealed part is shown for 30 s, then dropped. A printed slip exists in the DOM only for the print dialog. |
| WhatsApp slip | Sent only to `customers.mobile` from the platform's WhatsApp number, by explicit operator action. It transits Meta's Cloud API (accepted by the product owner); printing is the alternative. |
| Generator | Random from Web Crypto (`Word@1234` shape, ~36 bits, no 0/O/1/l/I). Never derived from the citizen. |
| Logs | `redact()` also drops `username`, `login_id`, `security_answer`, `roll_number` keys. |

## 9. Support access

Internal staff cannot read customer data by default. A row in `support_access_grants`
(`organization_id`, `granted_to`, `reason`, `expires_at`, `approved_by`) is required; it is
time-boxed, org-approved, and every use writes an audit entry.

## 10. Data subject rights

- **Export** (planned): an org JSON + files archive. There is no export route yet; `data.export`
  is an allowed job type with no handler.
- **Delete** (target): customer deletion soft-deletes the profile, hard-deletes storage objects,
  and records a `data.delete` audit entry, with retention sweeps via the `retention.sweep` job.
  Today `DELETE /api/customers/:id` soft-deletes and audits `customer.deleted` only; neither the
  storage removal nor `retention.sweep` has a handler yet. Walk-in drops are the exception: their
  unclaimed bytes and rows are swept after two hours (§4).
- **Consent**: `consent_records` stores versioned consent per customer per subject
  (`customer_data`, `document_storage`, `ai_processing`, and `roaming_access` since 0024) with
  grant/withdraw timestamps. The only writer today is the roaming OTP verify path.

## 11. Pre-pilot security checklist

- [ ] RLS tests pass for every tenant table
- [ ] Cross-organization access denied in tests
- [ ] `billing_admin` cannot read documents — rows or Storage bytes (0037)
- [ ] Migration 0037 applied and `rls-tests/operator_principal.test.ts` passes before phone
      sign-in is enabled for the citizen app
- [ ] Migration 0038 applied and `rls-tests/citizen_vault.test.ts` passes; `VAULT_MASTER_KEY`
      set, backed up, distinct from `FIELD_ENCRYPTION_KEY`
- [ ] Legal review: citizen cloud vault, consent text (Hindi + English), under-18 citizens (DPDP §9)
- [ ] Storage bucket is private; signed URL expiry ≤ 300 s
- [ ] No PII appears in application logs during a full QA pass
- [ ] Sensitive reveal writes an audit entry
- [ ] Extension requests only the five documented permissions, and the broad
      `host_permissions` / all-pages content script is resolved (§7)
- [ ] WhatsApp app secret and Telegram webhook secret set wherever those channels are enabled;
      forged deliveries rejected
- [ ] RLS tests added for `document_drop_sessions` / `document_drop_files` and
      `platform_channel_settings`
- [ ] A scheduler calls `/api/jobs/run` (drop purge) and something runs
      `expire_roaming_access_grants()`
- [ ] `ADMIN_EMAILS` emptied once the `platform_admins` roster is populated
- [ ] Migration 0030 applied, and `rls-tests/tenant_management.test.ts` passes against it
- [ ] MFA required for console sign-in (§2, "Console sign-in")
- [ ] Safety regression tests (captcha/otp/payment/submit) pass
- [ ] Migration 0036 applied; `rls-tests/portal_credentials.test.ts` and
      `apps/extension/tests/portal-login.test.ts` pass
- [ ] Portal login hosts in `packages/core/src/portal-credentials/portals.ts` verified against each
      live portal, and a generated password accepted by each
- [ ] Legal review of storing citizen portal passwords (DPDP consent wording) before pilot
- [ ] `FIELD_ENCRYPTION_KEY` set, and rotation procedure documented
- [ ] Backup and restore verified
