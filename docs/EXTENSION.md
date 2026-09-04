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

No `host_permissions` at install time. Page access comes from `activeTab` (user gesture) plus
`chrome.scripting.executeScript`. If broad host access is ever needed, it must be an optional
permission with an in-product explanation and matching Chrome Web Store copy.

`externally_connectable.matches` lists the dashboard origins only — `http://localhost:3000` and
`https://assistigo.ai` — because pairing (§3) is the one thing a web page is allowed to start.
Nothing else may message the extension.

Icons are generated from `Assests/assistfill-logo.png` into `apps/extension/public/icons`
(16/32/48/128 plus the `wordmark.png` used in the panel header). The 512px store tile lives at
`Assests/assistigo-mark-512.png` and is deliberately outside the bundle.

## 2. Components

| Component                      | Responsibility                                        | Must not                            |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------- |
| `background/` (service worker) | auth/session, message routing, all API calls          | touch the DOM                       |
| `content/`                     | detect fields, apply fills, floating launcher         | store PII, log values, click submit |
| `popup/`                       | connection status, customer selector, "Detect fields" | render untrusted HTML               |
| `review/`                      | review table, confidence, edit/skip, Fill, results    | call the API directly               |
| `sidepanel/`                   | mounts `review/ReviewPanel` in Chrome's side panel    | add chrome the browser provides     |
| `shared/`                      | Zod message schemas, API client, storage helpers      | import DOM APIs                     |

Chrome's side panel is the only review surface. `review/ReviewPanel.tsx` holds the UI and
`sidepanel/` is a thin mount of it, so the panel can be re-hosted later without touching the
review logic. It renders a Disconnect button next to the organization/role row, so ending a
session does not require reopening the popup.

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

Every message is `{ type, requestId, payload }`, Zod-parsed on receipt. The receiver verifies
`sender.id === chrome.runtime.id`. Unknown types are dropped, not forwarded.

```text
PING                     sidepanel/popup → background
GET_SESSION              → background
SELECT_CUSTOMER          → background   (id + display summary only)
DETECT_FIELDS            → background → content
DETECT_RESULT            content → background → sidepanel
REQUEST_MAPPING          sidepanel → background → server
APPLY_FILL               sidepanel → background → content   (values travel only here)
                         instructions come from buildFillInstructions(), never from the panel
                         itself: that applies the named transforms, re-checks safety classes,
                         and orders dependent dropdowns parent-first
                         carries chosen file attachments too: the panel sends { targetId, kind },
                         the background swaps in the bytes, the page never sees an id (§6a)
FILL_RESULT              content → background → sidepanel → server
REPORT_FORM              sidepanel → background → server
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

The six roaming messages (migration 0024) are `RoamingAuthBanner`'s half of the cross-centre
roaming feature — see docs/SECURITY.md "Cross-operator roaming access". None of them ever carries
a value from the customer's record beyond what the masked pre-auth card already shows; the
selected `CustomerSummary`'s `isRoaming` / `accessStatus` / `grantExpiresAt` fields are what gate
the Fill button while a roaming customer's window is locked.

Customer values exist in the content script only for the duration of the fill, are never written
to storage, and are cleared from the message context when the fill completes.

## 5. Fill safety

The content script refuses, unconditionally:

- clicking anything that `isSubmitControl()` identifies,
- calling `form.submit()` or `form.requestSubmit()`,
- dispatching Enter keydown inside a form,
- writing to a field classified as captcha, OTP or payment,
- writing to a disabled, readonly or hidden field.

These are asserted by `apps/extension/tests/safety.test.ts`. That file must not be deleted or
weakened.

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
that is never shown is a box the operator cannot attach anything to.

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

## 7. Storage

| Key                | Store                    | Contains                                         |
| ------------------ | ------------------------ | ------------------------------------------------ |
| `session`          | `chrome.storage.session` | access token, refresh token, expiry              |
| `selectedCustomer` | `chrome.storage.session` | id, display name, mobile last 4                  |
| `settings`         | `chrome.storage.local`   | locale, overwrite-filled-fields flag, panel side |
| `recentCustomers`  | `chrome.storage.session` | id + display name only, max 10                   |

Nothing sensitive is written to `chrome.storage.local`.

## 8. Blocked pages

The content script never runs on `chrome://`, `chrome-extension://`, `edge://`, `about:`,
`view-source:`, `file://`, or `chromewebstore.google.com`.

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
