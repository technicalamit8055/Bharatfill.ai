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
- Service role bypasses RLS and is used only by migrations, the job worker, the billing webhook,
  the seed script and the Super Admin panel (see below).

### Platform tables (migration 0021)

`platform_admins`, `scraper_sources`, `scraper_runs` and `scraped_schemes_queue` are internal
staff infrastructure, not tenant data. They carry **no `organization_id`**, hold no personal data,
and have RLS enabled with **no policy for `authenticated`** — the same shape as `jobs` and
`billing_webhook_events`. A tenant's JWT presented directly to PostgREST therefore reaches none
of them, whatever the application layer believes.

The one exception is a self-read policy on `platform_admins`: a signed-in user may select their
own row and nobody else's, so a client can learn "am I staff?" without the roster of internal
staff becoming enumerable.

The Super Admin panel is consequently the fourth permitted holder of the service-role client. It
authorises first — `apps/web/lib/admin/context.ts` verifies the JWT, looks the caller up on the
roster, and throws before either client is handed out — and only then acts with the service role
to read tenant aggregates and write global catalogue rows. Both tenant reads go through
`platform_metrics()` and `platform_tenant_rows()`, which return **counts and organization
metadata only**; no admin screen has another source of tenant data, so "internal staff cannot see
customer records" is a property of two reviewable SQL functions rather than of application code.
Reading a centre's actual records still requires a `support_access_grant` (§19.9), which the panel
does not issue.

RLS is verified by `packages/database/rls-tests`, which must pass before pilot (spec §23.3).

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
- **One write crosses the boundary (migration 0025), and only one.** A grant holder may *insert* a
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
| Run fill session         |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Create/edit applications |   ✓   |       ✓       |    ✓     |    –     |       –       |
| Manage members / roles   |   ✓   | ✓ (not owner) |    –     |    –     |       –       |
| Manage billing           |   ✓   |       –       |    –     |    –     |       ✓       |
| Org security settings    |   ✓   |       –       |    –     |    –     |       –       |
| Export / delete org data |   ✓   |       –       |    –     |    –     |       –       |

Implemented once in `packages/core/src/auth/permissions.ts` and mirrored by RLS policies.

## 4. Sensitive data handling

### Aadhaar-like identifiers

- The full number may be stored, in `identity_summary_json.aadhaar`, with customer consent.
  `identity_summary_json.aadhaar_last4` remains available for callers that only need four
  digits (e.g. a portal field that explicitly asks for just that).
- Extraction masks an Aadhaar-like number out of every field's value and source snippet except
  `customer.aadhaar` itself — a stray number that leaked into an unrelated field is not the
  customer's reviewed Aadhaar value, and is still masked (`packages/ai/src/safety.ts`).
- Display is always masked (`XXXX XXXX 1234`); revealing it is an explicit audited action,
  exactly as for any other sensitive field.
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

### Documents

- Bucket `customer-documents`, private, no public policy.
- Upload path: `org/<organization_id>/customer/<customer_id>/<document_id>/<filename>`.
- Access only through `POST /api/documents/:id/signed-url` (≤ 300 s expiry, audited).
- MIME type and magic-byte sniffing on upload; extension is not trusted.
- Generated derivatives have EXIF stripped.

## 5. Logging and redaction

Never logged: full Aadhaar / PAN / bank values, raw OCR text, document contents, field values,
customer names, mobile numbers, email addresses.

All log payloads go through `packages/core/src/privacy/redact.ts`, which:

- drops any key matching the sensitive-key list (`aadhaar`, `pan`, `account`, `otp`,
  `password`, `token`, `full_name`, `mobile`, …),
- replaces values with a type tag and length (`"[redacted:string:11]"`),
- truncates deep objects.

Production logs are structured JSON with a trace id. Debug payloads exist only when
`NEXT_PUBLIC_APP_ENV=local`.

## 6. Audit events (spec §19.5)

Recorded in `audit_logs` with sensitivity `normal | sensitive | critical`:

login failure · member invite/remove/role change · customer create/update/delete ·
sensitive field reveal · document upload/download/delete · extraction accepted ·
fill session run · application status change · billing plan change · data export/delete ·
support access grant and use · roaming lookup/link/OTP requested/access granted/revoked/expired ·
walk-in drop session created/converted/discarded · staged drop file previewed · drop files saved
to a roaming customer.

The last two are the walk-in intake pair (§9.1). A staged file is bytes a stranger sent about a
person who is not yet a customer, so issuing a signed URL over one is audited exactly as
`document.downloaded` is — reading it is the sensitive act, not claiming it. `drop_file.saved_to_roaming`
is `critical` and records the grant id, because it is the only write in the product that crosses
a tenant boundary.

The action catalogue is `packages/core/src/audit/actions.ts`. Audit rows are insert-only:
no update or delete policy exists for any role.

## 7. Extension security (spec §15.3, §19.6)

- Permissions requested: `activeTab`, `storage`, `scripting`, `sidePanel`. No broad
  `host_permissions` at install time; page access is granted per-tab by user action.
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

## 9. Support access

Internal staff cannot read customer data by default. A row in `support_access_grants`
(`organization_id`, `granted_to`, `reason`, `expires_at`, `approved_by`) is required; it is
time-boxed, org-approved, and every use writes an audit entry.

## 10. Data subject rights

- **Export**: `POST /api/settings/data/export` produces a JSON + files archive for the org.
- **Delete**: customer deletion soft-deletes the profile, hard-deletes storage objects, and
  records a `data.delete` audit entry. Retention sweeps run via the `retention.sweep` job.
- **Consent**: `consent_records` stores versioned consent per customer per subject
  (`customer_data`, `document_storage`, `ai_processing`) with grant/withdraw timestamps.

## 11. Pre-pilot security checklist

- [ ] RLS tests pass for every tenant table
- [ ] Cross-organization access denied in tests
- [ ] `billing_admin` cannot read documents
- [ ] Storage bucket is private; signed URL expiry ≤ 300 s
- [ ] No PII appears in application logs during a full QA pass
- [ ] Sensitive reveal writes an audit entry
- [ ] Extension requests only the four documented permissions
- [ ] Safety regression tests (captcha/otp/payment/submit) pass
- [ ] `FIELD_ENCRYPTION_KEY` set, and rotation procedure documented
- [ ] Backup and restore verified
