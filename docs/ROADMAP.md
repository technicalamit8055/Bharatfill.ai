# Roadmap and Build Progress

Phase plan from master spec §31. This file is the live status board — update it as phases land.

Legend: ☐ not started · ◐ in progress · ☑ done

---

## Phase 0 — Repo and tooling ☑

- [x] Monorepo (npm workspaces), TypeScript strict base config
- [x] ESLint flat config, Prettier
- [x] Vitest projects: unit / rls / extension
- [x] `docs/` — spec + ARCHITECTURE, DATABASE, SECURITY, AI_PIPELINE, EXTENSION, FORM_ENGINE,
      DEVELOPMENT_RULES, QA_CHECKLIST, PRD, and this roadmap
- [x] CI workflow with a dedicated safety job (no submit / captcha / otp / payment)
- [x] `npm run check:sql` — parses every migration with the real Postgres grammar, no Docker needed
- [ ] **Product owner task:** interview 20 operators, record top 10 forms, time per application,
      error rates and willingness to pay. Pick the top 5 MVP workflows.
      _This is the one Phase 0 item code cannot do, and Phase 5 adapters should not be
      finalised without it._

## Phase 1 — Foundation ◐

Done:

- [x] `packages/core` — roles, the full permission matrix, Indian field registry, validation and
      normalisation, duplicate detection, application status machine, plans and entitlements,
      audit catalogue, masking, redaction, AES-256-GCM field encryption (89 unit tests)
- [x] `packages/ui` — Button, Field/Input/Select/Textarea, Alert/Badge/Card/Stat/EmptyState, Table
- [x] Migrations 0001–0011: 25 tables, tenancy helpers, triggers, every RLS policy, storage
      policies, and the `create_organization` / `accept_invitation` / `search_customers` /
      `dashboard_summary` RPCs
- [x] Next.js 15 App Router shell, Supabase server/browser/admin clients, middleware session refresh
- [x] Sign up / sign in / forgot password, email-confirmation callback
- [x] Organization creation, first-run checklist, members list, invitations, role changes, removal
- [x] Dashboard home with live counters, settings, landing page
- [x] Hindi/English localisation with full `en` + `hi` dictionaries and an in-place switcher
- [x] `/api/me`, `/api/organizations/current`
- [x] Request context that resolves cookie sessions and extension bearer tokens identically

Done (added since):

- [x] `packages/database/seed` — demo organization, four roles, ~30 fake customers, wired to
      `npm run db:seed` via `scripts/seed-demo-data.ts`. Document fixtures deliberately deferred
      to Phase 3: a `documents` row without real uploaded bytes would 404 in the CRM UI.
- [x] `packages/database/rls-tests` — cross-org denial, viewer write denial, billing_admin
      document/customer_field_values denial, audit immutability, anonymous access. Written and
      typechecked; not yet run against a live Supabase (blocked below).

Remaining:

- [ ] Apply the migrations against a live Supabase (blocked: Docker not installed on this machine)
      — this also blocks actually _running_ `npm run db:seed` and `npm run test:rls` for the
      first time, not just writing them.
- [ ] `npm run db:types` and wire the generated `Database` type into the Supabase clients
- [ ] Password reset completion page (`/reset-password`)
- [ ] Legal pages, pricing page, demo request page

Acceptance: user signs up and creates an org · owner invites an operator · operator cannot reach
billing settings · cross-org access blocked by test.

## Phase 2 — Customer CRM ☑

- [x] Customer list, search box wired to the `search_customers` RPC
- [x] Add-customer form, minimal fields, duplicate warning wired to `findDuplicates`
      (surfaced, never blocking — `?force=1` records the operator's decision)
- [x] Customer profile rendered from the field registry, section by section
- [x] Sensitive-value reveal flow via `POST /api/customers/:id/reveal`, one field per call, audited
- [x] Audit trail on the profile
- [x] `/api/customers` list/create, `/api/customers/:id` read/update/delete

Acceptance: customer created in under 30 s · search by name/mobile/location · Indian address
fields · sensitive fields masked · changes audited.

## Phase 3 — Documents and OCR ◐

Done:

- [x] `packages/ai` — `OcrProvider` abstraction, mock provider, document classification,
      rules-based field extraction with en/hi/Hinglish labels and negative keywords, confidence
      banding and review rules, fake fixtures with golden tests (53 unit tests)
- [x] Aadhaar safety layer — originally last-four only. **Superseded by f912372 / migration
      0026:** the extractor now also emits the full `customer.aadhaar`, stored in
      `identity_summary_json.aadhaar`; it stays `high_risk` (always reviewed, masked on display,
      reveal audited) and is still never logged, searched or indexed. See `docs/SECURITY.md` §4.
- [x] Upload flow — `POST /api/documents/upload-intent` reserves a row and a one-time signed
      upload URL; bytes go browser → storage directly
- [x] `POST /api/documents/:id/process` — magic-byte sniff against the declared MIME type
      before anything is processed; a file that lied is deleted and marked failed
- [x] Job model: `enqueueJob`, the `ocr.extract` handler, the worker (`claim_jobs` /
      `complete_job`), and `POST /api/jobs/run` gated on `JOB_RUNNER_SECRET` (fails closed)
- [x] `GET /api/documents/:id/extraction`, `POST /api/documents/:id/review`,
      `POST /api/documents/:id/signed-url` (≤300 s, audited), `DELETE /api/documents/:id`
- [x] Review UI — per-field confidence, the reason review is required, the source snippet, and
      accept/edit/reject. Accepting writes to `customers` **and** `customer_field_values`
      (`operator_verified`) with provenance; rejecting records the rejection and never fills.
- [x] Documents list, upload page, document detail, and a documents section on the customer profile
- [x] Migration 0013 — one extraction per document (job idempotency) + `storage_used_bytes`,
      which also wires up the storage entitlement that Phase 1 stubbed at zero
- [x] `en` + `hi` strings for the whole surface
- [x] Paste-text import — `packages/ai/src/text.ts` runs the same dictionary, normalisation,
      confidence banding and Aadhaar gate over text an operator pastes, with no OCR and no
      classification. `POST /api/customers/parse-text` proposes and stores nothing;
      `POST /api/customers/:id/values` is the human gate and re-validates every value.
      Paste panel on the customer profile, prefill on the new-customer form, 34 unit tests.
- [x] Real readers: `local-ocr` and `ai-vision` providers in `packages/ai/src/providers`, with
      dynamic-schema AI escalation and grid-row splitting; Gemini endpoints receive PDFs directly.
- [x] Migration 0017 — per-organization AI vendor settings (`organization_ai_settings`, presets,
      base-URL rules, owner-only); `GET`/`PUT`/`DELETE /api/organizations/ai-settings` and
      `POST …/test-connection`. The org vendor takes precedence over the env config.
- [x] Migration 0019 — `marksheet_graduation` document class with a field allow-list
- [x] Direct document upload from the dashboard; document-type constraint fallback in
      `apps/web/lib/jobs/handlers/ocr-extract.ts`

Remaining:

- [ ] Import-customer-from-document (§9.3): review currently requires the document to be
      attached to an existing customer and refuses otherwise. Needs its own endpoint.
- [ ] Schedule `POST /api/jobs/run` (Vercel Cron or equivalent) and set `JOB_RUNNER_SECRET`
- [ ] `.env.example` still describes `anthropic` as not implemented; update it
- [ ] `retention.sweep` job type has no handler — raw OCR text is nulled at review, but no
      scheduled retention runs
- [ ] Document fixtures in the seed (needs a live Supabase to upload real bytes)

## Phase 4 — Chrome extension (basic) ◐

Done:

- [x] MV3 manifest — originally `activeTab`/`storage`/`scripting`/`sidePanel` with no install-time
      host permissions. **Changed since c8cd42d:** it now also declares `downloads`,
      `host_permissions` for all http/https pages, and a content script on every page and frame.
      This departs from spec §15.2 — see Remaining.
- [x] Zod-validated message contract with sender verification; unknown messages dropped silently
- [x] Storage split: tokens, selected customer and recent customers in `chrome.storage.session`,
      only preferences in `local`
- [x] Field detector — label resolution (label[for] → wrapping → aria-labelledby → previous table
      cell → preceding text), visibility, stable signatures, same-origin frame walking
- [x] Fill executor — native setter + input/change so React/Vue inputs update; select matching by
      value then label; bounded wait for dependent dropdowns; radio/checkbox
- [x] Popup and side panel (customer picker, review table with confidence, edit/skip, results)
- [x] Service worker: pairing auth, message routing, API calls, fill-session recording
- [x] Bundle split so the content script pulls only what it needs (67 kB, 17 kB gzipped)
- [x] 55 extension tests, including 14 that run the real demo forms end to end

- [x] `/api/extension/pair` and `/api/extension/refresh` route handlers, plus
      `/api/extension/pairing-code` which mints the one-time code
- [x] `/extension/connect` dashboard page, gated on an `EXTENSION_ALLOWED_IDS` allowlist so a
      crafted `?ext=` link cannot pair someone else's extension
- [x] `externally_connectable` manifest entry for the dashboard origin
- [x] Extension icons and the branded popup / side panel
- [x] Disconnect button added to the side panel, next to the organization/role row, so the
      operator can end a session without reopening the popup.

Done (added since):

- [x] Direct dashboard access — `OPEN_DASHBOARD` opens the dashboard in a new tab from the side
      panel header, the popup, and the Document Tools / "View application" links (plain tab, not a
      sign-in handoff). `EXTENSION.md` §4a.
- [x] Customer document picker and preview modal — attach either a prepared derivative or an
      original customer document; hidden upload boxes filtered out
      (`CustomerDocumentPickerModal.tsx`, `DocumentPreviewModal.tsx`, 10 tests).
- [x] Roaming customers in the extension — network search by exact 10-digit mobile, link to
      counter, consent-OTP unlock (1 h / 2 h / 4 h), countdown, Lock / End
      (`CustomerPicker.tsx`, `RoamingAuthBanner.tsx`, 5 tests). `EXTENSION.md` §4b.
- [x] Multi-stage / multi-page workflow — after the operator uses the portal's own Proceed button,
      "Scan Stage N+1" maps the next page; "Save as an application" links every stage to one
      application; "Re-fill skipped" retries fields waiting on a parent dropdown. The extension
      never watches navigation or advances the portal. State is in memory only
      (`background/index.ts`, `ReviewPanel.tsx`, 5 tests). `EXTENSION.md` §6b.
- [x] Extension suite: 7 files, 144 tests passing (2026-09-27).

Remaining:

- [ ] **Product owner:** keep or drop the all-pages `host_permissions` + always-on content script
      before any Web Store build (spec §15.2); the stale "on-demand injection" comment in
      `content/index.ts` goes either way
- [ ] `chrome.webNavigation` is called but the permission is not declared, so the sub-frame path
      never runs — declare it or remove the code
- [ ] **Product owner (billing):** "Re-fill skipped" re-PATCHes the same fill session, overwriting
      its counts, duplicating `fill_session_fields` rows and recording a second `fill` usage unit
- [ ] "Save as an application" fails silently for roaming customers (`POST /api/applications`
      404s on a non-home customer)
- [ ] Roaming grant expiry is only checked by the server; the panel keeps showing "granted"
- [ ] Validate the `OPEN_DASHBOARD` `path` (require a leading `/`)
- [ ] Move hard-coded English strings in `ReviewPanel` / `RoamingAuthBanner` / `CustomerPicker`
      to `en` + `hi` keys
- [ ] UI tests for the multi-stage panel
- [ ] Manual smoke test in a real Chrome profile
- [ ] Set `EXTENSION_ALLOWED_IDS` for staging and production (pairing fails closed until then)
- [ ] Schedule `purge_extension_pairing_codes()` so spent rows do not accumulate

## Phase 5 — Form engine and adapters ◐

Done:

- [x] Detected-field schema — metadata only, values never transmitted
- [x] Safety classifiers for CAPTCHA / OTP / payment / submit, with 52 regression tests
- [x] Mapping dictionary: ~60 entries in English, Hindi and Hinglish, with negative keywords so
      "Father's Name" can never resolve to the applicant's own name
- [x] Scorer with weighted signals, input-type penalty and tie demotion into the review band
- [x] Full resolution order — adapter → org override → history → dictionary
- [x] Adapter schema, glob URL matching, specificity + status ranking
- [x] 20 named transforms, all returning `null` rather than guessing
- [x] Mandatory review for high-risk and unverified fields
- [x] `POST /api/forms/map` and `PATCH /api/fill-sessions/:id`

Done (added since):

- [x] First real portal adapter — `bihar-rtps-serviceonline` for RTPS Bihar / ServicePlus
      (`serviceonline.bihar.gov.in`), covering the income, caste and residence certificate
      forms. One adapter, because the services differ only by `?serviceId=` and §14.2 forbids
      transmitting the query string; label patterns select per form. Labels were read off the
      live portal. 17 end-to-end tests against an RTPS-shaped fixture.
- [x] `BUILT_IN_ADAPTERS` — adapters ship with the build and `POST /api/forms/map` merges the
      database over them, so an unseeded deployment still supports the portals it knows.
      `npm run db:seed:adapters` publishes them into `portal_adapters`.
- [x] Adapter field matching rewritten: longest-match wins rather than first-in-array (labels
      nest in Hindi — `नाम` ⊂ `पिता का नाम`), `negativePatterns`, placeholder/aria matching,
      and the adapter `key` no longer substring-matches label text.
- [x] `dependsOn` wired up — it was schema-only. `MappingProposal.fillOrder` now carries the
      dependency order through the API to the side panel.
- [x] Fixed: named transforms never ran on the real fill path. The review panel built its own
      instruction list, so `date.ddmmyyyy`, `mobile.10digit`, `pin.6digit`, `number.plain` and
      `gender.full` were all no-ops in the product while passing their unit tests. It now calls
      `buildFillInstructions`, which also re-checks safety classes and applies the fill order.
      The review table shows the transformed value, not the raw profile value.
- [x] Fixed: a `<select>`'s nearby text included its own option labels, so options acted as
      naming signals. Plus `ownTextOnly` for dictionary entries whose synonyms are container
      words ("address"), which were claiming every field under a matching section heading.
- [x] `customer.address.sub_division` (and `customer.permanent_address.sub_division`) added to
      the field registry — RTPS needs अनुमंडल to complete the district → sub-division → block
      chain. No migration needed: address parts live in the existing `address_json` JSONB
      column, not a first-class column, so this was a registry entry plus dictionary and adapter
      wiring, not a schema change. `bihar-rtps-serviceonline`'s `block` field now `dependsOn`
      `sub_division` instead of `district` directly. Also added: `customer.bpl_card_number`
      (identity, encrypted) and `customer.certificate.caste.sub_caste` (certificates, high-risk,
      always reviewed like the category it refines).
- [x] Second portal adapter — `ssc-portal.json` for SSC (ssc.gov.in and the OTR subdomain), status
      `testing`, with photo/signature requirements bound to the `ssc.photo` / `ssc.signature`
      presets. `FORM_ENGINE.md` §6a.
- [x] Safety fix (2cb8e14): camelCase names are split before lowercasing, so `otpMobile` is
      classed as OTP rather than a mobile field; mobile/email adapter entries now exclude OTP boxes
      (RTPS and SSC). New regression tests in `safety.test.ts`.
- [x] Adapter/detected-field schema: `slug`, `knownIssues`, `DocumentRequirement`, attachment
      types, and `accept` / `disabled` / `readOnly` / `order` / `blockedFrames` on detected fields.
      Adapters have no stage field — each page of a multi-page form is matched on its own.
- [x] Form-engine suite: 7 files, 248 tests passing (2026-09-27).

Remaining:

- [ ] Promote `bihar-rtps-serviceonline` from `testing` to `active` after a manual smoke test
      against the live portal — the adapter is written from the portal's rendered labels, and
      only a real run confirms the dependent-dropdown chain, the AJAX timings and the main form →
      Annexure multi-page run
- [ ] Same for `ssc-portal`: live smoke test, then `active` + `lastVerifiedAt`
- [ ] Seed the remaining demo adapters into `portal_adapters`
- [ ] Adapter admin / import UI and the health dashboard
- [ ] `POST /api/form-reports`
- [ ] AI-assisted mapping (priority 5), gated on org opt-in

## Phase 6 — Document tools ◐

Done:

- [x] `packages/document-tools` — pure engine: portal requirement presets for SSC, NTA, UPSC,
      IBPS, Railway RRB, Agniveer, state PSCs, scholarships and general certificate limits
      (each tagged `published` or `commonly_reported` so an operator knows how much to trust the
      number); mm/px/DPI conversion and crop geometry; a target-KB JPEG search (quality first,
      drops a resolution rung only when the overshoot is large, climbs back up if an opening
      guess gave away resolution it did not need) plus JPEG comment-segment padding to reach a
      portal's _minimum_ KB; Otsu-threshold signature cleanup with a feathered ink/paper edge;
      passport/stamp photo sheet layout (centred block, centred short final row, corner-only cut
      marks) and CR-80 wallet-card sheet layout; Aadhaar mask-box geometry and a
      `isMeaningfulRedaction` gate; derivative recipe/filename builder that records operations
      and settings only, never a customer value. 167 unit tests.
- [x] `packages/document-tools/src/browser` — canvas crop/rotate/adjust/stamp/redact/compose and
      a `pdf-lib` + `pdf.js` layer for merge/split/reorder/rotate/rasterise/e-Aadhaar decrypt,
      all client-side; a source document's bytes are never modified or re-uploaded.
- [x] `packages/ui` — `Slider`, `Switch`, `SegmentedControl`, `Tabs`, `NumberField`, `SizeMeter`
      for the tool editors.
- [x] `/document-tools` hub and four editors — Photo & Signature Studio, Passport Photo Grid,
      PVC Card & Aadhaar Mask, PDF Studio — under `apps/web/app/(app)/document-tools/`.
- [x] `POST /api/derivatives/upload-intent`, `POST /api/derivatives` (magic-byte + size
      re-verification before the row is written, orphaned object cleanup on insert failure),
      `GET /api/derivatives`, `DELETE /api/derivatives/:id`, `POST /api/derivatives/:id/signed-url`.
- [x] Migration 0016 — `document_derivatives` bytes now count towards `storage_used_bytes`, so
      the storage entitlement Phase 1 wired up does not silently stop applying once prepared
      files start holding real objects.
- [x] Privacy gate: an Aadhaar-class card cannot be saved to a customer profile, downloaded to
      print, or printed until a meaningful redaction box covers the number band — enforced by
      `isMeaningfulRedaction`, not a checkbox the operator could skip.
- [x] `en` + `hi` strings for the whole surface, including per-preset Hindi portal/label/notes.
- [x] Full `en`/`hi` verified with `npm run typecheck`, `npm run lint`, `npm test` (708 tests) and
      `npm run build:web`.

Remaining:

- [ ] Manual QA in a real browser with a signed-in session — blocked on the same thing as Phase 1
      (no local Supabase; Docker not installed on this machine, and `db:seed` refuses to target
      anything but `localhost`/`127.0.0.1` by design). Verified instead via typecheck, lint, the
      167 new unit tests, a production build of all four routes, and an auth-redirect smoke test
      against the dev server.
- [x] Extension suggestions — `packages/form-engine/src/documents.ts` infers a detected file
      field's category (photo/signature/pdf) from its label and `accept` attribute, then, when the
      resolved portal adapter lists `documentRequirements`, picks the one that matches by category
      and label overlap. `POST /api/forms/map` resolves the preset (the adapter's `presetCode`,
      falling back to a portal-name guess against the built-in catalogue) and, gated on
      `document.view`, the customer's up to three best-matching `document_derivatives`. The side
      panel's new "Documents to attach" section shows the portal's stated size/dimensions, a
      one-click download of a suggested file via a signed URL (`DOWNLOAD_DERIVATIVE` →
      `document.download`), and a "Prepare in Document Tools Studio" button that deep-links into
      the photo/signature or PDF editor with that preset pre-loaded (`?customerId=&preset=`) —
      the photo/signature page now also resolves `defaultMode` from the preset's category so a
      signature deep link does not open in photo mode.
- [x] Direct file attachment — a file the operator ticks in that section is attached to the
      upload box by the fill itself, via `DataTransfer` in `attachFiles`
      (`apps/extension/src/content/filler.ts`). It runs as its own channel: the panel sends
      derivative ids, the service worker swaps in bytes fetched from a signed URL, and the page
      never sees an id. `isSupportedInputType('file')` stays false and the mapper still writes no
      value into a file input, so what §7.4.5 asks for is preserved as an explicit tick per box
      rather than a browser limitation: nothing is ticked by default, one file per box, the live
      element is re-checked for CAPTCHA/OTP/payment and re-read for `accept`, and a failed
      assignment reports `failed` rather than a fallback that would look filled but submit
      nothing. Download and the Studio deep link remain for portals with no real
      `<input type="file">` to attach to.
- [ ] Org-level custom presets via `document_requirement_presets` (the table exists and is
      RLS-policied from Migration 0004; the built-in catalogue in `packages/document-tools`
      covers the top portals for now, the same pattern as `BUILT_IN_ADAPTERS` in the form engine).

## Phase 7 — Application tracking ◐

Done:

- [x] Applications list with filters, new-application form, detail page with edit panel, status
      actions, document checklist and delete — `apps/web/app/(app)/applications/`
- [x] `/api/applications`, `/api/applications/:id`, `…/:id/status`, `…/:id/documents`,
      `…/:id/documents/:docId`
- [x] Fill-sessions list + detail with "Create application"; form library with "Report form"
- [x] Multi-stage fills link every stage's fill session to one application (see Phase 4)

Remaining:

- [ ] Customer profile application history, and acceptance pass against spec §9.7
- [ ] Roaming customers cannot have applications created from the extension (see Phase 4)

## Phase 8 — Billing hooks ◐

Done:

- [x] Billing page with plan comparison; `/api/billing/{checkout,plan,usage,webhook}`
- [x] Checkout provider interface with a mock provider (`apps/web/lib/billing/providers`, tested)
- [x] Migration 0018 — plan-code sync

Remaining:

- [ ] Real payment provider; `.env.example` lists `RAZORPAY_*` that nothing reads and omits
      `BILLING_WEBHOOK_SECRET`, which the webhook does read
- [ ] Webhook idempotency tests; `billing.webhook_processed` audit action is defined but never written

## Phase 9 — Security hardening ☐

Full RLS review, audit coverage, consent records, export/delete workflows, sensitive reveal flow,
log redaction verification, support access grants, backup plan, security tests.

Known gaps found while updating the docs (details in `docs/SECURITY.md`):

- [ ] **Product owner:** full Aadhaar is stored for every organization "with customer consent",
      but no code checks a consent record before storing or filling it, and the value sits in
      `identity_summary_json` without field encryption (unlike PAN and bank account)
- [ ] `redact()` does not catch walk-in `sender_id` / `chatId` or roaming mobiles
- [ ] No export route; customer delete is soft-delete only; data export/delete jobs not built
- [ ] Audit actions defined but never written: `auth.session_revoked`,
      `organization.security_updated` / `deleted`, `customer.exported`,
      `customer.roaming_access_expired`, `extraction.completed`, `adapter.updated`, `consent.*`,
      `data.*`, `support.*`, `platform.admin_signed_in`
- [ ] Stale comments since 0026: `packages/ai/src/safety.ts` (`maskIdentifiersInText`), 0024
      (`identity_summary_json` "already holds masked"), 0017 (`custom_prompt` masking gate)

## Phase 10 — Pilot beta ☐

5–10 pilot centres, configured workflows, operator training, fill-success monitoring, bug
collection, willingness-to-pay signal, time-saved measurement.

---

## Super Admin panel (`/admin`) ◐

Internal staff surface for spec §6.1 platform roles. Runs alongside the phases above rather than
inside one: it is owner/employee tooling, not part of the operator product.

Done:

- [x] `PLATFORM_ROLES` extended with `content_manager` and `scraper_operator`; platform permission
      matrix in `packages/core/src/platform/permissions.ts`, separate from the tenant `Permission`
      axis and carrying no customer-data permission at all
- [x] Migration 0021 — `platform_admins`, `scraper_sources`, `scraper_runs`,
      `scraped_schemes_queue`, `is_platform_admin()`, and the `platform_metrics()` /
      `platform_tenant_rows()` aggregate RPCs (service_role only)
- [x] Server-side gate (`lib/admin/session.ts`, `lib/admin/context.ts`) resolving the roster plus
      the `ADMIN_EMAILS` bootstrap; non-staff get a 404, not a 403
- [x] Analytics overview, tenant list, scheme catalogue + editor, bulk deadline board, portal
      adapters, scraper sources and run history, review queue with side-by-side diff, team roster
- [x] Scraper ingestion: `manual` / `fixture` / `http` fetchers behind a common contract, staging
      queue with content-hash dedupe, pure diff engine, human-approval-only publish path
- [x] `GET /api/admin/metrics` and `POST /api/admin/scrapers/run` (scheduler entry point, shared
      secret, fails closed)
- [x] 119 unit tests: permission matrix, diff engine, content hashing, notification date reader,
      identity resolution, SSRF/robots gates, staging decisions

Remaining:

- [ ] Run `packages/database/rls-tests/platform.test.ts` against a live local Supabase (blocked by
      the same missing Docker as the rest of the RLS suite)
- [ ] Point a scheduler at `POST /api/admin/scrapers/run` in the deployment config
- [ ] Decide whether `SCRAPER_HTTP_ENABLED` is ever turned on in production, and against which
      domains — currently off, so only `manual` and `fixture` sources do anything
- [ ] Audit log viewer (`platform.audit.view` is granted but has no screen yet)
- [ ] The `scraper.run` job type is allowed but has no handler; the scheduler must call the route

Added since: `/admin/channels` — Telegram / WhatsApp bot credentials (see Walk-in document drop).

---

## Schemes catalogue and eligibility ◐

- [x] Migration 0020 `schemes_catalog` — global and per-org rows, en/hi copy, application window,
      Zod-checked eligibility JSON, publish flag
- [x] Built-in catalogue, evaluator and state codes in `packages/core/src/schemes/`; server-side
      matching in `apps/web/lib/schemes/service.ts` (nothing sent to any vendor)
- [x] `(app)/schemes` hub, `(app)/schemes/[slug]` with an eligible-customers table, and the
      customer eligibility widget on the profile (server-rendered; no `/api/schemes`)
- [x] Seed adds demo application windows
- [ ] No tenant UI for a centre's own scheme rows (RLS already allows owner/manager writes)

## Cross-operator roaming customer access ◐

A centre can find a customer registered at another centre by mobile number and, with the
customer's consent OTP, get time-boxed read access. `docs/DATABASE.md` (0024, 0025) and
`docs/SECURITY.md` §2 have the design.

- [x] Migration 0024 — links, time-boxed grants (12 h max), OTP challenges, grant-aware read
      policies on `customers`, `customer_field_values`, `documents`, `document_derivatives`;
      service-role-only lookup functions; `roaming_access` consent subject
- [x] `apps/web/lib/roaming/` and routes `GET /api/customers/roaming/search`,
      `POST /api/customers/roaming/link`, `GET /api/customers/:id/roaming`,
      `POST …/:id/roaming/{request-otp,verify-otp,revoke}`
- [x] Dashboard: roaming lookup, roaming customers table, auth modal, locked card with masked
      pre-consent eligibility preview, active banner; extension support (Phase 4)
- [x] Tests: `rls-tests/roaming_access.test.ts`, `packages/core/src/roaming/grants.test.ts`,
      extension `roaming.test.ts`
- [ ] **Product owner:** OTP goes over WhatsApp only; SMS vendor not chosen
- [ ] Schedule `expire_roaming_access_grants()`
- [ ] Run the roaming RLS suite against a live Supabase (needs Docker)

## Walk-in document drop ◐

Customers send documents to the counter from their phone (QR / public page, Telegram or WhatsApp);
the operator previews them and saves them to a new, existing or roaming customer.
`docs/ARCHITECTURE.md` §7a.

- [x] Migrations 0022 (sessions + files staging, permanent `counter_drop_code`, 2 h expiry, purge
      on `POST /api/jobs/run`), 0023 (`platform_channel_settings`, encrypted at rest, env fallback),
      0025 (insert-only roaming save, no extraction, audited as critical)
- [x] Public `(public)/drop/[code]` + `POST /api/document-drop/public/:code` — add-only, one file
      per request, 15 MB, 10 files per session, 60 counter sessions per hour
- [x] Operator routes under `/api/document-drop/sessions` — list/create, delete, 5-min audited
      file preview, convert (new, existing, subset of files, or roaming), simulate (404 in prod)
- [x] Bots: `POST /api/webhooks/telegram`, `GET`/`POST /api/webhooks/whatsapp`, secret/signature
      checked, 404 when unconfigured; `/admin/channels` with test + set-webhook
- [x] Dashboard drop modal, queue, customer picker, file preview; `/standee/print` A5 standee
- [ ] RLS tests for the 0022 drop tables and 0023 `platform_channel_settings`
- [ ] Per-IP rate limit on the public upload
- [ ] Point a scheduler at `POST /api/jobs/run` (also needed by Phase 3)
- [ ] Live Meta / Telegram round-trip

## Dashboard revamp ☑

- [x] `(app)/dashboard`: hero, stat cards, customer jump search, recent customers, applications
      pipeline, productivity widget, schemes opportunity radar, power-tools launcher, onboarding
      checklist with extension detection, plus the walk-in drop modal and queue
- [x] `apps/web/lib/dashboard/metrics.ts` (IST days, counts only) with tests
- [x] Public `/roadmap` and `/tasks` serve `public/tasks.html`

## Citizen mobile app (`apps/mobile`) ◐

Spec: `docs/CITIZEN_MOBILE_APP_SPEC.md` (§8 has the build status). Everything real runs on the
phone; the app makes no network calls and uploads nothing. Mobile suite: 35 files, 393 tests
passing (2026-09-27).

Built:

- [x] Expo Router scaffold, theme, `en` + `hi`, `@assistigo/core` wiring; five-tab shell (Home,
      Vault, Scan, Connect, Profile) with a custom tab bar
- [x] Camera scanner (`react-native-vision-camera`) with live page outline, auto capture, torch,
      up to 24 pages, gallery import
- [x] OpenCV pipeline (`react-native-fast-opencv`): straight-edge page detection, EXIF upright,
      perspective flattening, Magic Color / Original / Grayscale / B&W with paper-only lighting,
      sharpening and a per-page tone curve (`lib/scan/`, `docs/SCANNER_VFLAT_QUALITY_PLAN.md` §6)
- [x] Scan review: filter cards, pinch zoom, crop editor, quarter turns and ±45° straighten dial,
      retake, add and delete page
- [x] Save Document (name, type, folder, tags, expiry) into an AES-256-GCM encrypted vault with a
      keystore key and a Zod-validated encrypted index
- [x] Vault tab (search, folders, recent, starred, sort, list/grid), Document Details (viewer,
      rename, tags, move, delete, star), export via share / save / print as multi-page PDF
- [x] Local expiry reminders that never name the document; session language switch and About

Screens only (no backend; sample data appears only in `__DEV__` builds):

- [x] Splash, onboarding, mobile-number / OTP / profile registration screens — no SMS is sent,
      no code is checked, the profile is discarded
- [ ] Security setup / app lock (placeholder)
- [ ] Home dashboard from real vault data
- [ ] Connect / nearby centres / centre details (no directory or location in release builds)
- [ ] Profile account card (signed-out in release builds)

Remaining:

- [ ] **Product owner:** Supabase phone OTP sign-in and what citizen profile data is stored
- [ ] Biometric / PIN app lock
- [ ] Cloud sync and the `citizen_accounts` / `citizen_vault_documents` / `operator_access_logs`
      tables (spec §5)
- [ ] Operator bridge in `apps/web` / `apps/extension`, consent access modes, access history
- [ ] Centre directory, location, directions; Connect & Share
- [ ] Photo / signature / ID presets, on-device OCR
- [ ] Dewarping, finger removal, low-contrast detection
- [ ] Persist language and saved centres; dark mode for branded screens
- [ ] Replace the dev-only demo mobile number in `app/(auth)/mobile-number.tsx` with an obviously
      fake value

---

## Deferred, by decision

- Physical E-card and card reader (spec §4.3) — revisit only against the criteria listed there.
- Customer portal, public API, WhatsApp notifications (V2/V3). WhatsApp is used today only for
  walk-in document intake and the roaming consent OTP, not for notifications.
- ~~Citizen mobile app~~ — un-deferred by the product owner. Built as `apps/mobile`
  (Expo + Expo Router); see the Citizen mobile app section above.
- Regional languages beyond the Hindi/English foundation.

---

## Known deviations from spec §26

| Spec says                      | Built as                                              | Why                                                                                       |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/database/migrations` | `supabase/migrations`                                 | CLI-native path; avoids a synced second copy that would drift                             |
| —                              | `apps/web/app/(app)/…` route group                    | Keeps `/dashboard`, `/customers` at the top level while sharing one authenticated shell   |
| Product name Assistigo.ai      | UI says "Bharatfill"; mobile artwork says "BharatDoc" | Branding in flux (`docs/DOMAIN_STRATEGY.md`); code, packages and docs still use Assistigo |
