# Architecture

Derived from master spec §15, §16, §17, §26.

---

## 1. System shape

```text
┌──────────────────┐   ┌────────────────────────┐   ┌───────────────────────────┐
│  Web dashboard   │   │  Chrome MV3 extension  │   │  Walk-in citizen / infra  │
│  + /admin panel  │   │  popup / side panel /  │   │  /drop/<code>, WhatsApp & │
│  (Next.js App    │   │  content script / SW   │   │  Telegram webhooks, cron  │
│   Router, RSC)   │   │                        │   │  schedulers, billing hook │
└────────┬─────────┘   └───────────┬────────────┘   └─────────────┬─────────────┘
         │ cookie session          │ bearer token                 │ drop code / signature /
         │                         │ (Supabase session)           │ shared secret
         └─────────────────────────┼──────────────────────────────┘
                                   ▼
              ┌─────────────────────┐
              │   API layer         │  Next.js route handlers + server actions (/admin),
              │   apps/web/app/api  │  Zod-validated
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  Domain services    │  packages/core, ai, form-engine,
              │                     │  document-tools
              └──────────┬──────────┘
                         ▼
   ┌──────────────┬──────────────┬───────────────┬──────────────┐
   │  Postgres    │  Storage     │  Jobs table   │  OCR/AI      │
   │  (+ RLS)     │  (private)   │  + worker     │  providers   │
   └──────────────┴──────────────┴───────────────┴──────────────┘
```

A fourth app, `apps/mobile` (Expo citizen scanner + vault, `docs/CITIZEN_MOBILE_APP_SPEC.md`), sits
outside this picture: it is local-only today. It imports `@assistigo/core` for shared types, makes
no `fetch` call and has no Supabase client; scans are encrypted on the device and never uploaded,
and phone OTP sign-in is a UI shell that is not wired to Supabase Auth.

## 2. Stack decisions

| Concern              | Choice                                         | Why                                                                  |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Web framework        | Next.js 15, App Router, TypeScript             | Spec §16.1; RSC keeps operator lists fast                            |
| API style            | Next.js route handlers + Zod                   | Spec §17.3 — pick one and stay consistent                            |
| Auth                 | Supabase Auth (email/password)                 | Spec §16.1, §19.4                                                    |
| Database             | Supabase Postgres + RLS                        | Spec §18                                                             |
| File storage         | Supabase Storage, private buckets, signed URLs | Spec §19.3                                                           |
| Client data fetching | plain `fetch` to `/api/*` from client islands  | Spec §16.1 names TanStack Query; it is a dependency but not yet used |
| Styling              | Tailwind + local primitives in `packages/ui`   | Spec §16.2 — dense operational UI                                    |
| i18n                 | Local dictionary loader, `en` / `hi`           | Spec §20                                                             |
| Background jobs      | `jobs` table + worker route, polled            | Spec §17.5 — works on Vercel + Supabase                              |
| Extension build      | Vite, multi-entry, bundled (no remote code)    | Spec §15.3                                                           |
| Tests                | Vitest (unit/RLS/extension/mobile projects)    | Spec §23 also names Playwright E2E; not yet set up                   |

### Why route handlers rather than tRPC

The Chrome extension is a first-class client. Plain HTTP + Zod keeps the extension's API client
small, avoids shipping a tRPC runtime into a content script, and keeps the contract inspectable
in the network tab during QA (spec §30 expects Antigravity to read network errors).

## 3. Client surfaces, one API

|                   | Dashboard                      | Extension                              | Super Admin panel                                              |
| ----------------- | ------------------------------ | -------------------------------------- | -------------------------------------------------------------- |
| Session transport | HTTP-only Supabase cookies     | `Authorization: Bearer <access_token>` | HTTP-only Supabase cookies                                     |
| Token storage     | browser cookie jar             | `chrome.storage.session` (spec §15.1)  | browser cookie jar                                             |
| Entry point       | `apps/web/app/(app)`           | `apps/extension/src`                   | `apps/web/app/admin`                                           |
| Gate              | org role (`requirePermission`) | org role — same routes, same checks    | platform role (`requirePlatformPermission`), then service role |

`apps/web/lib/api/context.ts` resolves both tenant transports into one `RequestContext`
(`{ supabase, userId, organization, membership, role, permissions, actorType }`). There is no
separate extension-only route list: a bearer token reaches any route its role permits, and the
middleware only adds CORS for `chrome-extension://` origins on `EXTENSION_ALLOWED_IDS` (any
well-formed id in `local`). Handlers never look at cookies or headers directly.

The admin panel resolves a different context (`apps/web/lib/admin/context.ts`): the roster in
`platform_admins` plus the `ADMIN_EMAILS` bootstrap, 404 for non-staff. Its pages mutate through
server actions (`apps/web/app/admin/*/actions.ts`); its route handlers are `/api/admin/metrics`,
`/api/admin/channels` (+ `/test`, `/set-webhook`) and the scheduler-only `/api/admin/scrapers/run`.

Callers with no user session, each with its own fail-closed gate:

| Caller                    | Route                                                  | Gate                                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| Citizen's phone browser   | `/drop/<code>`, `POST /api/document-drop/public/:code` | a live drop code or counter code (§7a)        |
| Meta (WhatsApp Cloud API) | `GET`/`POST /api/webhooks/whatsapp`                    | verify token handshake; `X-Hub-Signature-256` |
| Telegram Bot API          | `POST /api/webhooks/telegram`                          | `X-Telegram-Bot-Api-Secret-Token`             |
| Scheduler                 | `POST /api/jobs/run`, `POST /api/admin/scrapers/run`   | bearer `JOB_RUNNER_SECRET`                    |
| Billing provider          | `POST /api/billing/webhook`                            | bearer `BILLING_WEBHOOK_SECRET`               |

## 4. Package boundaries

```text
packages/core           Pure domain logic + Zod schemas. No React. No Supabase client.
  ├ auth/               tenant roles + permissions, platform roles
  ├ customers/          profile schema, field keys, duplicate detection, normalisation
  ├ documents/          document types, upload limits
  ├ applications/       status machine, transitions
  ├ billing/            plans, entitlements, billing provider interface
  ├ audit/              audit action catalogue, sensitivity levels
  ├ privacy/            redaction, masking, encryption helpers
  ├ roaming/            cross-operator access vocabulary, request schemas, grant arithmetic
  ├ schemes/            built-in scheme catalogue, eligibility types, evaluator, state codes
  ├ platform/           platform permissions, scraper candidate/diff/hash, notification date
  │                     reader, channel-settings schemas
  └ document-drop/      drop session codes, channel payload schemas, convert/simulate schemas

packages/ai             OCR provider interface + mock / local (PDF text) / AI vision
                        (OpenAI-compatible or Anthropic wire format) providers, classification,
                        field extraction, normalisation, confidence scoring, safety gate, fixtures.

packages/form-engine    Detected-field schema, mapping dictionaries (en + hi), scorer,
                        adapter schema + registry, file-input document matching,
                        safety classifiers (captcha / otp / payment / submit).

packages/document-tools Image + PDF operations, portal requirement presets.

packages/database       Seed script + fake fixtures (src/seed/), RLS test suite (rls-tests/).
                        Migrations are in supabase/migrations/ (docs/DATABASE.md).

packages/ui             Shared React primitives (button, controls, feedback, form, table).
```

Dependency direction is one-way: `apps/*` → `packages/*`. Packages never import from apps.
`core` is the package the others depend on; the one exception is `packages/database`, whose seed
imports `@assistigo/form-engine` for the built-in portal adapters. `apps/mobile` consumes only
`@assistigo/core`.

Packages publish TypeScript source directly (`"main": "./src/index.ts"`); the web app lists them
in `transpilePackages`, and Vite/Vitest resolve them by alias. No package build step.

## 5. Request lifecycle (dashboard write)

```text
1. Route handler receives request
2. resolveContext()      → user, org, role   (401/403 here, not later)
3. Zod parse of body     → typed input       (400 here)
4. requirePermission()   → role gate         (403)
5. Domain call in packages/core              (pure, testable)
6. Supabase call under the *user's* JWT      → RLS is the second gate
7. writeAuditLog() when the action is sensitive
8. Redacted response
```

RLS is never the only gate, and never bypassed for convenience. The service-role client
(`createSupabaseAdminClient`) is used only where there is no user JWT to carry, or where the
schema deliberately keeps a table out of reach of one — each case authorises first and is listed
in `docs/SECURITY.md` §2:

- migrations and the seed script;
- the job worker (`/api/jobs/run`, and the inline runner in `/api/documents/:id/process`);
- the billing webhook;
- extension pairing (`/api/extension/pairing-code`, `/api/extension/pair`);
- the Super Admin panel (`lib/admin/context.ts`, `lib/admin/session.ts`) and
  `/api/admin/scrapers/run`;
- walk-in intake: the WhatsApp/Telegram webhooks and channel adapters, the public drop page and
  `POST /api/document-drop/public/:code`, and the non-production `…/simulate` route;
- roaming consent (`lib/roaming/service.ts`), for the OTP challenge and grant tables.

## 6. Extension architecture (spec §15)

```text
popup/          Quick status, customer selector, "Detect fields"
review/         Rich review table, confidence, edit/skip, Fill button
sidepanel/      Mounts review/ReviewPanel in Chrome's side panel
content/        Field detection, safe fill application
background/     Service worker: auth, message routing, API calls (no DOM)
shared/         Message schemas (Zod), API client, storage helpers, types
```

Message flow:

```text
sidepanel ──DETECT_FIELDS──▶ background ──▶ content.detect()
content ────field metadata──▶ background ──POST /api/forms/map──▶ server
server ─────mapping proposal─▶ background ──▶ sidepanel (review UI)
user clicks Fill
sidepanel ──APPLY_FILL──────▶ background ──▶ content.fill()
content ────per-field result─▶ background ──PATCH /api/fill-sessions/:id──▶ server
```

Every message is parsed with a Zod schema on receipt, and the sender's origin is verified.
Field **values** only travel background → content at fill time; they are never persisted in
extension storage and never logged.

## 7. Background jobs (spec §17.5)

A `jobs` table plus a worker endpoint, rather than an external queue, because the MVP hosting
target is Vercel + Supabase.

```text
jobs(id, organization_id, type, payload, status, attempts, run_after, locked_until, ...)
```

- Producers insert a row inside the same transaction as the entity they act on.
- The worker claims rows with `FOR UPDATE SKIP LOCKED` and a `locked_until` lease.
- Handlers are idempotent, keyed on `(type, payload.entity_id)`.
- Job types allowed by the `jobs.type` check: `ocr.extract`, `document.derivative`,
  `retention.sweep`, `billing.aggregate`, `adapter.healthcheck`, `notification.send`,
  `data.export`, `data.delete`, `scraper.run`. Only `ocr.extract` has a handler today
  (`apps/web/lib/jobs/runner.ts`); any other type is completed as a failure
  (`no handler for type …`). Operators can enqueue only `ocr.extract` and `document.derivative`
  (`enqueue_job`, migration 0014).
- Two sweeps ride the scheduler routes rather than the table: `/api/jobs/run` also purges
  expired walk-in drop sessions (`lib/document-drop/purge.ts`), and `/api/admin/scrapers/run`
  polls due scraper sources (at most 10 per call; `manual` sources are skipped).

There are two ways into the same execution path, because a queue with no worker is a document
that says "Reading" forever:

- **Inline, by entity.** `POST /api/documents/:id/process` claims and runs _only that document's_
  extraction job (`claim_document_job`), in the request. On by default (`JOB_INLINE_RUNNER`).
  Claiming by document rather than draining the queue is what keeps one tenant's upload from
  waiting on another tenant's work. Nothing about the inline run can fail the request — the job
  row remains the source of truth.
- **Batched, by schedule.** `POST /api/jobs/run` claims whatever is due across organizations
  (`claim_jobs`), gated on `JOB_RUNNER_SECRET`. This is what runs the retry/backoff path in
  `complete_job`, which the inline runner does not cover on its own, so a scheduler is still
  worth pointing at it.

See docs/AI_PIPELINE.md §10.

## 7a. Walk-in document intake (spec §9.1)

The one feature with callers that are neither the dashboard nor the extension, so it is worth
stating what is different about it.

```text
citizen phone ──▶ WhatsApp Cloud API ──▶ POST /api/webhooks/whatsapp  ─┐
              ──▶ Telegram Bot API   ──▶ POST /api/webhooks/telegram  ─┼─▶ lib/document-drop/intake
              ──▶ /drop/<code>       ──▶ POST /api/document-drop/…    ─┘        │
                                                                                ▼
                                                    document_drop_sessions + private bucket
                                                                                │
operator dashboard ◀── GET /api/document-drop/sessions (poll) ──────────────────┘
                   ──▶ POST …/:id/files/:fileId/signed-url  (5-min preview, audited)
                   ──▶ POST …/:id/convert ──▶ new or existing customer + documents + ocr.extract
                                          └─▶ roaming customer's home org (grant, no extraction)
```

A session is opened by the operator on screen (`POST /api/document-drop/sessions`, QR + code in
the dashboard modal) or minted per citizen from the organization's permanent
`counter_drop_code`, printed on the A5 counter card at `/standee/print` (signed-in only; its QR
points at the web drop page, which offers the WhatsApp hand-off). Convert takes an optional
`customerId`, an optional `fileIds` subset (the rest stay staged for another customer) and
`target: 'local' | 'roaming'`. `DELETE …/sessions/:id` discards; `POST …/:id/simulate` stages
demo fixtures and 404s in production.

Four properties, because each is a decision that could reasonably have gone the other way:

- **Three transports, one pipeline.** Each channel adapter (`whatsapp.ts`, `telegram.ts`) only
  authenticates, normalises and replies. Everything that touches data lives in `intake.ts`, so
  the channels cannot drift into enforcing different limits.
- **Credentials resolve database-first, environment-fallback.** Both adapters read
  `platform_channel_settings` (0023) — a Super Admin configures the bots at `/admin/channels`
  rather than editing `.env`, and the tokens are AES-256-GCM ciphertext at rest, decrypted only
  in the adapter. An unset or disabled row falls through to the `WHATSAPP_*` / `TELEGRAM_*`
  variables, so a deployment that configures nothing in the database behaves exactly as before
  the panel existed. The lookup carries a 2s ceiling: an unreachable database degrades to the
  environment rather than holding a webhook open past Meta's own timeout, because a delivery
  that times out is retried, and a retry re-stores documents already taken in.
- **The webhooks carry no user session, so they fail closed.** Unconfigured credentials mean the
  route 404s rather than half-working. Each delivery is verified — Meta's `X-Hub-Signature-256`
  over the raw body, Telegram's secret-token header — and both routes then always answer 200,
  because a non-2xx earns a retry that would re-download and re-store the same documents.
- **`/drop/<code>` is the only unauthenticated write path in the product.** It is add-only: a code
  in the wrong hands can put a file into one session and can read nothing, list nothing and
  enumerate nothing. Unknown, expired and already-claimed codes are one indistinguishable 404.
  Limits: one file per request, 15 MB, sniffed MIME allow-list, 10 files per session, sessions
  expire after two hours, and a counter code mints at most 60 sessions per hour.

Intake is staged, not trusted. Files sit in `document_drop_sessions` until an operator presses
Intake, which is the only step that creates a customer, promotes files into `documents` and queues
extraction — and the operator verification gate downstream is unchanged: extraction proposes,
review accepts (§12.6). See docs/DATABASE.md §5 for the status-transition rule that makes the
claim safe, and the retention sweep that removes whatever nobody claimed.

The QR encoder (`lib/document-drop/qr.ts`) is written out rather than taken from npm: it runs in
both the browser and the server render, and it is a well-specified 200-line algorithm.

## 8. Frontend structure

```text
apps/web/app
  page.tsx              landing (components/landing: hero, pricing, …)
  (auth)/               sign-in, sign-up, forgot password
  onboarding/           org setup
  auth/callback/        Supabase auth callback
  invite/[token]/       accept an organization invitation
  extension/connect/    hands a pairing code to the extension
  (app)/                authenticated shell: dashboard, customers, documents, document-tools,
                        applications, form-library, fill-sessions, schemes, billing,
                        settings (+ /ai, /members)
  admin/                Super Admin panel, own layout + gate: overview, tenants, schemes,
                        deadlines, forms, scrapers, queue, team, channels
  (public)/             no sign-in: drop/[code] (walk-in upload page), roadmap and tasks
                        (both redirect to the static public/tasks.html tracker)
  standee/print/        printable counter card, outside (app) so it prints without the shell
  api/                  route handlers
apps/web/public/demo-forms/   static practice forms for QA
```

The dashboard (`(app)/dashboard`) is a set of server-rendered widgets fed by
`apps/web/lib/dashboard/metrics.ts` (IST-day arithmetic over counts, never customer values):
hero + stat cards, customer jump search, recent customers, applications pipeline, productivity
trend, schemes opportunity radar, power-tools launcher, onboarding checklist, and the walk-in
drop modal and queue. Schemes (`(app)/schemes`, `/schemes/[slug]`, and the eligibility widget on
the customer page) are matched in-process by `apps/web/lib/schemes/service.ts` over rows the
caller's RLS already allows; there is no `/api/schemes` route.

Middleware (`apps/web/middleware.ts`) redirects signed-out users to `/sign-in` except on its
`PUBLIC_PATHS` (landing, auth, `/demo-forms`, `/drop`, `/tasks`, `/roadmap`). It is a redirect,
not authorization.

Server Components fetch through a per-request Supabase server client. Client islands (search,
review tables, tool editors) call the same API routes the extension calls, so both surfaces
exercise one code path.

## 9. Environments

| Environment | Data                           | Notes                                    |
| ----------- | ------------------------------ | ---------------------------------------- |
| local       | seeded fake data               | `supabase start`, mock OCR, mock billing |
| development | fake data                      | shared, test keys                        |
| staging     | fake/demo only unless approved | Antigravity QA target                    |
| production  | real                           | strict redaction, backups, monitoring    |

`NEXT_PUBLIC_APP_ENV` (`local` | `development` | `staging` | `production`) selects the row.
`local` loosens two things only: any well-formed extension id may pair and get CORS when
`EXTENSION_ALLOWED_IDS` is empty, and debug log payloads are allowed. `production` disables
`POST /api/document-drop/sessions/:id/simulate`.

Configuration is read and Zod-validated in `apps/web/lib/env.ts`; `.env.example` documents it.
Names only — never commit values.

| Group            | Variables                                                                                                                                                                                            | Fails closed when unset                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Supabase         | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (RLS tests)                                                                              | —                                                               |
| App              | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV`, `EXTENSION_ALLOWED_IDS`, `VITE_DASHBOARD_URL` (extension build)                                                                                        | pairing, outside `local`                                        |
| Encryption       | `FIELD_ENCRYPTION_KEY`                                                                                                                                                                               | PAN/bank, AI vendor keys, channel secrets                       |
| OCR / AI         | `OCR_PROVIDER`, `OCR_AI_PROVIDER`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OCR_AI_BASE_URL`, `OCR_AI_MODEL`                                                                                        | AI reading (`OCR_AI_PROVIDER=none`)                             |
| Jobs             | `JOB_RUNNER_SECRET`, `JOB_INLINE_RUNNER`                                                                                                                                                             | `/api/jobs/run`, `/api/admin/scrapers/run`                      |
| Billing          | `BILLING_PROVIDER`, `BILLING_WEBHOOK_SECRET`                                                                                                                                                         | `/api/billing/webhook`                                          |
| Observability    | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (in `.env.example`; not read by `env.ts` yet)                                                                                                                 | —                                                               |
| Super Admin      | `ADMIN_EMAILS` (bootstrap), `SCRAPER_HTTP_ENABLED`, `SCRAPER_ALLOWED_HOSTS`                                                                                                                          | `http` scraper fetcher (`off` by default)                       |
| Walk-in channels | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BOT_NUMBER`, `WHATSAPP_APP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | each webhook 404s; fallback to `platform_channel_settings` rows |

`.env.example` lists `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`, which
nothing reads yet (only the `mock` billing provider is implemented; `razorpay` / `stripe` throw
`provider_unavailable`), and omits `BILLING_WEBHOOK_SECRET`,
which the webhook route does read.

## 10. What is intentionally not here

Per spec §4.2/§4.3: no physical E-card, no card reader, no autonomous submission agent, no
custom-trained OCR model, no large portal-adapter library at V1.

The spec also lists a citizen mobile app as out of scope; the product owner has since
un-deferred it (docs/ROADMAP.md), and `apps/mobile` exists as a Phase 1 scaffold under its own
spec. It is not integrated with this API (§1).
