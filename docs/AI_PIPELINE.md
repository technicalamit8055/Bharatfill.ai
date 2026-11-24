# Document Intelligence and OCR Pipeline

Derived from master spec §12.

---

## 1. Pipeline

```text
upload
  → file validation (size, mime, magic bytes)
  → malware scan hook (placeholder in MVP, interface in place)
  → private storage write
  → document classification
  → OCR / text extraction        (provider abstraction)
  → field extraction             (per document class)
  → validation + normalisation
  → confidence scoring
  → human review                 ← nothing reaches the profile before this
  → customer profile update
  → audit log
```

Steps after storage run as an `ocr.extract` background job so uploads stay fast and retryable.

## 2. Provider abstraction and reading methods (§12.3)

```ts
export interface OcrProvider {
  readonly name: string;
  /** True when running this provider sends document bytes to a third party. */
  readonly sendsDataOffBox: boolean;
  extract(input: OcrInput): Promise<OcrResult>;
}
```

There are **two provider slots**, because a document has two very different readers behind it.

| Slot      | Env               | Provider        | Use                                                                      | Status             |
| --------- | ----------------- | --------------- | ------------------------------------------------------------------------ | ------------------ |
| local     | `OCR_PROVIDER`    | `local`         | embedded PDF text + text uploads, in-process                             | **default**        |
| local     | `OCR_PROVIDER`    | `mock`          | tests, CI, demo seed. Deterministic output from fixtures.                | tests only         |
| local     | `OCR_PROVIDER`    | `tesseract`     | cheap local OCR for simple scans                                         | not implemented    |
| AI vision | `OCR_AI_PROVIDER` | `deepseek`      | hosted vision model for photos and difficult layouts; `DEEPSEEK_API_KEY` | **off by default** |
| AI vision | `OCR_AI_PROVIDER` | `anthropic`     | ditto, Anthropic messages wire format; `ANTHROPIC_API_KEY`               | **off by default** |
| AI vision | per organization  | `org_ai_vendor` | the organization's own vendor from `organization_ai_settings` (below)    | Super Admin        |

The product is never hard-coded to one provider. `AiVisionOcrProvider`
(`packages/ai/src/providers/ai-vision.ts`) speaks three wire formats — OpenAI chat-completions
(`openai_compatible`), Anthropic messages (`anthropic_messages`) and Vertex AI generateContent
(`vertex_generate_content`, organization vendor only) — so `OCR_AI_BASE_URL` and
`OCR_AI_MODEL` repoint the deployment reader at any compatible endpoint — another hosted vendor, a
gateway, or a self-hosted vision model — without a code change. The OpenAI-shaped URL is built
from the base URL (`…/v1/chat/completions`, or `…/chat/completions` when the base already ends in
`/v1` or `/openai`). Requests time out after 60 s.

`.env.example` still describes `anthropic` as not implemented; that comment is stale — the
provider, the env wiring and a unit-tested `anthropic_messages` request builder all exist.

### Organization vendor settings (migration 0017)

**One setup for every centre.** A Super Admin sets it at `/admin/ai` (`platform_ai_settings`, 0049):
vendor, key, prompt and the on/off switch. Once saved it replaces every centre's own row and
`ai_processing_enabled` flag. It never covers the citizen app's organization — those documents need
the citizen's own consent. Centres cannot change any of it (0048).

Until it is saved, the earlier per-centre row applies. When an organization has an
`organization_ai_settings` row, `resolveAiProviderConfig` (`apps/web/lib/jobs/handlers/ocr-extract.ts`)
uses it — provider name `org_ai_vendor` — in place of `OCR_AI_PROVIDER`; with no row, the
environment reader is used exactly as before.

| Setting         | Rule                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`      | UI preset: `openai`, `anthropic`, `deepseek`, `gemini`, `vertex`, `ollama`, `openrouter`, `custom` (`apps/web/lib/ai/vendor-settings.ts`); presets supply a default base URL, model and wire format |
| `base_url`      | `https://` only; localhost, private ranges, `.local` and the cloud metadata address refused                                                                                                         |
| `model`         | falls back to the preset's default when blank                                                                                                                                                       |
| `api_key`       | AES-256-GCM at rest; never returned — the API reports `hasApiKey` only                                                                                                                              |
| `custom_prompt` | ≤ 8 000 chars; switches the reader into structured mode (below)                                                                                                                                     |

Routes: `GET /api/organizations/ai-settings` (any member; provider, on/off and `hasApiKey` only),
`PUT /api/admin/ai-settings` and `POST …/test-connection` (both
`platform.team.manage`, Super Admin only; the test sends one trivial prompt, never a document, 15 s timeout). Configuring a vendor does **not** turn AI reading on —
the PUT route's `enabled` flag writes `platform_ai_settings.enabled`, which
is the gate (rule 2 below). For a `googleapis.com` endpoint the key is also appended as a
`key=` query parameter.

`vertex` (migration 0033) is Vertex AI's API-key ("express mode") endpoint: `POST
<base>/v1/publishers/google/models/<model>:generateContent`, default base
`https://aiplatform.googleapis.com`. A base already carrying `/v1` — including a project-scoped
`…/v1/projects/<id>/locations/<region>` — is used as the prefix. The key goes in the
`x-goog-api-key` header, never the URL. Gemini "thought" parts are dropped; a response with no
candidates (a blocked prompt) is an empty answer. It is the same Gemini models as the `gemini`
preset, billed through the Google Cloud account rather than AI Studio prepay; the key must be
allowed to call the Vertex AI API, and an account-bound key's service account needs the
Vertex AI User role.

### The three reading methods

The operator picks one per upload (`extractionMode` on `POST /api/documents/:id/process`, stored
in the job payload). It is a trade-off between speed, cost and privacy, so each option is
labelled with what it costs rather than what it is called.

| Mode     | Behaviour                                                                            |
| -------- | ------------------------------------------------------------------------------------ |
| `non_ai` | Local reader only. **No byte leaves this server** — a guarantee, not a preference.   |
| `ai`     | AI vision reader, subject to the opt-in gate below.                                  |
| `auto`   | Local first; escalates to AI **only** when the local read produced no fields at all. |

Three rules hold whichever method was picked, and are enforced in `packages/ai/src/pipeline.ts`:

1. `non_ai` never touches the network.
2. `ai` **yields to `organizations.settings.ai_processing_enabled`**, which an owner must switch
   on after reading the AI-processing notice. A dropdown is not consent: an operator cannot opt
   an organization into third-party processing (§12.3, §19.3, DEVELOPMENT_RULES §1 rule 10). The
   provider refuses too, as defence in depth.
3. No reading method can fail a document merely by being unavailable. A missing key, a revoked
   key, an outage or a timeout degrades to the other reader and records a warning saying so — an
   operator who can see "read by the basic reader" can act; a document stuck at `failed` tells
   them nothing.

**Photos and signatures are not read at all.** A photograph or a signature _is_ the value (§12.4),
so when the operator picks Photograph or Signature as the type, both upload forms hide the picker
and post `storeOnly: true` instead of a method. `/process` still sniffs the magic bytes, then marks
the document `stored` without queueing `ocr.extract`: no reader runs, no extraction quota is
needed, nothing leaves the server. The document page offers no "Read again" on a stored photo or
signature.

**Any other document can be kept unread too** (product owner, 2026-11-23). Both upload forms have a
**"Just save — don't read"** tick — on and fixed for Photograph and Signature, optional for every
other type — for a passport copy, an old receipt or any file the operator only needs to keep. It
posts the same `storeOnly: true`. The server refuses it (409, `documents.errors.storeOnlyType`)
only for a document still without a type (`unknown`): detecting the type is itself a read, and a
kept file must say what it is. Such a file shows "Saved", and its document page keeps **Read
again**, so its details can be read the day they are needed.

The skip is the operator's explicit choice, never inferred from `documents.document_type`. That
column also holds a citizen's drop hint and the last classification, and the classifier calls
every image without text `photo` — including the phone photo of a marksheet that `auto` escalates
to the AI reader for. A walk-in drop is therefore still read as before, whatever the citizen
tapped.

Customer data is never used for model training. Only the provider request id is stored for audit,
never the payload. The filename is deliberately **not** transmitted: it routinely carries the
customer's name and adds nothing to a transcription (§19.6).

### The AI reader transcribes by default; it does not extract

The vision model is asked for the text on the page. Turning that text into `customer.*` fields is
still the rules engine's job (§4). Letting the model emit field keys directly would route
customer data around every guarantee downstream of OCR — the Aadhaar handling rule (§9), the
normalisers (§5), the high-risk review rules (§6) and the golden tests (§8).

Because certificates are printed as grids, the transcription prompt asks for **one label/value
pair per line**: a grid row carrying two pairs side by side must not come back as one line, and a
missing colon must be supplied. The splitter in `extract.ts` handles the rows that arrive merged
anyway (§4).

#### The two structured-mode exceptions

Structured mode is where the model _does_ emit field keys. There are two ways in, and neither
loosens anything downstream: `buildFieldsFromStructuredOutput` runs every candidate through the
same per-kind normaliser, the same high-risk review rules and the same safety gate as the rules
engine, and drops a key that is not in the customer field registry with a warning.

| Entrance        | Set by                                  | Asked for                               |
| --------------- | --------------------------------------- | --------------------------------------- |
| `customPrompt`  | a Super Admin, in AI settings | whatever the organization's prompt says |
| `dynamicSchema` | the pipeline, for one case only (below) | a mapping onto the field registry       |

**The dynamic-schema escalation.** When a document was read but matched **no printed label at
all**, there is nothing further the rules engine can do with text it has already failed to place —
an unclassified university marksheet, a college certificate, a state form nobody has written
label rules for. The pipeline then asks the model to map the page onto the profile schema itself,
using a prompt generated from the field registry (`buildDynamicSchemaPrompt`).

It is deliberately narrow, because it costs a second vendor request:

- never in `non_ai` mode, and never without `ai_processing_enabled` — the same gates as any
  other AI read (rule 10),
- only when the page yielded **zero** fields, so a document that was read is never re-read,
- never for a class that has no fields by design — a photo or a signature _is_ the value,
- never when an organization's own `customPrompt` already asked the model to map the document.

The transcription stays the retained text and the class stays as the page decided it; only the
fields come from the second pass. Both vendor request ids are recorded on the extraction row.
The operator sees `documents.warnings.aiDynamicExtractionUsed`.

### What each reader cannot do

| Reader | Limitation                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| local  | Cannot read a photograph or a scanned PDF: there is no OCR engine on the box.                                                                                                                                                                                                                                                                                                      |
| local  | Decodes fonts only through their `/ToUnicode` map (browser and Word PDFs ship one; pages, object streams and form XObjects are walked for it). A font with no map is reported as "no text", never as nonsense — `looksLikeProse` in `pdf-text.ts` is that guard.                                                                                                                   |
| local  | Devanagari is drawn, not typed, in order. Drawn-order ि is moved back after its consonant; a line with an unmapped conjunct or reph glyph loses **all** its Hindi words (English kept), so a partial name such as `राम` for `राम शर्मा` is never proposed (`repairDevanagari`).                                                                                                    |
| AI     | A chat-completions endpoint takes images, not PDFs. A text-bearing PDF is read locally and its text sent instead (as a plain-text message, no image part); a **scanned** PDF is refused with `AI_NEEDS_IMAGE`, because rasterising would need a new dependency. The exception is a Gemini / Vertex AI / `googleapis.com` endpoint, which is sent the PDF directly (same 6 MB cap). |
| AI     | Images over 6 MB are refused rather than turned into a request that fails slowly.                                                                                                                                                                                                                                                                                                  |

Every one of these becomes an operator-facing warning under `documents.warnings.*`, in `en` and
`hi`.

## 3. Document classes (§12.2)

`aadhaar_like` · `pan` · `voter_id` · `marksheet_10` · `marksheet_12` · `marksheet_graduation` ·
`caste_certificate` · `income_certificate` · `residence_certificate` · `photo` · `signature` ·
`receipt` · `application_pdf` · `generic` · `unknown`

The list is `DOCUMENT_TYPES` in `packages/core/src/documents/types.ts`, mirrored by the
`documents.document_type` check (0019 added `marksheet_graduation`) and by
`document_drop_files.suggested_document_type`. `photo`, `signature`, `receipt` and
`application_pdf` have empty field allow-lists by design.

Classification is a scored keyword/layout match over the OCR text plus filename hints. `unknown`
is a first-class result — the operator can still attach and label the document by hand.

`marksheet_graduation` is recognised by what only a degree marksheet prints — a spelled-out
degree, "provisional marksheet", "degree examination", `स्नातक` — with "university", "semester",
"SGPA" and "CGPA" as weak signals. "University" alone is deliberately weak: an issuing office or
an address prints it often enough that the word should not decide a class on its own.

### What an unclassified document may yield

Each class has an allow-list of the fields it can legitimately produce
(`FIELDS_BY_DOCUMENT_TYPE`), so a PAN card never yields a district and an income certificate never
yields a Class 10 board. Extracting a field the document cannot contain is how wrong data gets
into a profile.

`unknown` and `generic` are the exception: they get the **whole** dictionary, exactly as pasted
text does (§11). The narrow allow-lists are a statement about a _known_ class; `unknown` makes no
such statement — it says we do not know what is on the page — and a four-field allow-list turned
that admission into silently discarding a mother's name, a gender or a roll number the operator
can see printed in front of them. Nothing is loosened downstream: every field still goes through
the same normalisers, the same safety gate and the same human review.

## 4. Extraction output (§12.4)

```json
{
  "documentType": "income_certificate",
  "provider": "mock",
  "fields": [
    {
      "key": "customer.full_name",
      "label": "Name",
      "value": "Amit Kumar",
      "confidence": 0.98,
      "sourceText": "Name: Amit Kumar",
      "page": 1,
      "bbox": [100, 200, 300, 230],
      "status": "needs_review"
    }
  ],
  "warnings": [
    { "code": "LOW_CONFIDENCE_ADDRESS", "message": "Address could not be extracted confidently." }
  ]
}
```

`status` is one of `needs_review` | `ok`. High-risk keys are always `needs_review` regardless of
confidence.

### Grid rows

Indian certificates are laid out as grids, and one row transcribes as several label/value pairs on
a single line — often with no colon anywhere on it:

```text
Candidate's Name PRITAM KUMAR Father's Name KRISHNA SINGH
```

Read as one pair, the father's name ends up inside the candidate's, which is the most damaging
extraction error there is (§14.4); read by the label/value regex alone, the row yields nothing at
all. `splitMultiLabelLine` splits it — but only once the line has proved twice over that it is a
grid row, because a wrong split files a value under the wrong field:

1. the line must **begin** with a known label (a value that merely contains a label word does
   not, which is what keeps `Address: Near the Government School` in one piece), and
2. it must carry a second label that is more than a stray noun: followed by its own `:` when the
   line punctuates its pairs at all, or — with no punctuation to go on — a label of two or more
   words, one starting a new whitespace column, or a row whose every cell is short enough that it
   can only be a grid.

Every cell of an unpunctuated row must also read as a _value_ rather than a phrase, which is what
stops a heading such as `BOARD OF HIGH SCHOOL AND INTERMEDIATE EDUCATION` from proposing
`Board = OF HIGH`. Words that occur inside the names of institutions — "College", "Degree",
"School", "University", "Board", "State" — may open a line but never start a column part-way
through one, so `College Name Rampur Degree College, Sitapur` keeps its value whole.

A row that proves (1) but not (2) still gives up its first cell, but only where the label/value
regex found nothing, and the cell is cut at the next label rather than swallowing it.

## 5. Normalisation (§12.5)

| Value        | Rule                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates        | parsed from `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, `d MMM yyyy`; stored ISO; displayed `dd/mm/yyyy`                                                                                                                                                                                                                                                         |
| Mobile       | strip separators, drop `+91`/`0` prefix, must be 10 digits starting 6–9                                                                                                                                                                                                                                                                                        |
| PIN          | exactly 6 digits, first digit 1–8                                                                                                                                                                                                                                                                                                                              |
| PAN          | `^[A-Z]{5}[0-9]{4}[A-Z]$` — **format check only, never proof of authenticity**                                                                                                                                                                                                                                                                                 |
| Aadhaar-like | 12 digits. A labelled value (`Aadhaar`, `आधार`, `VID`, …) becomes `customer.aadhaar`, full number. An unlabelled twelve-digit run must also pass the Verhoeff checksum, and becomes `customer.aadhaar` when the class allows it, else `customer.aadhaar_last4` (last four only). `aadhaar_like` allows `customer.aadhaar`; structured mode may emit either key |
| Names        | preserved as printed. Whitespace collapsed. Never title-cased, never transliterated.                                                                                                                                                                                                                                                                           |
| Address      | components extracted **and** the full printed address retained verbatim                                                                                                                                                                                                                                                                                        |

Normalisation never discards the original: `sourceText` always carries what was actually read.

## 6. Confidence and review (§12.6)

- `< 0.70` → low, must be confirmed
- `0.70 – 0.89` → medium, shown in review
- `≥ 0.90` → high, still previewed

Always `needs_review` regardless of confidence: `customer.aadhaar`, `customer.aadhaar_last4`, `customer.pan`,
`customer.bank_account`, `customer.category`, `customer.annual_income`,
`customer.disability_status`, `customer.date_of_birth`.

The review screen shows, per field: detected label, proposed value, confidence, the source
document, and the source text snippet. The operator accepts, edits, or rejects. Accepting writes
to `customers` **and** to `customer_field_values` with status `operator_verified`, plus an audit
entry. Rejecting keeps the extracted value in `customer_field_values` as `rejected` for
traceability but never surfaces it for autofill.

### BharatDoc app documents (migration 0041)

A file a citizen syncs from the BharatDoc app is mirrored into a `documents` row of their app
customer and queued for `ocr.extract` exactly like an upload (`apps/web/lib/citizen/app-customer.ts`).
The app organization has no members, so its extractions are reviewed by the operator holding a
live roaming grant over that customer — on the same review screen and route, which resolve the
document's scope with `apps/web/lib/documents/scope.ts`. Such a review is audited with
`appCustomer: true` and does not spend the centre's `ai_extraction` quota.

### Already matched fields (new document, existing customer)

The extractor always reads the whole document; it is never told what the profile already holds.
After extraction, `apps/web/lib/documents/profile-match.ts` flags each proposed field whose value
equals the customer's current profile value (ignoring only case and whitespace). The review screen
pre-accepts those and shows them in a collapsed **Already matched** section, so the operator only
has to look at new or different values. They can still open the section to edit, reject or undo
any of them.

- Only the `matchesProfile` boolean reaches the client — never the profile value.
- Encrypted fields (PAN, bank account) are never decrypted to compare, so they always go to
  normal review.
- A profile value still marked `extracted` (unverified) never counts as a match.
- Accepting a matched field changes no value. It records the new document as the field's source,
  and the audit entry lists those keys as `matchedKeys`.

## 7. Retention (§12.7)

- Documents are stored only when the operator attaches them to a customer.
- Temporary processing artefacts are deleted at the end of the job.
- Raw OCR text (already Aadhaar-masked, capped at 20 000 chars) is retained only while the
  extraction is unreviewed; `POST /api/documents/:id/review` sets `raw_text` to null. Field
  source snippets survive in `extracted_fields`.
- There is one `document_extractions` row per document (0013); a retry upserts over it.
- Org-level retention setting is meant to drive the `retention.sweep` job, which has no handler
  yet.
- Delete controls exist at document, customer and organization level.

## 8. Fixtures and golden tests (§23.1)

`packages/ai/src/fixtures.ts` holds the fake documents and their expected extraction output.
Every fixture is stamped **DEMO ONLY — NOT A VALID DOCUMENT** and uses the reserved fake ranges
from `docs/DATABASE.md` §7. Golden tests in `pipeline.test.ts` assert classification, extracted
keys, values and review status.

The Aadhaar-like fixture deliberately **fails** the Verhoeff checksum. It is Aadhaar-shaped, so
it exercises the extractor and the masking path, but it can never collide with a real allocated
number — which a checksum-valid twelve-digit number could.

No real document is ever committed, in any form, including cropped or redacted.

## 9. Where the Aadhaar rule is enforced

`packages/ai/src/safety.ts` is the single gate. Every extracted field, every source snippet and
the retained raw text pass through it before anything is persisted:

- `customer.aadhaar` is the one deliberate exception — its value (reduced to its last twelve
  digits) and source snippet both survive, since the product now stores and uses the full number
  (migration 0026; before it, structured mode refused this key and the label rule produced
  `aadhaar_last4`),
- `customer.aadhaar_last4` is reduced to four digits whatever the extractor produced,
- every other field, and all raw OCR retention, still has any twelve-digit Aadhaar-like run
  masked to `XXXX XXXX 1234` — deliberately broader than the Verhoeff check, because a misread
  Aadhaar is still an Aadhaar that must not leak into an unrelated field or the logs.

`safety.test.ts` is a regression suite for a product rule, not an implementation detail
(docs/DEVELOPMENT_RULES.md §1 rule 5). Do not weaken it.

## 10. Running the pipeline

Extraction is a background job, and the job is what owns the retry policy:

```text
POST /api/documents/upload-intent   → row reserved, one-time signed upload URL returned
PUT  <signed upload url>            → bytes go browser → storage, never through a route handler
POST /api/documents/:id/process     → magic bytes sniffed server-side, then `ocr.extract` queued
                                      …then run inline (see below)
                                      (`storeOnly`: sniffed, then marked `stored`; nothing queued)
POST /api/jobs/run                  → scheduler claims due jobs and runs this pipeline
GET  /api/documents/:id/extraction  → the review payload
POST /api/documents/:id/review      → the human gate; the only path into a customer profile
```

A walk-in drop saved to a local customer (`POST /api/document-drop/sessions/:id/convert`,
`target: 'local'`) promotes each staged file into `documents` and queues `ocr.extract` for it the
same way; the citizen's caption or tapped button is only a `suggested_document_type` hint, and
classification still runs. A save to a roaming customer's home organization queues nothing —
the visiting operator could not read `document_extractions` anyway.

### Who actually runs the job

A queue with no worker is a document that says "Reading" forever, so there are two entry points
into the same execution path (`apps/web/lib/jobs/runner.ts`):

| Entry point      | Claims via           | Scope                                         |
| ---------------- | -------------------- | --------------------------------------------- |
| `runDocumentJob` | `claim_document_job` | only the job for the document being processed |
| `runPendingJobs` | `claim_jobs`         | whatever is due, across organizations         |

`POST /api/documents/:id/process` calls the first one **in-request**, controlled by
`JOB_INLINE_RUNNER` (`on` by default). It claims by document rather than draining the queue, so
one tenant's upload never waits on another tenant's work. Nothing about the inline run is allowed
to fail the request: the job row is the source of truth, so a missing migration, a provider
outage or a lease race leaves the work queued and the response saying `processing`.

This also unsticks a document that was queued when no worker existed. Pressing **Read again** is
deduplicated by `enqueue_job` — correctly, the work is already queued — and `claim_document_job`
finds that pending job and runs it, rewriting its `extractionMode` if the operator chose a new
one. That rewrite happens inside the claim, so the scheduler cannot pick the job up in between.

Set `JOB_INLINE_RUNNER=off` when a scheduler owns the queue and upload requests should stay fast.

`/api/jobs/run` uses the service-role client, so it is gated on `JOB_RUNNER_SECRET` and **fails
closed**: with the secret unset it refuses every request rather than running unauthenticated
work. Point a scheduler at it — it is still what runs the **retry/backoff** path in
`complete_job`, which the inline runner does not cover on its own.

---

## 11. Pasted text

An operator often already has a customer's details as text — copied out of a portal, an email, a
spreadsheet or a message. Retyping it is the slow step the product exists to remove, so pasted
text gets the same treatment a document gets, minus the two steps that only apply to a scan:

```text
paste
  → line splitting            (packages/ai/src/text.ts)
  → field extraction          (the same LABEL_RULES dictionary)
  → validation + normalisation
  → confidence scoring
  → human review              ← nothing reaches the profile before this
  → customer profile update
  → audit log
```

There is no OCR and no classification. The operator chose the text, so there is no scan quality
to discount — block confidence is 1.0 and the score reflects label quality alone — and there is
no document class to guess, so the **whole** dictionary is in scope
(`ALL_EXTRACTABLE_FIELD_KEYS`) rather than one class's fields. Restricting pasted text to
`FIELDS_BY_DOCUMENT_TYPE.generic` would silently drop fields the operator deliberately typed.

The splitter handles the shapes real pastes arrive in:

| Shape                                      | Handling                                                         |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `Label: Value` per line                    | as-is                                                            |
| `Label = Value`                            | `=` accepted alongside `:`, `  `, `-`                            |
| `A: 1, B: 2, C: 3` on one line             | split at a separator **only** when a new `label:` follows        |
| `Address: H.No 12, Rampur, Ghazipur`       | not split — the lookahead needs a label, so the address survives |
| `Father's Name` / `Ram Kumar` on two lines | paired, but only if line 1 is a known label and line 2 is not    |

Two things are deliberately different from the document path:

1. **Nothing is persisted at parse time.** A document keeps its raw text until review because
   the reviewer needs to check the extractor against the page. Pasted text is already in front
   of the operator, so a second copy would be retention with no purpose (§7). There is no row,
   no file and no `document_extractions` record; the text lives in the request and the browser
   tab only.
2. **The write route re-validates every value.** Because nothing was stored, the accepted values
   arrive from the client. `POST /api/customers/:id/values` therefore checks each key against
   the field registry and runs every value through `sanitizeExtractedFields` (§9) before
   writing, so a full Aadhaar cannot be smuggled in under an unrelated key.

```text
POST /api/customers/parse-text     → proposed fields; stores nothing
POST /api/customers/:id/values     → the human gate; the only path into a customer profile
```

Accepting writes to `customers` **and** `customer_field_values` with status
`operator_verified` and `source_document_id = null`, exactly as document review does — which
is what makes the values available to the form engine for autofill (§14).
