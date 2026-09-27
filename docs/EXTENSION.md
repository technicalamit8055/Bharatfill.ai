# Chrome Extension

Derived from master spec §15, §7.4, §19.6.

---

## 1. Manifest

Manifest V3. Permissions requested at install:

```json
"permissions": ["activeTab", "storage", "scripting", "sidePanel", "downloads"]
```

`downloads` is what makes the side panel's one-click **Download** on a prepared file one click
(§6a): without it the best available is opening a signed URL in a tab and asking the operator to
save it. It grants no page access and no read of download history beyond what this extension
itself starts. Spec §15.2 says start minimal, so it is listed here as the fifth and last: adding
any further permission needs the same justification and matching Chrome Web Store copy.

The intended design is no `host_permissions` at install time: page access from `activeTab` (user
gesture) plus `chrome.scripting.executeScript`, with broad host access only ever as an optional
permission carrying an in-product explanation and matching Chrome Web Store copy.

**The shipped manifest does not match that.** `apps/extension/public/manifest.json` currently
declares, since commit c8cd42d:

| Key                         | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| `host_permissions`          | `["http://*/*", "https://*/*"]`                                             |
| `content_scripts`           | `content.js` on `http://*/*` + `https://*/*`, `all_frames`, `document_idle` |
| `optional_host_permissions` | `["http://*/*", "https://*/*"]` (redundant while the above is granted)      |

So the content script is loaded on every http(s) page and frame the operator opens, not injected
on demand. On load it only sets a presence marker (`data-assistigo-extension="1"` on `<html>`,
read by the dashboard's first-run checklist) and registers its message listener; it reads no
fields until a `DETECT_FIELDS` arrives. `ensureContentScript` in the service worker still pings
and falls back to `executeScript`. The file comment in `content/index.ts` ("injected on demand")
is stale. This diverges from spec §15.2 and needs a product-owner decision before a store build.

`chrome.webNavigation` is used in `background/index.ts` to read and fill sub-frames, but the
`webNavigation` permission is not declared, so `chrome.webNavigation` is undefined and both
sub-frame branches are skipped (every call is guarded with `?.`). What remains is one
`chrome.tabs.sendMessage` with no `frameId`; with `all_frames` content scripts every frame
receives it and Chrome keeps the first reply, normally the top frame's, whose detector walks
same-origin iframes itself (§6). Not verified on a portal with cross-origin frames.

`externally_connectable.matches` lists the dashboard origins only — `http://localhost:3000`,
`https://assistigo.ai` and `https://*.assistigo.ai` — because pairing (§3) is the one thing a web
page is allowed to start. Nothing else may message the extension.

Icons are generated from `Assests/assistfill-logo.png` into `apps/extension/public/icons`
(16/32/48/128 plus the `wordmark.png` used in the panel header). The 512px store tile lives at
`Assests/assistigo-mark-512.png` and is deliberately outside the bundle.

## 2. Components

| Component                      | Responsibility                                                                                                     | Must not                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `background/` (service worker) | auth/session, message routing, all API calls                                                                       | touch the DOM                       |
| `content/`                     | detect fields, apply fills, attach files, presence marker                                                          | store PII, log values, click submit |
| `popup/`                       | connection status, customer selector, "Detect fields" (opens the side panel), Open dashboard                       | render untrusted HTML               |
| `review/`                      | review table, confidence, edit/skip, Fill, results, stage workflow (§6b), document picker + preview (§6a)          | call the API directly               |
| `sidepanel/`                   | mounts `review/ReviewPanel` in Chrome's side panel                                                                 | add chrome the browser provides     |
| `shared/`                      | Zod message schemas, API client, storage helpers, shared React UI (`CustomerPicker`, `RoamingAuthBanner`, `Brand`) | touch the host page                 |

Chrome's side panel is the only review surface. `review/ReviewPanel.tsx` holds the UI and
`sidepanel/` is a thin mount of it, so the panel can be re-hosted later without touching the
review logic. It renders a Disconnect button next to the organization/role row, so ending a
session does not require reopening the popup, and an **Open dashboard** icon in its header (§4a).

## 3. Auth

The extension does not implement its own login form. "Connect account" opens
`${APP_URL}/extension/connect?ext=<runtime id>`, the signed-in dashboard mints a short-lived
pairing code, and the service worker exchanges it at `POST /api/extension/pair` for a session.
Tokens live in `chrome.storage.session` and are refreshed by the service worker. Signing out of
the dashboard revokes the extension session — the extension holds the _Supabase_ refresh token,
so `POST /api/extension/refresh` fails the moment that token family is revoked.

Rationale: no password ever passes through extension code, and Chrome Web Store review sees no
credential handling.

```text
popup  ──"Connect account"──▶  tab: /extension/connect?ext=<id>
                                     │  operator presses "Connect this extension"
                                     ▼
                               POST /api/extension/pairing-code   (cookie auth)
                                     │  → code (returned once, never stored in the clear)
                                     ▼
                               chrome.runtime.sendMessage(<id>, { code })
                                     │
                                     ▼
service worker  ──▶  POST /api/extension/pair { code }  ──▶  { accessToken, refreshToken, expiresAt }
```

What holds this together:

| Risk                                         | Control                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A crafted `?ext=` pairs a hostile extension  | `resolveExtensionId` checks `EXTENSION_ALLOWED_IDS`; empty allowlist fails closed outside local |
| A page other than the dashboard sends a code | `externally_connectable`, plus an exact `sender.origin` comparison in the service worker        |
| The pairing table leaks                      | Only SHA-256 of the code is stored; the session is AES-256-GCM sealed with the code hash as AAD |
| A code is replayed                           | `consume_extension_pairing_code()` checks expiry and marks consumed in one statement            |
| A code outlives its tab                      | 120-second TTL, one live code per user, `purge_extension_pairing_codes()` sweeps the rest       |

### CORS

The service worker calls the dashboard from `chrome-extension://<id>`, which is a cross-origin
request, so the browser preflights `/api/*` and discards the response unless it allows that
origin. `apps/web/middleware.ts` echoes the origin back when the id passes the same
`EXTENSION_ALLOWED_IDS` gate used for pairing, and `apps/web/lib/extension/cors.ts` does the same
for the pairing routes so their 401s carry the headers too.

`Access-Control-Allow-Credentials` is never sent. The extension authenticates with a bearer token,
and allowing credentials would let a permitted extension ride the operator's dashboard cookies.

Without this the pairing request never leaves the browser: a code is minted, nothing consumes it,
and the panel reports that the extension refused the connection.

Pairing is behind an explicit button on the connect page, not automatic on load: granting an
extension your session is an authorisation, and it should be one the operator performed on
purpose. Failures from `/api/extension/pair` are deliberately indistinguishable — unknown,
expired and already-redeemed all return the same 401, so the endpoint is not an oracle.

## 4. Message contract

Defined once in `apps/extension/src/shared/messages.ts` as a Zod discriminated union on `type`.
A message is flat — `{ type, ...fields }`, no `requestId`/`payload` envelope — and every reply is
`{ ok: true, data }` or `{ ok: false, error, messageKey? }`. `parseMessage` rejects anything whose
`sender.id !== chrome.runtime.id` or that fails the schema: the service worker answers
`invalid_message`, the content script drops it silently (a reply would confirm the extension to a
page that guessed its id). A thrown error is never forwarded; the worker replies
`request_failed` with the `ApiError`'s `messageKey` or `errors.internal`.

```text
PING                     sidepanel/popup → background   (also background → content, liveness)
GET_SESSION              → background   (GET /api/me + stored selection)
CONNECT_ACCOUNT          popup/sidepanel → background   (opens /extension/connect?ext=<id>, §3)
DISCONNECT               popup/sidepanel → background   (clearAllSensitive(), §7)
SEARCH_CUSTOMERS         sidepanel/popup → background → GET /api/customers/search?q=&limit=10
SELECT_CUSTOMER          → background   (CustomerSummary only: id, name, code, mobile last 4,
                         roaming flags)
OPEN_DASHBOARD           → background   ({ path? } → new tab, §4a)
DETECT_FIELDS            → background → content   (the payload comes back as the reply)
DETECTION_RESULT         declared in the schema, not routed: detection travels as the reply to
                         DETECT_FIELDS
REQUEST_MAPPING          sidepanel → background → POST /api/forms/map
                         { applicationId? } links this stage to a saved application (§6b)
APPLY_FILL               sidepanel → background → content   (values travel only here)
                         instructions come from buildFillInstructions(), never from the panel
                         itself: that applies the named transforms, re-checks safety classes,
                         and orders dependent dropdowns parent-first
                         carries chosen file attachments too: the panel sends { targetId, kind },
                         the background swaps in the bytes, the page never sees an id (§6a)
                         results come back as the reply; the worker then PATCHes
                         /api/fill-sessions/:id { status: 'filled', results }
FILL_RESULT              declared in the schema, not routed: results travel as the APPLY_FILL
                         reply
REPORT_FORM              sidepanel → background → POST /api/form-reports (field metadata only)
CREATE_APPLICATION       sidepanel → background → POST /api/applications   (idempotent per tab,
                         §6b)
DOWNLOAD_DERIVATIVE      sidepanel → background → server   (signed URL → chrome.downloads)
DOWNLOAD_DOCUMENT        sidepanel → background → server   (the same, for an original upload)
LIST_CUSTOMER_DOCUMENTS  sidepanel → background → server   (vault metadata; selected customer
                         only, and refused while a roaming grant is locked)
GET_DOCUMENT_PREVIEW     sidepanel → background → server   (short-lived signed URL, not bytes)

SEARCH_ROAMING_CUSTOMER  sidepanel → background → server   (platform-wide, exact mobile only)
LINK_ROAMING_CUSTOMER    sidepanel → background → server   (bookmark + select; grants nothing)
GET_ROAMING_ACCESS       sidepanel → background → server   (masked card + top scheme matches)
REQUEST_ROAMING_OTP      sidepanel → background → server   (never returns the code itself)
VERIFY_ROAMING_OTP       sidepanel → background → server   (mints the time-boxed grant)
REVOKE_ROAMING_SESSION   sidepanel → background → server
```

The six roaming messages (migration 0024) are the extension's half of the cross-centre roaming
feature — see §4b and docs/SECURITY.md "Cross-operator roaming access". None of them ever carries
a value from the customer's record beyond what the masked pre-auth card already shows; the
selected `CustomerSummary`'s `isRoaming` / `accessStatus` / `grantExpiresAt` fields are what gate
Detect fields and the customer vault while a roaming customer's window is locked.

Added since this section was last revised: `CONNECT_ACCOUNT`, `DISCONNECT`, `SEARCH_CUSTOMERS`,
`OPEN_DASHBOARD` and `CREATE_APPLICATION` (all present earlier in code but undocumented), the
optional `applicationId` on `REQUEST_MAPPING` (commit 33f3ec1), and the three document messages
`DOWNLOAD_DOCUMENT` / `LIST_CUSTOMER_DOCUMENTS` / `GET_DOCUMENT_PREVIEW` (af8e8e9).

Customer values exist in the content script only for the duration of the fill, are never written
to storage, and are cleared from the message context when the fill completes.

### 4a. Opening the dashboard

`OPEN_DASHBOARD { path? }` makes the worker open `${dashboardUrl}${path ?? '/dashboard'}` in a new
tab (`chrome.tabs.create`). Entry points:

| Where                                                 | `path`                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Side panel header icon (commit 4bbe235), popup footer | none → `/dashboard`                                                            |
| "Prepare in Document Tools Studio", preview modal     | `/document-tools/photo-signature` or `/pdf-studio` with `?customerId=&preset=` |
| "View" next to a linked application (§6b)             | `/applications/<id>`                                                           |

It is a plain navigation, not a sign-in handoff: no token and no customer field value goes in the
URL (the Document Tools links carry only the customer's internal uuid and a preset code), and the
dashboard tab uses its own cookie session. `path` is a string of at most 200 characters
concatenated onto the configured origin with no further validation; only the extension's own
pages can send the message (sender check above).

### 4b. Roaming customers

Cross-centre roaming (spec §7.4.3, migration 0024) lets a counter serve a citizen registered at
another centre, but only inside a time-boxed window the citizen consents to. In the extension it
is two components and the six roaming messages:

```text
CustomerPicker     side panel and popup
                   local search (SEARCH_CUSTOMERS, ≥2 chars, 250 ms debounce)
                   no local match + query is exactly 10 digits
                     → button "Search Assistigo Network for <number>"
                     → SEARCH_ROAMING_CUSTOMER  → GET  /api/customers/roaming/search?mobile=
                        masked rows: display name, mobile last 4, state, isLinked
                   row not yet linked: "+ Link to counter"
                     → LINK_ROAMING_CUSTOMER    → POST /api/customers/roaming/link
                        bookmarks and selects, accessStatus 'locked'
                   row already linked: "Select" — selected locally as 'locked', no server call
RoamingAuthBanner  side panel only, above the fill controls, when the selection isRoaming
  locked           GET_ROAMING_ACCESS          → GET  /api/customers/:id/roaming
                     masked card + top scheme matches ("Eligible for …")
                   duration 1h / 2h / 4h (default 2h), "Request OTP to unlock autofill"
                     → REQUEST_ROAMING_OTP     → POST /api/customers/:id/roaming/request-otp
                        { purpose: 'form_filling', durationMinutes, channel: 'whatsapp' }
                        reply: mobile last 4 + expiry, never the code
                   6-digit input, "Verify & unlock", "Resend code"
                     → VERIFY_ROAMING_OTP      → POST /api/customers/:id/roaming/verify-otp
                        stored selection → 'granted' + grantExpiresAt
  granted          "Active roaming session (HHh MMm remaining)", ticking every 30 s
                   "Lock / End" → REVOKE_ROAMING_SESSION → POST /api/customers/:id/roaming/revoke
                        stored selection → 'locked'
```

The operator sees a "Roaming" badge on the selected-customer card, the masked mobile, and, while
locked, **Detect fields** and **Customer vault** disabled; `LIST_CUSTOMER_DOCUMENTS` is also
refused in the worker (`roaming_access_locked`, §6a). The extension-side gate is convenience —
RLS on `customers`, `customer_field_values`, `documents` and `document_derivatives` is what
actually refuses a locked customer, and `POST /api/forms/map` relies on it.

The code the operator types is the citizen's consent code, sent by Assistigo to the citizen and
read back at the counter. It goes into the extension's own panel and nowhere else; it is not a
portal OTP, and portal OTP boxes stay unfillable (§5).

Known gaps, as the code stands:

- The countdown is cosmetic. On expiry the banner refreshes session state, but `GET_SESSION`
  returns the stored selection without re-checking the grant, so the panel keeps showing an
  active session at `00m` and leaves Detect enabled until the operator re-selects or presses
  Lock / End. The server refuses the reads regardless.
- "Save as an application" (§6b) does not work for a roaming customer: `POST /api/applications`
  requires the customer to belong to the caller's organization and answers 404, and the panel
  swallows the failure.

Asserted by `apps/extension/tests/roaming.test.ts` (5 tests: OTP request path and error shape,
verify marks only the selected customer granted, a wrong code mints nothing).

## 5. Fill safety

The content script refuses, unconditionally:

- clicking anything that `isSubmitControl()` identifies,
- calling `form.submit()` or `form.requestSubmit()`,
- dispatching Enter keydown inside a form,
- writing to a field classified as captcha, OTP or payment,
- writing to a disabled, readonly or hidden field.

There is no `apps/extension/tests/safety.test.ts` (there never was one in git history). The rules
are asserted by the `filler — safety: …` blocks in `apps/extension/tests/filler.test.ts` (never
submits, never calls `submit`/`requestSubmit`, refuses submit-shaped click targets, never fills
CAPTCHA/OTP/payment, skips disabled and readonly fields, attachment obeys the same rules), by the
"does not submit" / CAPTCHA-OTP cases in `demo-forms.test.ts` and `bihar-rtps.test.ts`, and for
classification by `packages/form-engine/src/safety.test.ts`. The Enter-key and hidden-field rules
hold because no code path exists for them; neither has a dedicated assertion. None of these
suites may be deleted or weakened.

The multi-stage workflow (§6b) adds no new way past these: it advances only when the operator
presses the panel's own button after using the portal's own navigation.

## 6. Detection

Walks `document.forms` plus loose inputs, skipping invisible elements
(`offsetParent === null`, zero-size, `visibility:hidden`, `opacity:0`). Label resolution order:
`<label for>` → wrapping `<label>` → `aria-labelledby` → `aria-label` → preceding text node →
table header cell → placeholder. Nearby text is trimmed to 120 characters and excludes a
`<select>`'s own `<option>` text — options are the field's possible _values_, they travel
separately, and leaving them in made them act as naming signals. Same-origin iframes are walked;
cross-origin frames are reported as `frameBlocked` so the operator knows a section could not be
read.

`FIELD_SELECTOR` in `detector.ts` is the one definition of what counts as a field: native
controls, `[contenteditable]`, and the ARIA roles a component library uses when it rebuilds a
control out of divs. It is exported and imported by `filler.ts` rather than duplicated, because a
field's signature is derived from its index in _that selector's_ result list — a filler querying a
different set of elements would resolve every signature to the wrong field. The same applies to
`collectCustomOptionElements`: detection and filling look for a custom dropdown's options in the
same places, so an option the operator was shown is never one the filler cannot find.

The types a control reports and the values it can accept are covered in
`docs/FORM_ENGINE.md` §9a.

## 6a. Document attachment helper (§7.4.5, §13.3)

`detectFields` reports every `<input type="file">` like any other field, plus its `accept`
attribute. It is never a _mapped_ field — `isSupportedInputType('file')` is false and
`proposeMappings` always skips it with `unsupported_type` — so no customer value is ever written
into one. `matchDocumentRequirements` in `packages/form-engine/src/documents.ts` is the other
half: it infers the field's category (`photo` / `signature` / `pdf`) from its label text first,
the `accept` attribute only as a fallback, then — when the resolved portal adapter lists
`documentRequirements` — picks the one requirement that matches by category and label overlap.

`POST /api/forms/map` resolves the rest server-side and returns it as `documentSuggestions`
alongside the field mappings: the preset (the adapter's `presetCode`, or a portal-name guess
against the built-in catalogue in `@assistigo/document-tools`), and — gated on `document.view`,
so a role that cannot see the customer's documents gets none — up to five of the customer's
existing files in that category, prepared `document_derivatives` first (ranked with a same-preset
match ahead of the rest) and then original `documents` uploads that no tool has been run over
yet.

### Manual override: the customer document picker

Heuristic matching is right most of the time and wrong in three recurring ways: it ranks Aadhaar
first when the citizen would rather use a Voter ID, it cannot infer a category for an upload box
labelled "any other supporting document" (or labelled in a script `CATEGORY_WORDS` does not
cover) so it offers nothing at all, and on a step-by-step form the operator reaches a box the
matcher never saw. `CustomerDocumentPickerModal` is the fallback for all three: it lists every
file on the profile — `LIST_CUSTOMER_DOCUMENTS` fetches `/api/documents` and `/api/derivatives`
side by side — grouped as Identity & address / Educational / Photos & signatures / Other, with a
search box, and any of them can be put into any detected upload box.

Two things keep it inside §7.4.5 rather than turning it into document autofill:

- **The portal's `accept` still wins.** A manual pick is checked with `fileMatchesAccept` against
  the box's own attribute; a file the box would reject cannot be chosen, and says why. It stays
  previewable and downloadable, because being unable to attach a file is no reason to be unable
  to look at it — the operator can still upload it by hand.
- **Only the selected customer, and only with consent.** The worker refuses a
  `LIST_CUSTOMER_DOCUMENTS` for anyone but the customer already selected in this session, and
  refuses outright while a roaming customer's grant is locked — RLS would return an empty list,
  and an empty vault reads as "this citizen has no documents" rather than "they have not
  consented yet" (migration 0024).

Both list routes drop their own `organization_id` predicate when scoped to one customer, leaving
the filter to `documents_select` / `document_derivatives_select`: a roaming customer's files
belong to their home centre, so an explicit org filter would narrow the vault to nothing.

Upload boxes the server suggested nothing for are listed too, under "Other upload boxes" — a box
that is never shown is a box the operator cannot attach anything to. Invisible file inputs are
excluded on both sides (`matchDocumentRequirements` skips `visible === false`, the panel filters
the same way), and the detector now also treats an element with no client rects as invisible in a
real browser and ignores punctuation-only labels, so RTPS Bihar's hidden
representative-authorization and internal-uploader widgets no longer surface as phantom cards.

The picker is also reachable before any page is read: **Customer vault — all saved documents**
under the customer card opens it with no target box (browse only), disabled while a roaming grant
is locked.

### Preview

`DocumentPreviewModal` opens from a suggestion row and from the picker. Each open sends
`GET_DOCUMENT_PREVIEW { targetId, kind }`, which mints a fresh signed URL through the same
`signedUrlPath` routes as an attachment (audited, `document.download` re-checked); the panel keeps
the URL only as an `<img src>` or link. Images render with fit / 100% / zoom steps and drag-to-pan;
a PDF shows a card with **Open in new tab**. When a preset is known the modal shows green/amber
pills for size (against `minBytes`/`maxBytes`) and pixel dimensions — hints, never a block. The
attach toggle appears only when a box is in play, and is disabled with a reason when the box's
`accept` rejects the file; Download and "Prepare in Document Tools Studio" stay available.
Asserted by `apps/extension/tests/customer-documents.test.ts` (10 tests: both list routes, partial
failure, selected-customer and roaming refusals, per-`kind` signed-URL routing, legacy
`derivativeId` alias, fetch failure per box).

The side panel's "Documents to attach" section renders this: the portal's stated size and
dimensions, each suggested file with a tick box and a one-click **Download**
(`DOWNLOAD_DERIVATIVE`), and a "Prepare in Document Tools Studio" button that opens
`/document-tools/photo-signature` or `/document-tools/pdf-studio` with `?customerId=&preset=` —
both pages already resolve a preset from that query string, and the photo/signature page also
derives its initial mode from the preset's category so a signature deep link does not land in
photo mode.

### Attaching a prepared file

A ticked file is attached to the upload box by the fill itself. Chromium lets a content script
build a `DataTransfer`, put a `File` in it and assign the list to `input.files`; the page then
sees what it would have seen from the file picker — preview, client-side validation, and a
native submit that carries the bytes.

This runs on its own path end to end, and the separation is the point:

```text
side panel     APPLY_FILL { instructions, attachments: [{ signature, targetId, kind }] }
                 ↑ ids only — the panel never holds document bytes
                   kind is 'derivative' | 'source_document': the two live in different tables
                   behind different routes, and a uuid does not say which
background     POST /api/derivatives/:id/signed-url      (kind: 'derivative')
               POST /api/documents/:id/signed-url        (kind: 'source_document')
                 ↑ both re-check document.download and write an audit row
               fetch(signedUrl) → base64
               APPLY_FILL { instructions, fileInstructions: [{ signature, filename,
                                                               mimeType, dataBase64 }] }
                 ↑ attachments is dropped; the page never sees a document id
content        applyFill(instructions)  then  attachFiles(fileInstructions)
                 ↑ kind is spent by now: the filler attaches bytes and does not care
                   which table they came from
```

What keeps this inside §7.4.5 rather than becoming autofill of documents:

- **Nothing is attached by default.** The panel starts with every tick box clear. A mapped text
  value is a proposal the engine can defend; which document belongs in which upload slot is a
  judgement about what the portal is asking for, so it takes an explicit tick per box — or an
  explicit pick out of the customer document picker.
- **One file per box**, because an upload input takes one; choosing a second replaces the first.
  A file chosen out of the picker for a box that also had suggestions is shown in that box's card
  as an **Override**, so what will be attached is never left implicit.
- **`attachFiles` re-checks the live element**, exactly as `applyFill` does: a box that
  classifies as CAPTCHA, OTP or payment is refused whatever the instruction says, a disabled box
  is skipped, and the box's own `accept` is re-read from the DOM at fill time in case the page
  narrowed it after detection.
- **Failure is reported as failure.** If `DataTransfer` is missing or the assignment does not
  take, the result is `failed`, never `filled`. There is deliberately no fallback that redefines
  `files` on the element: that would make the page _look_ right while a native submit sent
  nothing, and an operator would file an incomplete application believing the document was
  attached.
- **Still no submit.** Attaching dispatches `input` and `change` and nothing else.

Bytes exist in the service worker for the length of the fill and are never stored. An operator
whose role allows `document.view` but not `document.download` gets suggestions but no
attachment: the signed-URL endpoint refuses, and the file is dropped from the fill rather than
failing it.

The tick boxes and the **Download** button both remain, because attaching cannot always work —
a portal that opens its own upload dialog, or replaces the input with a drag-and-drop widget
backed by no `<input type="file">`, still needs the file on disk.

## 6b. Multi-stage / multi-page forms

Some portals spread one application over several pages — RTPS Bihar's main form
(`renderApplicationForm.do`), then the Annexure page where the address proof and self declaration
are uploaded, then the acknowledgement. Each page is its own detect → map → fill pass and opens its
own `fill_sessions` row. The stage workflow (commit 33f3ec1) keeps those passes under one
`applications` row. It uses the existing `fill_sessions.application_id` column; no migration.

### What the operator sees

After a fill, the "done" screen in `ReviewPanel.tsx` shows, in order:

- the filled / skipped / failed summary;
- **Re-fill N skipped field(s)**, only when some result is `skipped` with `dependent_not_ready`
  (e.g. प्रखंड / Block waiting on Sub-Division). It rebuilds instructions for just those
  signatures from the same proposal, values and edits, with no fresh detection, and sends
  `APPLY_FILL`; the other skip reasons would not change on retry, so they get no button;
- a notice: "Completed Stage N. Solve any CAPTCHA and press the portal's own Proceed / Save & Next,
  then scan the next page here — Bharatfill never does that step for you.";
- **Scan Stage N+1 (Next Page)** — increments the counter and re-runs detection on whatever page
  the tab now shows (`DETECT_FIELDS`, then `REQUEST_MAPPING` with the linked `applicationId`);
- **Save as an application**, or once saved a badge "Application linked: #<first 8 of id>" with
  **View** (`OPEN_DASHBOARD /applications/<id>`);
- **Back to review**.

### What it does not do

The extension never watches navigation: there is no `tabs.onUpdated` or `webNavigation` listener,
and the stage number moves only when the operator presses Scan. It never clicks Proceed / Next /
Submit, never solves the CAPTCHA and never advances the portal; that stays the operator's action
(§5, spec §19.7). The stage number is a label and gates nothing.

### Where the state lives

| State                                                           | Where                                           | Lifetime                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `currentStage`                                                  | side panel React state                          | until the panel is closed or reloaded, or a different customer is chosen |
| `activeApplicationId` (panel copy)                              | side panel React state                          | same                                                                     |
| `activeApplicationId`, `detection`, `mappings`, `fillSessionId` | service worker `tabStates` map, keyed by tab id | until the tab closes or Chrome stops the worker                          |

Nothing about a stage or application is written to `chrome.storage.session` or
`chrome.storage.local`. The panel sends its copy with every `REQUEST_MAPPING`, so the link carries
across a worker restart and across tabs while the panel stays open; the worker's copy covers a
message that arrives without one.

### How it links to an application

```text
REQUEST_MAPPING { applicationId? }
  worker: applicationId = message.applicationId ?? tab's remembered id; remember it on the tab
  POST /api/forms/map { customerId, detection, applicationId? }
    server: application must be in the caller's org, for this customer, not deleted
            → else 404 errors.application_not_found
    inserts fill_sessions.application_id

CREATE_APPLICATION { title }            title = page title (≤160) or "Application"
  tab already linked → { id, existing: true }, no request
  else POST /api/applications { customerId, title, status: 'filled',
                                portalUrl: origin + path (never the query string),
                                fillSessionId? }
    server: inserts the application, then back-links that one fill session
            (UPDATE fill_sessions SET application_id, scoped to org + customer)
  remembers the id on the tab → { id, existing: false }
```

Consequences worth knowing:

- Only the fill session current at the moment of **Save** is back-linked. Stages filled before the
  first save stay unlinked, so saving on stage 1 is what links the whole journey.
- Closing the side panel drops the panel's copy. If the worker has also restarted, or the next
  page opened in another tab, the link is gone and the next Save creates a second application.
- A roaming customer cannot be saved (§4b).
- **Re-fill** goes through the normal `APPLY_FILL` path, so the worker PATCHes the same
  `fill_sessions` row a second time with only the retried results: the row's filled/skipped counts
  are overwritten with the subset's, duplicate `fill_session_fields` rows are inserted for those
  signatures, and a second `fill` usage unit is recorded. Open issue (billing-relevant).
- The panel's strings for this workflow are hard-coded English, not translation keys.

Asserted by `apps/extension/tests/multi-stage.test.ts` (5 tests: `CREATE_APPLICATION` returns the
same id on a second call and never sends a null `fillSessionId`/`portalUrl`; `REQUEST_MAPPING`
forwards an explicit `applicationId`, reuses the tab's remembered one, and omits it on the first
stage). The panel UI (counter, buttons, re-fill) has no tests.

## 7. Storage

| Key                | Store                    | Contains                                                                                                         |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `session`          | `chrome.storage.session` | access token, refresh token, expiry                                                                              |
| `selectedCustomer` | `chrome.storage.session` | `CustomerSummary`: id, display name, customer code, mobile last 4, `isRoaming`, `accessStatus`, `grantExpiresAt` |
| `settings`         | `chrome.storage.local`   | locale, overwrite-filled-fields flag, dashboard URL                                                              |
| `recentCustomers`  | `chrome.storage.session` | the same `CustomerSummary` shape, most recent first, max 10                                                      |

Nothing sensitive is written to `chrome.storage.local`. `DISCONNECT` clears the three session keys
(`clearAllSensitive`). Per-tab working state (detection, mappings, fill session id, linked
application) and the multi-stage counter are in memory only, never in storage (§6b).

## 8. Blocked pages

`isBlockedPage` in `content/detector.ts` makes `DETECT_FIELDS` answer `blocked_page` on
`chrome:`, `chrome-extension:`, `edge:`, `about:`, `view-source:` and `file:` URLs and on
`chromewebstore.google.com` / `chrome.google.com`. The manifest's `content_scripts` match only
`http(s)://*/*`, and Chrome itself refuses script on its own pages and the Web Store.

## 9. Build

Vite, multi-entry, fully bundled. No remote script tags, no CDN fonts, no `eval`, no
`new Function`. `npm run build:extension` emits `apps/extension/dist`, which is loaded unpacked in
development and zipped by `scripts/build-extension.ts` for store upload.

`VITE_DASHBOARD_URL` selects the backend at build time and defaults to `http://localhost:3000`.
A store build must set it, and the value must be one of the `externally_connectable` origins:

```bash
VITE_DASHBOARD_URL=https://assistigo.ai npm run build:extension
```

Regenerate the icons after any logo change with `scripts/generate-icons.mjs`.

## 10. Acceptance criteria (§15.5)

- [ ] Connects to a signed-in dashboard account
- [ ] Detects fields on every demo form
- [ ] Displays the selected customer's name and mobile last four at all times
- [ ] Fills text, date, select, radio and checkbox fields
- [ ] Skips CAPTCHA and OTP placeholders and says so in the results
- [ ] Never submits
- [ ] Records a fill session with filled / skipped / review counts
- [ ] Reports errors with no PII

These stay unticked until checked by hand against a running dashboard; the automated suite covers
parts of them but not the live pairing or a real portal.

Automated state, `npx vitest run --project extension` on 2026-09-27: **7 files, 144 tests, all
passing.**

| File                         | Tests | Covers                                                       |
| ---------------------------- | ----: | ------------------------------------------------------------ |
| `detector.test.ts`           |    34 | detection, labels, visibility                                |
| `filler.test.ts`             |    54 | writes per control type, safety blocks (§5), file attachment |
| `demo-forms.test.ts`         |    19 | end-to-end on the demo forms, no submit, CAPTCHA/OTP refused |
| `bihar-rtps.test.ts`         |    17 | RTPS fixture: adapter selection, mapping, fill, no submit    |
| `customer-documents.test.ts` |    10 | document picker / preview / attachment routing (§6a)         |
| `multi-stage.test.ts`        |     5 | application linking across stages (§6b)                      |
| `roaming.test.ts`            |     5 | roaming OTP request / verify (§4b)                           |
