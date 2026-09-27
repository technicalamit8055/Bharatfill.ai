# Form Detection and Field Mapping Engine

Derived from master spec §14.

---

## 1. Responsibilities

| Stage            | Where it runs                  | Output                                                     |
| ---------------- | ------------------------------ | ---------------------------------------------------------- |
| Detection        | content script                 | `DetectedField[]` — metadata only, no customer PII         |
| Classification   | `packages/form-engine`         | safety class per field (normal/captcha/otp/payment/submit) |
| Mapping          | server (`POST /api/forms/map`) | `FieldMapping[]` with `customerField`, confidence, reason  |
| Value resolution | server                         | proposed value per mapping, from the selected customer     |
| Review           | side panel                     | operator accepts / edits / skips                           |
| Fill             | content script                 | per-field result, no submit                                |
| Logging          | server                         | `fill_sessions` + `fill_session_fields`                    |

## 2. Detected field schema (§14.2)

The content script sends metadata only:

```ts
{
  signature: string; // stable hash of form+name+id+index
  tagName: 'input' | 'select' | 'textarea';
  inputType: string; // text | email | tel | date | select-one | radio | checkbox | file …
  name: string | null;
  id: string | null;
  placeholder: string | null;
  labelText: string | null;
  ariaLabel: string | null;
  nearbyText: string | null; // trimmed, capped at 120 chars
  sectionHeading: string | null;
  options: {
    value: string;
    label: string;
  }
  [] | null;
  required: boolean;
  maxLength: number | null;
  pattern: string | null;
  accept: string | null; // file inputs only, e.g. "image/*"
  hasValue: boolean; // whether it is already filled — never the value itself
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
  frame: number; // 0 = top document
  order: number; // index in the detected set, keeps review order stable
}
```

Plus page context: `origin`, `path` (never the query string), `title`, `blockedFrames`. **Full
page HTML is never sent.** Source of truth: `detectedFieldSchema` / `pageContextSchema` in
`packages/form-engine/src/types.ts`.

## 3. Mapping strategy (§14.3)

Resolution order — first hit wins, and the reason is recorded so the operator can see _why_:

1. `adapter` — portal adapter exact mapping for a matching URL pattern
2. `org_custom` — organization-specific override
3. `history` — a mapping previously confirmed for the same portal + field signature
4. `dictionary` — rules-based synonym dictionary (English + Hindi + Hinglish)
5. `ai` — AI-assisted mapping using **field metadata only** (never customer values)
6. `manual` — the operator maps it by hand

## 4. Scoring

The dictionary matcher scores each candidate customer field:

| Signal                                               | Weight                         |
| ---------------------------------------------------- | ------------------------------ |
| exact normalized match on label                      | 1.00                           |
| exact match on `name`/`id` attribute                 | 0.95                           |
| exact match on aria-label / placeholder              | 0.90                           |
| token-subset match on label                          | 0.80                           |
| match on nearby text                                 | 0.65                           |
| match on section heading                             | 0.55                           |
| input-type compatibility                             | ×0.5 penalty when incompatible |
| negative-keyword hit (e.g. "father" for `full_name`) | reject                         |

Nearby text and the section heading are the two signals that read text the field does not own, and
both are traps for container words. An entry can set `ownTextOnly: true` to opt out of them — set
on the printed-address entries, because "Address" is also a section heading with a block of
unrelated fields beneath it, and without it every dropdown in a "Present Address" fieldset was
proposed as the printed-address blob.

A related detector rule: a `<select>`'s `nearbyText` excludes its own `<option>` text. The options
are the field's possible _values_ and travel separately; left in the nearby text they read as part
of the field's name, which is how a "स्थानीय निकाय का प्रकार" dropdown came to claim the panchayat
mapping off the back of a "ग्राम पंचायत" option.

Confidence bands (§14.6):

| Band   | Range       | Behaviour                               |
| ------ | ----------- | --------------------------------------- |
| high   | 0.90 – 1.00 | fillable after preview                  |
| medium | 0.70 – 0.89 | shown in review, pre-checked            |
| low    | < 0.70      | requires explicit operator confirmation |

**Always review regardless of confidence**: Aadhaar-like number, PAN, bank account, category /
caste, income, disability, DOB sourced from low-quality OCR, and any value whose source field is
still `extracted` (unverified).

## 5. Safety classification (§14.5, §14.8, §19.7)

`packages/form-engine/src/safety.ts` exports pure predicates used by both the mapper and the
content script:

- `isCaptchaField(f)` — label/name/id/class contains captcha markers, or the field sits next to a
  captcha image/iframe. Result: **skip, never read**.
- `isOtpField(f)` — otp / one time password / verification code / ओटीपी. Result: **skip**.
- `isPaymentField(f)` — card number, cvv, expiry, upi id, netbanking credentials. Result:
  **never filled in MVP**.
- `isSubmitControl(el)` — `type=submit` / `image` / `reset`, any `<button>` without an explicit
  `type="button"` (it submits by default), or text/name/id matching submit / proceed / pay /
  confirm / final (English and Hindi). Result: **never clicked**.

The fill executor refuses these classes even if a mapping somehow proposes them. This is
belt-and-braces on purpose.

### Tokenising the haystack (commit 2cb8e14)

Every predicate above matches against one normalised string built from `inputType`, `name`, `id`,
`className`, `placeholder`, `labelText`, `ariaLabel`, `nearbyText` and `autocomplete`. The
normaliser used to lowercase first and split camelCase second, which left nothing to split:
`otpMobile` became `otpmobile`, the whole-token `\botp\b` test never fired, and an OTP box named
in camelCase classified as a normal mobile field — exactly the field the adapter's `mobile` entry
would then claim. The order is now:

1. `_`, `-`, `.` → space;
2. split lower→upper and lower→digit (`otpMobile` → `otp Mobile`, `mobileOtp2` → `mobile Otp 2`);
3. split a capital run before a capitalised word (`SMSCode` → `SMS Code`, not `smsc ode`);
4. split digit→letter (`otp1x` → `otp 1 x`);
5. lowercase, collapse whitespace.

No marker list changed; this only makes the existing OTP (and CAPTCHA/payment) markers see
camelCase, PascalCase and digit-suffixed names. `safety.test.ts` pins it with 16
mobile/email-flavoured OTP shapes (`otpMobile`, `mobileOTP`, `txtOtpMobile`, `OTP_MOBILE`,
"Enter 6-digit Mobile OTP", "मोबाइल सत्यापन कोड", …) that must classify as `otp`, a check that
`optional` / `optOut` do not, and a check that genuine `mobileNumber` / `mobile_no` / `emailId`
fields stay `normal`.

This is tier two. Tier one is the adapter's own `negativePatterns`: in both built-in adapters the
`mobile` and `email` entries carry `otp`, `ओटीपी`, `one time password`, `verification`, `verify`,
`सत्यापन` and `alternate`, and `adapterFieldMatchScore` runs the negatives before the selector and
key shortcuts. `adapters.test.ts` ("contact fields never claim an OTP input") asserts that per
adapter and per attribute.

## 6. Adapter schema (§14.7)

```ts
type PortalAdapter = {
  id: string; // uuid — fill_sessions.portal_adapter_id is a uuid foreign key
  slug: string; // merge key against portal_adapters rows
  portalName: string;
  formName: string;
  region?: string;
  // Scheme-catalogue category, for the Form Library filter only; the mapper never reads it.
  // No portal_adapters column yet: a database row inherits it from the built-in with its slug.
  category?: 'recruitment' | 'welfare' | 'scholarship' | 'certificate' | 'business_loan';
  urlPatterns: string[]; // glob-ish: * within a segment, ** across; https://demo.example/*/apply
  version: string;
  status: 'draft' | 'testing' | 'active' | 'deprecated';
  lastVerifiedAt?: string;
  fields: AdapterField[];
  documentRequirements: DocumentRequirement[]; // defaults to []
  notes?: string; // ≤1000 chars
  knownIssues?: string; // ≤1000 chars — what the adapter deliberately leaves to the operator
};

type DocumentRequirement = {
  key: string;
  label: string;
  presetCode?: string; // a @assistigo/document-tools preset, e.g. ssc.photo
  required: boolean; // defaults to true
  notes?: string;
};

type AdapterField = {
  key: string; // adapter-local id; matched as a whole token against name/id
  customerField: string; // customer.full_name
  selector?: string; // CSS selector, preferred when stable
  labelPatterns?: string[]; // fallback when selectors drift
  negativePatterns?: string[]; // disqualifiers; outrank every positive signal
  inputType: string;
  transform?: string; // named transform, see §7
  required?: boolean;
  reviewRequired?: boolean;
  dependsOn?: string; // adapter key that must be filled first
};
```

Source of truth: `portalAdapterSchema` in `packages/form-engine/src/adapters.ts`. When several
adapters match a URL, `selectAdapter` ranks by status (active > testing > draft) and then by
pattern specificity; a `deprecated` adapter never matches.

**There is no stage or page field.** An adapter describes the fields it can recognise, not the
order of a portal's pages; each page of a multi-page journey is detected and matched on its own,
against the same URL patterns. Which page a document requirement is uploaded on is recorded only
as prose in its `notes` (RTPS Bihar does this, §6a). Linking the stages of one journey happens in
the extension and the API — `REQUEST_MAPPING.applicationId` and `fill_sessions.application_id` —
see docs/EXTENSION.md §6b.

Adapters are data, not code — stored in `portal_adapters` and seeded from
`packages/form-engine/src/adapters/*.json`. A selector that no longer matches degrades to
`labelPatterns`, then to dictionary mapping, and raises an adapter-health warning.

`packages/form-engine/src/adapter-registry.ts` parses those JSON files at import and exports them
as `BUILT_IN_ADAPTERS`. `POST /api/forms/map` merges them under the database rows by slug
(`mergeAdapters`), so a deployment whose seed has not run still maps supported portals, and a
corrected row in `portal_adapters` still wins. Publish them with
`npm run db:seed:adapters` (add `-- --confirm-remote` for a non-local project). A built-in that is
not yet a row still maps the form; it just cannot be named in `fill_sessions.portal_adapter_id`,
which is a foreign key.

### Matching

`findAdapterField` picks the **highest-scoring** adapter field, not the first one that matches.
This matters on a Hindi form, where labels nest — `नाम` is a substring of `पिता का नाम`, so
first-match-wins would hand the applicant's name field to whichever entry happened to be written
earlier in the JSON. Scores, highest first: a selector baked into the signature, the `key` as a
whole token in `name`/`id`, then the longest matching `labelPattern`.

`negativePatterns` disqualifies a field outright and outranks every positive signal. An adapter
matches against `name`, `id`, `labelText`, `placeholder` and `ariaLabel` — never `nearbyText`,
because an adapter match is treated as near-certain and may only look at text that belongs to the
one control.

### Fill order

`dependsOn` names the adapter field that must be written first. `proposeMappings` turns the chain
into `MappingProposal.fillOrder`, which the API returns and the side panel passes to
`buildFillInstructions`. Without it, dependent dropdowns worked only on portals whose DOM order
happens to put the parent above the child.

### Attachment types (`types.ts`, commit af8e8e9)

A customer's files live in two tables, so every attachment and suggestion now says which one:

```ts
const ATTACHMENT_KINDS = ['derivative', 'source_document'] as const;

// side panel → worker, per upload box: an id, never bytes
type FileAttachmentRequest = {
  signature: string;
  targetId: string; // uuid
  kind: 'derivative' | 'source_document'; // defaults to 'derivative'
};

// one entry of documentSuggestions[].suggestions (max 5 per upload box)
type DerivativeSuggestion = {
  /* id, filename, sizeBytes, width, height, createdAt, mimeType, matchesPreset — as before */
  kind: 'derivative' | 'source_document'; // defaults to 'derivative'
  documentType?: string; // documents.document_type, source documents only
};
```

`kind` picks the signed-URL route (`/api/derivatives/:id/signed-url` or
`/api/documents/:id/signed-url`). `fileAttachmentRequestSchema` still accepts the old
`{ signature, derivativeId }` shape and rewrites it to `targetId` with the default kind, so an
older panel build keeps working against a newer worker. `FileFillInstruction` (worker → content:
`signature`, `filename`, `mimeType`, `dataBase64`) is unchanged. Pinned by `types.test.ts`.

`documents.ts` changed in the same commit: `CATEGORY_WORDS.pdf` also recognises Aadhaar, PAN,
voter, identity / ID proof, address proof, income, caste, domicile, residence and ration labels,
and `matchDocumentRequirements` skips any field with `visible === false`. A file field with no
text signal and no usable `accept` still infers `null`, so it gets no suggestion card.

## 6a. Supported portals

| Adapter slug               | Portal                                                 | Forms                                                         | Status  |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ------- |
| `bihar-rtps-serviceonline` | RTPS Bihar / ServicePlus, `serviceonline.bihar.gov.in` | Income, caste and residence certificate                       | testing |
| `ssc-portal`               | Staff Selection Commission, `ssc.gov.in` + subdomains  | One-Time Registration; CGL / CHSL / GD Constable applications | testing |

Both are registered in `BUILT_IN_ADAPTERS` (`adapter-registry.ts`). Both are `testing`: covered
by unit tests and fixtures, not yet promoted to `active`, and neither sets `lastVerifiedAt`.

### RTPS Bihar

One adapter covers all three certificate services, because the only thing that distinguishes them
is `?serviceId=463/464/465` and §14.2 forbids transmitting the query string. Per-field
`labelPatterns` do the selecting instead: the annual-income field simply does not match on a caste
form.

Matching is label-driven with no selectors. ServicePlus generates its `name`/`id` attributes
(`attr_1003`), so a hand-written selector would be a guess that rots silently; the bilingual
labels are the stable part.

What the adapter deliberately does **not** fill, and why:

| Field                                                  | Why                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| आधार संख्या / Aadhaar Number                           | The adapter has no field of its own for it; `customer.aadhaar` is left to the dictionary fallback, which maps and fills it when the customer has a stored value (see `apps/extension/tests/bihar-rtps.test.ts`). Asserted by a test that this adapter's own JSON stays silent on it. |
| जाति / Caste                                           | The registry holds a reservation _category_ (SC/ST/OBC), not a caste name. Filling one from the other would be a confident wrong answer.                                                                                                                                             |
| अभिवादन, सेवा का प्रकार, पेशा, स्थानीय निकाय का प्रकार | Portal-specific choices, not customer data.                                                                                                                                                                                                                                          |

अनुमंडल / Sub-Division now maps to `customer.address.sub_division` and sits between district and block in both the registry and the adapter's `dependsOn` chain. **प्रखंड / Block** still reports `dependent_not_ready` until the operator picks the sub-division on the portal; the side panel then offers **Re-fill N skipped field(s)** for just those fields (docs/EXTENSION.md §6b) — that AJAX behaviour is the portal's, not a mapping gap.

Since commit 2cb8e14 the `mobile` and `email` entries carry the full OTP/verification/alternate
`negativePatterns` set (§5), so an "OTP sent to mobile" box can no longer be claimed at adapter
level.

RTPS is a multi-page journey. The `documentRequirements` notes record where each upload happens:
the photograph is the only upload on `renderApplicationForm.do` (Step 1); address proof and the
self declaration are uploaded on the Annexure page (Step 2), a separate detection pass. The
adapter has no stage field (§6); the extension links the passes (docs/EXTENSION.md §6b).

### SSC

`packages/form-engine/src/adapters/ssc-portal.json`, slug `ssc-portal`, version 1.0.0, status
`testing`, region All India. URL patterns `https://ssc.gov.in/**` and `https://*.ssc.gov.in/**`
(the OTR form lives on a subdomain; a look-alike host such as `notssc.gov.in` does not match).

One adapter covers One-Time Registration and the CGL / CHSL / GD Constable application forms,
because SSC reuses the OTR profile across examinations and re-displays the registered particulars.
Matching is label-driven with no selectors: SSC's Angular front end generates control names
(`formcontrolname="ctrl_12"`).

| Adapter key                                            | Customer field                                                      | Notes                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `candidate_name`                                       | `customer.full_name`                                                | negatives exclude father/mother/spouse/guardian, Hindi, matriculation        |
| `candidate_name_hi`                                    | `customer.full_name_hi`                                             | also claims "name as per matriculation certificate"                          |
| `father_name`, `mother_name`                           | `customer.father_name`, `customer.mother_name`                      | each excludes the other parent and the candidate                             |
| `date_of_birth`                                        | `customer.date_of_birth`                                            | `date.ddmmyyyy`, review required                                             |
| `gender`                                               | `customer.gender`                                                   | select, `gender.full`                                                        |
| `category`                                             | `customer.category`                                                 | select, `category.code`, review required                                     |
| `aadhaar_last4`                                        | `customer.aadhaar_last4`                                            | review required; negatives exclude full / 12-digit / enrolment / OTP         |
| `mobile`, `email`                                      | `customer.mobile`, `customer.email`                                 | `mobile.10digit`; full OTP negatives; email also excludes confirm / re-enter |
| `matriculation_roll_number`, `_passing_year`, `_board` | `customer.education.class10.roll_number` / `passing_year` / `board` | SSC's "Matriculation" = Class 10; board is a select                          |
| `permanent_address_line1`                              | `customer.permanent_address.house_number`                           | excludes present / correspondence address                                    |
| `permanent_state` → `permanent_district`               | `customer.permanent_address.state` / `.district`                    | selects; district `dependsOn` state                                          |
| `permanent_pincode`                                    | `customer.permanent_address.pincode`                                | `pin.6digit`                                                                 |

Document requirements:

| Key         | Label                                                       | Preset          | Notes                                                                                             |
| ----------- | ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `photo`     | Applicant photograph (20–50 KB JPEG, name and date stamped) | `ssc.photo`     | webcam step at OTR or upload; rejected without name + capture date, or if older than three months |
| `signature` | Signature (10–20 KB JPEG)                                   | `ssc.signature` | black or blue ink on white; rejected if in capital letters                                        |

Both presets exist in `packages/document-tools/src/presets.ts`.

What the adapter deliberately does **not** fill (from its `knownIssues`):

| Field                | Why                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Identification marks | No equivalent in the customer field registry. Adding one is a product decision under docs/SECURITY.md §4. |
| Full Aadhaar         | Only the last-4 control SSC's OTR shows is mapped.                                                        |
| CAPTCHA, OTP step    | Never touched (§5).                                                                                       |

Several label patterns are generic on purpose (`state`, `district`, `board`, `roll number`,
`passing year`, `permanent address`); they are scoped only by the URL patterns and the negatives.
Asserted by the `ssc-portal adapter` block in `adapters.test.ts` (schema, URL match incl.
subdomain and look-alike, parent-name separation, state → district order, preset codes, last-4
only, review on every high-risk field) plus the registry checks in `adapter-registry.test.ts`
(uuid id, unique slug, every `customerField` exists, every transform exists). **Not yet smoke-tested
on the live portal.**

## 7. Transforms

Named, pure, unit-tested functions in `packages/form-engine/src/transforms.ts`:

| Group        | Transforms                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| dates        | `date.ddmmyyyy` (03/04/1990) · `date.ddmmyyyy_dash` · `date.yyyymmdd` · `date.iso` · `date.day` · `date.month` · `date.year` |
| text         | `text.upper` · `text.lower` · `text.titlecase` (never applied to a name by default) · `text.nospace`                         |
| identifiers  | `mobile.10digit` · `mobile.e164` (+91…) · `pin.6digit` · `aadhaar.last4`                                                     |
| enumerations | `gender.full` · `gender.mf` · `category.code` · `category.full`                                                              |
| numbers      | `number.plain` (strips `,`, spaces and `₹`: "1,20,000" → "120000")                                                           |

That is the whole `TRANSFORMS` map. The earlier list named a `name.initials` that does not exist,
and missed seven that do.

Transforms never invent data. If input is missing, the transform returns `null` and the field is
skipped rather than filled with a guess. An unknown transform name also returns `null` (skip, not
raw value), and `adapter-registry.test.ts` fails any built-in adapter that names one.

## 8. Dependent dropdowns

State → district → sub-division → block chains are filled sequentially: set the parent, dispatch `change`, wait
for the child's option list to change (bounded wait, ~1.5 s), then match the child. If the child
never populates, the field is marked `skipped` with reason `dependent_not_ready` — never forced.

## 9. Fill execution rules

- Set value via the native property setter, then dispatch `input` and `change` with `bubbles:true`
  so React/Angular/Vue controlled inputs update.
- Never dispatch `submit`, never click a submit control, never press Enter in a form.
- Never touch a field that is disabled, readonly, hidden, or already filled — unless the operator
  explicitly chose "overwrite".
- Radio/checkbox: match by option value, then option label, then normalized label; otherwise skip.
- File inputs: never carry a mapped value — `isSupportedInputType('file')` is false, so the
  mapper skips every one of them with `unsupported_type`. Not a browser limit (Chromium does let
  a content script assign `input.files` from a `DataTransfer`) but a product rule: which document
  belongs in which upload slot is the operator's judgement, so it takes an explicit tick per box
  in the side panel and travels a separate path, `attachFiles` rather than `applyFill`
  (spec §7.4.5, docs/EXTENSION.md §6a).
- Every field produces a result row: `filled | skipped | edited | failed` plus a reason.

### 9a. Field types the executor writes to

Native controls (`text`, `email`, `tel`, `number`, `search`, `url`, `date`, `datetime-local`,
`month`, `week`, `time`, `color`, `range`, `textarea`, `checkbox`, `radio`, `<select>`,
`<select multiple>`), `[contenteditable]` rich text, and the ARIA roles a component library uses
when it rebuilds a control out of divs (`combobox`, `listbox`, `select`, `checkbox`, `radio`,
`switch`, `slider`, `spinbutton`, `textbox`). `password`, `file` and every submit-shaped control
stay out, as do CAPTCHA, OTP and payment fields regardless of type (§5 above).

Three rules follow from writing to widgets rather than plain text boxes:

- **The value is formatted to what the control accepts, or the fill is refused.** A date, time,
  month, week or colour is normalised first (`15/08/1995` → `1995-08-15`, `5:30 PM` → `17:30`,
  `abcdef` → `#abcdef`) and a slider is clamped to its bounds. These types replace a value they
  reject instead of clearing it, so a filled-looking field is not evidence of a successful write —
  they are verified by exact comparison and reported `failed` otherwise.
- **A browser default is not an operator's value.** A slider reports its midpoint and a colour
  swatch reports `#000000` untouched, so for those two the detector asks whether the _page_ set a
  value rather than what the widget currently reads. Otherwise every slider and colour picker
  would be permanently `already_filled`.
- **A click target that was not vetted is not clicked.** Filling a custom dropdown or an ARIA
  radio group means clicking an element the mapper never classified. Those are checked against
  `isSubmitControl` on structure alone — a `<button>` with no `type` submits its form, so it is
  refused; naming and label text are deliberately ignored, because an option legitimately reads
  "I confirm the above". A custom dropdown with no matching option reports `skipped/no_value`
  rather than claiming success.

## 10. Unsupported forms and reports (§9.6)

Generic mapping still runs. Anything below the low threshold requires confirmation. The operator
can file a form report containing URL origin + path, anonymised field metadata, adapter id if any,
browser/extension version, and a free-text note. **No customer values are included by default**,
and a screenshot is attached only if the operator explicitly opts in for that report.
