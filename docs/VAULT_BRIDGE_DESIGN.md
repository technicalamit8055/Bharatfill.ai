# Citizen Vault ↔ Operator Bridge — Design (Phase 2 and Phase 3)

Status: **design approved for build, 2026-11-11.** Decisions D1–D4 were made by the product owner;
D5–D15 were delegated by the product owner ("choose what makes it easiest for CSC operators and
citizens") and are recorded here. Items marked **Legal** still need the professional
legal/privacy review required before pilot (spec §19.1, `docs/SECURITY.md`); build them as written,
but they do not go live with real citizens until that review signs off.

Scope source: `docs/MASTER_BUILD_SPEC.md` Phase 11 and V1.x; `docs/CITIZEN_MOBILE_APP_SPEC.md`
§3 Features 3–4, §5, §6. Where this document and those sections differ, **this document wins**
for the bridge; the differences are listed in §12.

Build progress (§9):

- Done: migration 0037 (operator-principal guard and Storage read fix, `docs/SECURITY.md` §2
  "Operator principals").
- Done, server side of step 1: migration 0038 (all Phase 2 tables, phone sign-up tagging, the
  `citizen-vault` bucket), `@assistigo/core` `citizen-vault` (schemas, limits, grant/PIN/restore
  rules), `vault.access` permission and `vault.*` audit actions, `apps/web/lib/citizen/`
  (citizen context, key wrapping, account service), `/api/citizen/account` and
  `/api/citizen/restore/pin`. Not yet run against a database: needs `npm run test:rls`.
- Done, app side of step 1 (off unless the build sets `apps/mobile/.env.example`'s three
  `EXPO_PUBLIC_*` values): phone OTP sign-in by plain `fetch` to Supabase Auth (no supabase-js),
  session and document key in SecureStore, profile reduced to name + language, Vault PIN +
  consent creating the account, Vault PIN restore on a new phone (`apps/mobile/lib/cloud/`,
  `app/(auth)/`). Not yet run on a device or against a live SMS sender.
- Done, step 2 (sync), both sides: `/api/citizen/documents` (+ `/:id`, `/:id/confirm`) and
  `apps/web/lib/citizen/documents.ts`; the phone's planner (`lib/cloud/sync-plan.ts`), runner
  (`lib/cloud/sync.ts`, on launch, foreground and after each change) and "Keep on this phone only"
  in Document Details. File format v1 is pinned in `@assistigo/core` and proven against Node in
  `apps/web/lib/citizen/vault-file.test.ts`. Not yet run on a device.
- Open from step 2: a sweep for upload slots never confirmed and for soft-deleted rows whose bytes
  failed to delete (needs the `/api/jobs/run` scheduler); bringing synced documents back onto a
  restored phone (download + import) is not built.
- Next: step 4 (operator bridge), then step 3's other restore paths (old-phone approval, 7-day
  hold).
- **Changed 2026-11-22 (product owner): app accounts are ordinary customers — see §13.** It
  supersedes D10's "no extracted fields" and §4's separate "Bharatfill Vault" box; the grant,
  code and file routes of §4 and §6 are no longer reached from the dashboard or the extension.
- **Changed 2026-11-23 (product owner): everyday scans stay on the phone — see §15.** D1's
  automatic sync now covers form documents only. "Other" and untyped scans are never uploaded
  unless the citizen turns sharing on.

---

## 1. Decisions

| #   | Decision                                   | Choice                                                                                                                                                                                                                                                                                                                                                                                                                | Why it is the easy one                                                                                                                                | Legal |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | :---: |
| D1  | Data model                                 | **Automatic cloud sync** of the vault                                                                                                                                                                                                                                                                                                                                                                                 | Documents are ready even when the citizen's phone is off or at home                                                                                   |   ✓   |
| D2  | Mode A                                     | **Named centres**: the citizen names up to 3 centres; each lasts 90 days, renewed with one tap                                                                                                                                                                                                                                                                                                                        | Regular customers are never asked for a code at their own cafe                                                                                        |   ✓   |
| D3  | Mode C                                     | **6-digit one-time code** in the app; access up to **2 hours**                                                                                                                                                                                                                                                                                                                                                        | Same shape as the roaming OTP operators already know                                                                                                  |       |
| D4  | Order                                      | Fix F1 + F2 first                                                                                                                                                                                                                                                                                                                                                                                                     | Done (0037)                                                                                                                                           |       |
| D5  | Choosing a mode                            | **No per-citizen mode setting.** Every request offers all available paths at once: named centre → opens; otherwise the citizen either taps **Approve** or reads out the **code**                                                                                                                                                                                                                                      | Nobody has to understand "modes"; the citizen does whichever is easier at that moment                                                                 |       |
| D6  | Encryption                                 | **Envelope encryption, server-held keys**: one data key per citizen, wrapped by a server master key                                                                                                                                                                                                                                                                                                                   | Operators can open documents without the citizen's phone being online; invisible to users                                                             |       |
| D7  | New phone                                  | OTP, then **any one of**: approve on the old phone · enter the 4-digit **Vault PIN** · wait a **7-day hold**                                                                                                                                                                                                                                                                                                          | Most people restore in seconds with their PIN; a lost phone + forgotten PIN still recovers                                                            |       |
| D8  | Retention                                  | Kept **until the citizen deletes it**; deleted after **24 months with no sign-in**, with warnings at 30 and 7 days                                                                                                                                                                                                                                                                                                    | "Your documents stay until you delete them" is the simplest promise                                                                                   |   ✓   |
| D9  | Sign-in OTP                                | **SMS** (DLT-registered Indian gateway via Supabase's Send SMS hook), Android SMS autofill, **WhatsApp fallback** ("Didn't get SMS?"); **+91 numbers only**                                                                                                                                                                                                                                                           | SMS works on every SIM; autofill means no typing; WhatsApp rescues poor SMS delivery                                                                  |       |
| D10 | Profile data (**superseded by §13**)       | **Name (as on documents) + preferred language** only. Mobile comes from sign-in. No Aadhaar, address or extracted fields in Phase 2                                                                                                                                                                                                                                                                                   | Shortest sign-up; least to protect                                                                                                                    |       |
| D11 | Under 18                                   | **No restriction** (product owner, 2026-11-17): no age question; every account gets sync and centre access. DPDP §9 asks for verifiable parental consent for under-18s, so legal must confirm before pilot                                                                                                                                                                                                            | Students — a large share of scholarship and exam applicants — get the full app with no extra step                                                     |   ✓   |
| D12 | Notifications                              | Expo push (FCM/APNs). Text **names the centre, never the documents**: "Sharma Cyber Cafe opened your documents"                                                                                                                                                                                                                                                                                                       | The citizen recognises the centre instantly; no caste/income certificate name on a lock screen                                                        |   ✓   |
| D13 | Access log after account deletion          | Kept **3 years**, with the citizen link removed (centre, operator, time, document _type_ remain)                                                                                                                                                                                                                                                                                                                      | The centre's accountability record survives; the citizen's identity does not                                                                          |   ✓   |
| D14 | Centre keeps a copy                        | **Off by default.** Approval screen offers "Let this centre keep a copy"                                                                                                                                                                                                                                                                                                                                              | With sync + named centres the centre rarely needs one; the citizen decides                                                                            |       |
| D15 | Operator MFA                               | **Not required** for code or approval access (every access needs the citizen in the loop). **Required for the centre owner** before citizens can name that centre (Mode A)                                                                                                                                                                                                                                            | Daily operators get no extra login step; standing access gets a stronger door                                                                         |       |
| D16 | Log out / Delete account on a shared phone | **Ask every time**: "remove the documents from this phone" or "keep them", neither pre-selected, naming how many exist only on this phone (lost if removed) and that kept documents open for anyone using the phone. Log out revokes the session and forgets this account's document key, so signing in again needs the Vault PIN. Delete account keeps the phone's documents as a plain offline vault when asked to. | Family phones are shared; a silent wipe loses unsynced scans, a silent keep leaves a caste or income certificate open to the next user                |   ✓   |
| D17 | Changing the Vault PIN                     | **Personal Information → Change Vault PIN**: current PIN + new PIN twice (sign-up strength rules, must differ). A wrong current PIN counts toward the §3.3 restore limits (same counters). On success the server signs out **every other session** of the account and writes a `pin_changed` access event (migration 0040). The lifetime failure count is not reset.                                                  | A centre that "made the account" for a citizen knows the PIN it chose; one change, and only the citizen knows it and the centre's phone is signed out |       |

The vault index also records the **one account it syncs with** (`cloudAccountId`): a second person
signing in on the same phone never has the first person's documents uploaded into their vault.

Defaults chosen alongside these: grant length 2 hours (citizen may pick 30 minutes); sync over
mobile data allowed; each document can be marked **"Keep on this phone only"** and is then never
uploaded.

---

## 2. Identity

- Citizens and operators share one Supabase project and `auth.users`, but never an account.
- **Every phone sign-up is tagged `app_metadata.principal = 'citizen'` at creation**, by a
  `before insert` trigger on `auth.users` (when `phone is not null and email is null`). Only the
  service role can change `app_metadata`, so the tag cannot be removed by the user.
- 0037 stops a citizen principal from ever holding an active centre membership.
- Citizen API routes resolve a **citizen context** (`apps/web/lib/citizen/context.ts`) that
  requires `principal = 'citizen'`; operator routes keep `lib/api/context.ts`, which already
  requires a membership. Neither context accepts the other's principal.
- A person who is both an operator and a citizen has two accounts (email for work, phone for
  their own vault).
- Phone sign-in: +91 only, Supabase Auth rate limits, plus per-number and per-IP limits in the
  Send SMS hook. No CAPTCHA at launch (friction); add one if SMS-pumping shows up.

## 3. Citizen flows

### 3.1 Sign-up (Phase 2)

```text
mobile → OTP (SMS autofill, WhatsApp fallback) → name + language
  → set 4-digit Vault PIN (also the app-lock PIN; biometrics can stand in for it on this phone)
  → consent screen: terms + cloud sync (versioned, recorded in citizen_consent_records)
```

`POST /api/citizen/account` does all of this in one transaction (`create_citizen_account`) and
returns the document key once. PINs that are one digit repeated or a straight run (1234, 9876)
are refused.

### 3.2 Sync

- The app asks the server for its **data key** once per device (after sign-up or a restore,
  §3.3) and keeps it in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), next to the existing
  local vault key.
- Each page/PDF is AES-256-GCM encrypted on the phone with that key, AAD
  `<citizen_id>:<document_id>:vault_document`, and uploaded straight to Storage through a
  server-minted signed upload URL. The server never handles plaintext on upload.
- The metadata row (type, category, title, size, page count, SHA-256 of the ciphertext) is
  written by the server after it checks the object exists and matches.
- Rename, move, star, delete in the app sync the same way. Delete removes the row immediately
  and the bytes within 24 hours (sweep).
- "Keep on this phone only" documents are never uploaded.

### 3.3 New phone (restore)

After OTP on a new phone, the vault opens when **one** of these succeeds:

1. **Old phone approves** ("Is this you, on a new phone?"). Phase 2: shown when the old phone
   opens the app; Phase 3: push.
2. **Vault PIN.** Checked server-side against an HMAC keyed from the master key; 5 wrong in a row
   → 24 h lock; **10 wrong in the account's life → the PIN path is off for good** (then only 1
   or 3). Without that cap, five guesses a day would give a recycled number's new owner about a
   3% chance within 60 days. Each wrong PIN appears in the citizen's own access history.
3. **7-day hold.** The new phone waits 7 days; the old phone and the number get a notice every
   day and can cancel. **Recycled-number guard:** if the account had no sign-in for 60 days
   before the request, the hold path does not restore documents — they stay unreachable until
   retention deletes them.

Every restore writes an access event and notifies the old phone.

### 3.4 Retention and deletion

- Documents: until deleted by the citizen; 24 months with no sign-in → warnings at 30 and 7 days
  (push + SMS) → deleted.
- Account deletion (in-app): rows and bytes deleted within 24 hours; wrapped data key destroyed
  first, so leftover bytes are unreadable at once. Access events keep centre, operator, time and
  document type for 3 years with the citizen link removed (D13).

## 4. Operator flows

### 4.1 Finding the citizen

The operator types a 10-digit mobile in the dashboard customer search or the extension side
panel. A **"Bharatfill Vault"** section sits beside the centre's own and roaming results.

The response never says whether the number has a vault (no enumeration):

| Situation                                                   | What the operator sees                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| This centre is one of the citizen's named centres (Phase 3) | Documents open; citizen notified                                                                                                   |
| Anything else — vault, no vault, under 18, cloud off        | "If this customer uses Bharatfill Vault, they can approve on their phone, or read you the 6-digit code from the app." + a code box |

### 4.2 Getting consent

- **Approve** (Mode B): the request appears in the citizen's app. Phase 2: in-app card when the
  app is open (Supabase Realtime on the citizen's own request rows); Phase 3: push with Approve /
  Deny. The card names the centre, the duration (2 h, or 30 min) and the copy toggle (D14).
- **Code** (Mode C): the citizen opens **Share with centre**; the app shows a 6-digit code (5 min,
  one use). The screen says "Only tell this code to someone at the counter in front of you."
  After use the app shows "Sharma Cyber Cafe now has access — Stop".
- **Named centre** (Mode A, Phase 3): opens directly; every access notifies the citizen.

All three mint the same thing: a **grant** naming one operator user, one centre, a method and an
expiry ≤ 2 hours. The operator can end it early ("Done").

### 4.3 Using the documents

- The grant lists the citizen's synced documents (type, title, pages). No extracted values in
  Phase 2.
- **View** and **Attach** (extension) fetch bytes from the server file route, which decrypts and
  streams with `cache-control: no-store`. The extension treats them as a new attachment kind,
  `vault_document`; Autofit works in memory as for any attachment.
- **No Download button** for vault documents (spec §3 Feature 4.3, "zero local desktop
  residuals"). The dashboard viewer has no save action either.
- **Save to customer file** appears only when the citizen allowed a copy (D14). It creates a
  `documents` row in the operator's centre, records the consent, and is audited `critical`. From
  then on the centre is responsible for that copy.

## 5. Data model (new migration, 0038+)

All citizen tables carry no `organization_id` and have **no policy for operators**. Operators read
only through server routes (§6), because a `SELECT` cannot write the access event the citizen is
promised.

| Table                                                                                             | Key columns | Client access |
| ------------------------------------------------------------------------------------------------- | ----------- | ------------- |
| Built in migration 0038. **Citizens read their own rows and write nothing directly**; every write |
| goes through a citizen route holding the service role.                                            |

| Table                     | Key columns                                                                                                                                                                  | Client access                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `citizen_accounts`        | `id` = `auth.users.id` (cascade), `display_name`, `preferred_locale`, `cloud_enabled`, `last_active_at`, `restore_hold_until`; insert refused unless a citizen principal     | citizen: select own                                                  |
| `citizen_vault_keys`      | `citizen_id`, `wrapped_key`, `key_version`, `pin_hmac`, `pin_failures`, `pin_failures_total`, `pin_locked_until`                                                             | none (service role)                                                  |
| `citizen_devices`         | `citizen_id`, `platform`, `label`, `key_issued_via`, `push_token` (Phase 3), `last_seen_at`, `revoked_at`                                                                    | citizen: select own                                                  |
| `citizen_vault_documents` | `id`, `citizen_id`, `document_type`, `category`, `title`, `storage_path` (check: own folder), `mime_type`, `size_bytes`, `page_count`, `sha256`, `status`, `deleted_at`      | citizen: select own                                                  |
| `citizen_consent_records` | `citizen_id` (set null), `subject` (`terms`/`cloud_sync`/`centre_copy`/`named_centre`), `text_version`, `status`, `grant_id`                                                 | citizen: select own                                                  |
| `vault_access_requests`   | `id`, `citizen_id` (null if no vault), `mobile_hmac`, `organization_id`, `centre_name`, `requested_by`, `status`, `duration_minutes`, `allow_copy`, `grant_id`, `expires_at` | citizen: select own (Realtime publication)                           |
| `vault_access_challenges` | `citizen_id`, `code_salt`, `code_hmac`, `attempts_left` (3), `duration_minutes`, `allow_copy`, `expires_at` (check ≤ 15 min), `consumed_at`                                  | none (service role)                                                  |
| `vault_unlock_attempts`   | `organization_id`, `attempted_by`, `mobile_hmac`, `succeeded` — the wrong-code ledger for §7                                                                                 | none (service role)                                                  |
| `vault_access_grants`     | `id`, `citizen_id`, `organization_id`, `centre_name`, `granted_to_user_id`, `method`, `allow_copy`, `granted_at`, `expires_at` (check ≤ 2 h), `ended_at`, `ended_by`         | citizen: select own                                                  |
| `vault_access_events`     | `grant_id`, `citizen_id`, `organization_id`, `operator_id`, `document_id` (all set null on delete), `centre_name`, `document_type`, `action`                                 | citizen: select own; trigger refuses update/delete, service role too |

Named centres (`citizen_named_centres`) come with Phase 3's migration.

Storage: bucket **`citizen-vault`**, private, 15 MB, same MIME allow-list, path
`citizen/<citizen_id>/<document_id>`, **no `storage.objects` policy for `authenticated`**, and not
added to the `customer-documents` / `prepared-files` policies.

Keys: one secret, `VAULT_MASTER_KEY` (32 bytes, base64, server-only, `apps/web/lib/env.ts`). It
wraps each citizen's document key in the `v1.` format of `packages/core/src/privacy/crypto.ts`
(AAD `<citizen_id>:vault_key`); the PIN HMAC key and the mobile-number HMAC key are derived from
it under fixed labels (`apps/web/lib/citizen/secrets.ts`). Unset → every vault route answers
`errors.vault.unavailable`. Move the master key to a cloud KMS before scale.

## 6. Routes

Citizen (`lib/citizen/context.ts`):
`POST /api/citizen/account` · `DELETE /api/citizen/account` · `GET /api/citizen/vault-key` ·
`POST /api/citizen/documents/upload-intent` · `POST|PATCH|DELETE /api/citizen/documents[/:id]` ·
`POST /api/citizen/share-code` · `POST /api/citizen/requests/:id/approve|deny` ·
`GET /api/citizen/access` (grants + history) · `POST /api/citizen/grants/:id/revoke` ·
`PUT /api/citizen/named-centres` · `POST /api/citizen/devices` · `POST /api/citizen/restore/pin|approve`.

Operator (`lib/api/context.ts`, permission **`vault.access`**: owner, manager, operator — not
viewer, not billing_admin):
`POST /api/vault/lookup` · `POST /api/vault/unlock` (mobile + code) · `GET /api/vault/requests/:id` ·
`GET /api/vault/grants/:id/documents` · `GET /api/vault/grants/:id/documents/:docId/file` ·
`POST /api/vault/grants/:id/documents/:docId/save-to-customer` · `POST /api/vault/grants/:id/end`.

The file route, in one transaction before any byte is sent: grant live and held by the caller →
document belongs to that citizen and is not deleted → insert `vault_access_events` → queue the
"opened" notification (once per grant) → then fetch, decrypt, stream. Check the host's response
size limit; if it is under 15 MB, cap synced files at that limit.

**Built (2026-11-22):** every route above except `PUT /api/citizen/named-centres` (Phase 3),
`POST /api/citizen/restore/approve` (old-phone approval) and `save-to-customer`. Services:
`apps/web/lib/vault/{grants,operator}.ts`, `apps/web/lib/citizen/access.ts`. Two differences
from the text above: the file route runs its steps in order, not in one database transaction
(the access event and audit line are written, and must succeed, before the key or any byte is
read — so a failure can only over-report, never under-report); and the "opened" notification
is not queued yet (push is Phase 3). Unit tests: `apps/web/lib/vault/bridge.test.ts`.

## 7. Limits

| What                            | Limit                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lookups                         | 10 per operator per 15 min; 30 per centre per hour                                                                                                                      |
| Approval requests to one number | 3 per 15 min across all centres (stops push spam)                                                                                                                       |
| Codes                           | 6 digits, 5 min, one use, 3 attempts; 10 wrong per centre per hour; 10 wrong per number per day → code entry paused for that number until tomorrow and the citizen told |
| Grants                          | ≤ 2 h (DB check), one operator user, ended by expiry, Done, or citizen Stop                                                                                             |
| Vault PIN                       | 5 wrong → 24 h lock                                                                                                                                                     |
| Named centres                   | ≤ 3 per citizen, ≤ 90 days each; centre owner must have TOTP MFA enabled                                                                                                |

Every lookup, unlock attempt, grant, file access, copy, revoke and restore is audited (new
`vault.*` actions in `packages/core/src/audit/actions.ts`); `vault.grant_created` and
`vault.copy_saved` are `critical`. Mobile numbers, codes, PINs, titles and filenames never enter
logs or audit metadata (`redact()` gains `code`, `pin`, `phone`, `title` keys).

## 8. Threats and controls

| Threat                                | Control                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Citizen session used as an operator   | 0037 trigger; separate contexts (§2)                                                                                       |
| Operator fishing for who has a vault  | Uniform lookup response; rate limits; lookups audited                                                                      |
| Operator guessing a code              | 10⁶ space, 3 tries per code, per-centre and per-number caps                                                                |
| Phone call scam ("tell me your code") | Code only valid 5 min after the citizen opens Share; screen warning; citizen sees the centre name immediately and can Stop |
| Stolen operator login                 | Every non-named access needs the citizen live; named centres need owner MFA; every access alerts the citizen               |
| Recycled number / SIM swap            | Restore needs old phone, PIN, or 7-day hold with daily notices; inactive accounts not restored by hold                     |
| Bucket or backup leak                 | Ciphertext only; keys wrapped by a server master key                                                                       |
| Files left on the cafe PC             | No Download for vault documents; bytes kept in memory by the extension                                                     |
| Lock-screen exposure                  | Notifications name the centre, never the document                                                                          |
| Push token abuse                      | Expo push access token required; tokens deleted on sign-out                                                                |

## 9. Phases

**Phase 2 — sign-in, sync, code and in-app approval**

1. Citizen identity: `auth.users` tag trigger, `citizen_accounts`, citizen context, SMS hook,
   adult gate, Vault PIN, app lock.
2. Sync: keys, upload intent, document rows, delete sweep, "phone only" flag.
3. Restore: PIN, old-phone approval (in-app), 7-day hold.
4. Operator bridge: lookup, code unlock, in-app approval via Realtime, grants, file route, access
   events, in-app access history and Stop, dashboard section, extension `vault_document`
   attachments, save-to-customer when allowed.

**Phase 3 — push, named centres, presets**

5. Push: approval in background, "opened" alerts, new-phone notices, retention warnings.
6. Named centres (Mode A) with the owner-MFA prerequisite and 90-day renewal.
7. Portal presets in the app ("SSC photo 20–50 KB"), built on `packages/form-engine`
   `constraints.ts` and adapter upload requirements (pure TypeScript), so the app and the
   extension agree on sizes.
8. Retention sweep (24 months) with warnings.

## 10. Tests to add

- **RLS** (`packages/database/rls-tests/citizen_vault.test.ts`): operator of any role reads no
  citizen table or `citizen-vault` object; citizen reads only own rows; citizen cannot read
  challenges or keys; `vault_access_events` has no update/delete; grant expiry check ≤ 2 h.
- **Unit**: code/PIN HMAC and attempt counting; uniform lookup response; restore decision table
  (incl. recycled-number guard); key wrap/unwrap AAD binding; redaction of new keys.
- **Integration**: file route writes an event before bytes; no grant / expired / other centre /
  deleted document → identical 404.
- **Extension**: `vault_document` has no Download; nothing written to `chrome.storage.local`.
  Existing safety regression tests untouched.
- **Mobile**: "phone only" documents never enter the upload queue; Share-code countdown;
  notification text contains no document title.

## 11. Before go-live — actions for the product owner

- **Legal review of §13**: the server decrypting every synced document, storing a plaintext copy
  for the citizen's customer record, and extracting fields from it — the consent text must say so.

- **Legal review** of the ✓ rows in §1, the consent and notice text (Hindi + English), and
  storing identity documents in the cloud.
- **SMS**: open a DLT-registered gateway account (sender ID + OTP template) and choose it on price;
  the WhatsApp fallback reuses the existing platform WhatsApp number.
- **Expo** account with a push access token; FCM/APNs credentials.
- Provision `VAULT_MASTER_KEY` (separate from `FIELD_ENCRYPTION_KEY`) and back it up; losing it
  makes every synced document unreadable. Document rotation.
- A scheduler for `/api/jobs/run` (delete sweep, retention, grant tidy-up) — the existing open item.
- Update the Play data-safety form and privacy policy for cloud sync and push.

## 12. Differences from `CITIZEN_MOBILE_APP_SPEC.md`

- §3 Feature 4.2: modes are not a citizen setting (D5); Mode A is named centres (D2); Mode C is a
  6-digit one-time code, not a stored 4-digit PIN (D3).
- §3 Feature 4.1: notifications do not name documents (D12).
- §5 schema replaced by §5 here: `citizen_accounts.id` is the auth user id; no `vault_pin_hash`,
  `access_mode`, `is_verified`, `extracted_fields`; `operator_access_logs` becomes
  `vault_access_events` (one row per document per action).
- §6: consent ships in Phase 2, not Phase 3 (master spec Phase 11 acceptance).

## 13. App accounts are ordinary customers (migration 0041)

Product owner, 2026-11-22: "an account created in the app must not differ from one created by an
operator — all features the same." The app is a second way for a citizen to become a customer
(sign up, scan, upload) and get their details extracted, so any centre can fill forms for them.

| What                 | How                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer record      | Sign-up also creates a `customers` row (name, verified mobile) in the platform organization **"BharatDoc app"** (`citizen_app_organization_id()`), which has no members, ever. Accounts made before 0041 were backfilled; a later sync makes one if it is still missing.                                                                        |
| Documents            | Each confirmed sync is decrypted by the server and stored as a normal `documents` row for that customer, then read by the usual `ocr.extract` job. Photo and signature are kept unread. Rename, retype and delete in the app follow through.                                                                                                    |
| Folders (0043)       | The customer's Documents tab uses the app's folders (Identity, Education, Certificates, Photo & signature, Other). The phone syncs the folder each document is filed in (`category` on upload and on move); the copy carries it in `documents.folder`. Files are tagged "From BharatDoc app" and the tab re-reads itself every 20 s while open. |
| Finding them         | The usual network (roaming) search by mobile. The result is labelled "📱 BharatDoc app"; otherwise it looks like any other centre's customer.                                                                                                                                                                                                   |
| Consent              | The usual roaming grant: the citizen taps **Approve** in the app (0039), or reads out the SMS OTP (0024). Once per visit, as for any customer from another centre.                                                                                                                                                                              |
| Extracted values     | Reviewed by the operator holding the grant, on the usual review screen (`/documents/:id`). Writes land in the app organization through the server (`resolveDocumentScope`). Not charged to the centre's extraction quota.                                                                                                                       |
| Form filling         | Unchanged roaming filling: the extension uses the reviewed profile and the documents.                                                                                                                                                                                                                                                           |
| Deleting the account | Removes the customer row, every mirrored file and its bytes before the vault itself.                                                                                                                                                                                                                                                            |

Removed: the extension's "BharatDoc app" box (`VaultAppBox`) and the dashboard's
`VaultAccessPanel`. Still in the code but no longer reached: the operator vault routes
(`/api/vault/*`), the extension's `VAULT_*` messages and their tests — remove in a follow-up once
§13 has been run end to end.

Open: AI reading stays off for app documents (`ai_processing_enabled = false`, rule 10) — local
OCR only until the product owner and legal decide; the platform organization has no plan or
storage quota of its own.

## 14. Centre access and trusted centres (migration 0042)

Product owner, 2026-11-23: "the app should show which cyber cafe / operator has access, let the
citizen manage it, and allow giving access for the long term." This delivers D2 (named centres)
on top of §13's roaming grants rather than the vault grants, because since §13 every centre
reaches an app customer through a roaming grant.

| What                 | How                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Centre access screen | Profile → **Centre access** (`app/centre-access.tsx`). Live sessions (centre, purpose, time left, Trusted badge) with **Stop**, and what ended in the last 30 days (stopped by you / by the centre / time ran out). Never the operator, a document or a record value. |
| Whose sessions       | Grants over every live `customers` row, at any centre, whose mobile is the citizen's verified sign-in number — the same rule that decides which phone an approval request reaches.                                                                                    |
| Trusted centre       | **30 days** beside 1 / 2 / 4 h on the approval sheet, or **Trust for 30 days** on a live session. Grant `auth_method = 'app_trusted'`, for the one operator who asked, at that centre. **Renew** appears in the last 7 days.                                          |
| Limits               | ≤ 3 live trusted grants per citizen (server, `errors.roaming_trusted_limit`); ≤ 30 days (DB check); every other grant keeps the 12 h ceiling. An OTP can never mint `app_trusted`.                                                                                    |
| Stop                 | Revokes at once (`revoked_by` = the citizen), withdraws the grant's consent record, audits `customer.roaming_access_revoked` to the centre. Trust replaces the old grant (`revoked_by` null, hidden from the list).                                                   |
| Routes               | `GET /api/citizen/centre-access`, `POST /api/citizen/centre-access/:id/stop`, `POST …/:id/trust`; `lib/roaming/citizen-sessions.ts`.                                                                                                                                  |
| Operator side        | Unchanged access path; countdowns show days (`29d 23h`). The operator's "End session" still ends a trusted grant too.                                                                                                                                                 |

Choices made for ease, with the reason:

- **30 days, not D2's 90**, and **one operator, not the whole centre**: D15 asked for owner MFA
  before standing access, and the platform has no MFA yet. A shorter window and the narrowest
  grantee stand in for it until MFA lands; then revisit both.
- **No separate "named centres" table**: a trusted centre is just a longer roaming grant, so the
  RLS policies, the extension and the dashboard needed no change.

Open (product owner / legal):

- Legal review of the trusted-centre consent text (`roaming-trusted-v1`) in Hindi and English.
- "Every access notifies the citizen" (D2) needs push (Phase 3); until then the screen shows that a
  centre _can_ use the details, not each time it did.
- Owner MFA (D15), then decide whether to move to 90 days or centre-wide trust.

## 15. Everyday scans stay on the phone (no migration)

Product owner, 2026-11-23: citizens also use the scanner for everyday PDFs that have nothing to
do with a form, and those must not reach the cloud. Before this, D1 synced every document straight
after saving, and the server copied and read each one (§13). "Keep on this phone only" in Document
Details came too late: by then the file had already been uploaded and read.

| What               | How                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rule           | `keepsOnPhoneByDefault(type, folder)` in `@assistigo/core`. A type with a vault section (ID, marksheet, certificate, photo, signature) or a document filed in a section is **ready for centres**; "Other", no type, receipts, unclassified **stay on the phone**. |
| When it is decided | At save, in the same index write as the document (`phoneOnlyForNewDocument` in `saveDocument`), so the sync that runs right after a save can never upload first. Every new document has `phoneOnly` set.                                                          |
| Citizen            | No extra step. On the Save screen, the security card shows **"Ready for your cyber cafe"** or **"Only on this phone"** from the type. Its switch is only for the rare document the citizen wants the other way (`phoneOnlyChosen`).                               |
| Moving it later    | Filing an "Other" document in a section (Move → Identity) makes it ready for centres, unless the citizen chose otherwise. A move never stops sharing, so a copy a centre may be using never disappears silently.                                                  |
| Older documents    | A document saved before this has no `phoneOnly` and keeps syncing as before. Nothing is deleted from the cloud.                                                                                                                                                   |
| Sync, server       | Unchanged. The planner already skips phone-only documents, and the server only reads what it receives.                                                                                                                                                            |
| Operator           | Unchanged. Everyday scans never reach the customer's Documents tab.                                                                                                                                                                                               |

The sign-up consent already reads "the documents I sync", so it is still accurate and the terms
version is unchanged. Less leaves the phone than before. Open (legal): confirm that wording covers
the type-based default.

## 16. Customers stay with the centre; the citizen can lock it (migration 0046)

Product owner, 2026-11-23. A first try the same day (0045) copied an approved customer into the
visiting centre; that was dropped. The rules now:

| What                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No copies             | A customer from another centre is never copied. 0046 drops what 0045 added. The visiting centre keeps the 0044 link.                                                                                                                                                                                                                                                                                                                                                           |
| One "Request access"  | The operator searches by mobile and taps one button (`POST /api/customers/:id/roaming/request-access`, `lib/roaming/request-access.ts`). The server sends it to the BharatDoc app when the number has an app account, otherwise a WhatsApp code. The answer says which, so the operator knows to wait or to type a code; that tells the centre whether the person uses the app, which the product owner accepted. While waiting on the app the operator can still send a code. |
| In the list for good  | The first approval links the customer (0044), and the link stays. The list shows no "other centre" tag; the line under the name says "Active (time left)" or "Ask for access".                                                                                                                                                                                                                                                                                                 |
| Schemes after it ends | After a session ends or the citizen stops it, the locked view still shows what the customer qualifies for (up to 10 schemes; the extension shows three).                                                                                                                                                                                                                                                                                                                       |
| Own customers         | A customer the centre created stays in its panel for good, unless the citizen locks the centre in the app.                                                                                                                                                                                                                                                                                                                                                                     |
| Lock (app)            | Profile → Centre access → "Centres that saved your profile" lists the centres that created a profile for the citizen's number, each with Lock / Unlock (`lib/roaming/citizen-locks.ts`). Locking also ends any live grant that centre holds.                                                                                                                                                                                                                                   |
| What a lock does      | `customer_citizen_locks` row (service role only). The centre still lists the customer, masked, flagged "Locked by the customer", and still sees their schemes. The read policies on the profile, values, documents, prepared files and storage close for the centre's members. A new request (app or WhatsApp) mints the usual time-boxed grant, which reopens the record for that operator only. Unlock restores ordinary access.                                             |
| Who is told           | Audited to the centre as `customer.citizen_locked` / `customer.citizen_unlocked` (ids only). The app approval sheet says approving keeps the citizen in the centre's list.                                                                                                                                                                                                                                                                                                     |

Open (legal): whether a lock should also stop the centre from editing or adding documents through
paths that do not read the record first (today the read policies block the usual flows), and the
approval-sheet wording for the permanent listing.

## 17. A centre adds a document for an app customer (migration 0047)

Product owner, 2026-11-23: an operator holding a live grant over a BharatDoc app customer may
upload a document for them, as for their own customers, and the citizen gets it in the app.

| What               | How                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who may            | An operator with `document.upload` and a live grant from the citizen (`can_review_app_customer`, checked with the operator's JWT on reserve and on process). Any other foreign customer stays a 404; a visit to another centre's customer still allows no writes.                                                                                                                                        |
| Where it goes      | A `documents` row in the BharatDoc app organization (service role, after the gate), read by the usual pipeline. Not charged to the centre's quota (§13).                                                                                                                                                                                                                                                 |
| The citizen's copy | After the bytes are verified, the server seals a copy with the citizen's document key (format v1) into `citizen-vault`, as a `ready` vault row already linked by `mirror_document_id`, with `added_by_organization_id` / `added_by_centre_name`. An `added` access event goes into the citizen's history. Skipped when the citizen turned cloud backup off. Never fails the upload.                      |
| On the phone       | Each sync, after queued deletes, lists the cloud vault and pulls centre-added documents it does not hold (`planPulls`): download via `GET /api/citizen/documents/:id/file` (2-minute signed URL, ciphertext), decrypt, save linked to the cloud copy so it is never uploaded back. PDFs become pages through `pdf-pages` (Android); without it they stay in the cloud. Details show "Added by <centre>". |
| Afterwards         | Rename, move and delete on the phone reach the centre-side copy as for any synced document. A document the citizen deleted is never pulled back.                                                                                                                                                                                                                                                         |
