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

| Slot      | Env              | Provider    | Use                                                        | Status             |
| --------- | ---------------- | ----------- | ---------------------------------------------------------- | ------------------ |
| local     | `OCR_PROVIDER`   | `local`     | embedded PDF text + text uploads, in-process               | **default**        |
| local     | `OCR_PROVIDER`   | `mock`      | tests, CI, demo seed. Deterministic output from fixtures.  | tests only         |
| local     | `OCR_PROVIDER`   | `tesseract` | cheap local OCR for simple scans                           | not implemented    |
| AI vision | `OCR_AI_PROVIDER`| `deepseek`  | hosted vision model for photos and difficult layouts       | **off by default** |
| AI vision | `OCR_AI_PROVIDER`| `anthropic` | ditto                                                      | not implemented    |

The product is never hard-coded to one provider. `deepseek` speaks the OpenAI chat-completions
shape, so `OCR_AI_BASE_URL` and `OCR_AI_MODEL` repoint it at any compatible endpoint — another
hosted vendor, a gateway, or a self-hosted vision model — without a code change.

### The three reading methods

The operator picks one per upload (`extractionMode` on `POST /api/documents/:id/process`, stored
in the job payload). It is a trade-off between speed, cost and privacy, so each option is
labelled with what it costs rather than what it is called.

| Mode     | Behaviour                                                                             |
| -------- | ------------------------------------------------------------------------------------- |
| `non_ai` | Local reader only. **No byte leaves this server** — a guarantee, not a preference.     |
| `ai`     | AI vision reader, subject to the opt-in gate below.                                   |
| `auto`   | Local first; escalates to AI **only** when the local read produced no fields at all.   |

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

Customer data is never used for model training. Only the provider request id is stored for audit,
never the payload. The filename is deliberately **not** transmitted: it routinely carries the
customer's name and adds nothing to a transcription (§19.6).

### The AI reader transcribes; it does not extract

The vision model is asked for the text on the page. Turning that text into `customer.*` fields is
still the rules engine's job (§4). Letting the model emit field keys directly would route
customer data around every guarantee downstream of OCR — the Aadhaar masking gate (§9), the
normalisers (§5), the high-risk review rules (§6) and the golden tests (§8).

### What each reader cannot do

| Reader | Limitation                                                                            |
| ------ | ------------------------------------------------------------------------------------- |
| local  | Cannot read a photograph or a scanned PDF: there is no OCR engine on the box.          |
| local  | Cannot resolve PDF font encodings. A subset/CID font is reported as "no text", never as nonsense — `looksLikeProse` in `pdf-text.ts` is that guard. |
| AI     | A chat-completions endpoint takes images, not PDFs. A text-bearing PDF is read locally and its text sent instead; a **scanned** PDF is refused with `AI_NEEDS_IMAGE`, because rasterising would need a new dependency. |
| AI     | Images over 6 MB are refused rather than turned into a request that fails slowly.      |

Every one of these becomes an operator-facing warning under `documents.warnings.*`, in `en` and
`hi`.

## 3. Document classes (§12.2)

`aadhaar_like` · `pan` · `voter_id` · `marksheet_10` · `marksheet_12` · `caste_certificate` ·
`income_certificate` · `residence_certificate` · `photo` · `signature` · `generic` · `unknown`

Classification is a scored keyword/layout match over the OCR text plus filename hints. `unknown`
is a first-class result — the operator can still attach and label the document by hand.

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

## 5. Normalisation (§12.5)

| Value        | Rule                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Dates        | parsed from `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, `d MMM yyyy`; stored ISO; displayed `dd/mm/yyyy`         |
| Mobile       | strip separators, drop `+91`/`0` prefix, must be 10 digits starting 6–9                                        |
| PIN          | exactly 6 digits, first digit 1–8                                                                              |
| PAN          | `^[A-Z]{5}[0-9]{4}[A-Z]$` — **format check only, never proof of authenticity**                                 |
| Aadhaar-like | 12 digits + Verhoeff checksum used only to decide "looks like an Aadhaar"; **only the last four are retained** |
| Names        | preserved as printed. Whitespace collapsed. Never title-cased, never transliterated.                           |
| Address      | components extracted **and** the full printed address retained verbatim                                        |

Normalisation never discards the original: `sourceText` always carries what was actually read.

## 6. Confidence and review (§12.6)

- `< 0.70` → low, must be confirmed
- `0.70 – 0.89` → medium, shown in review
- `≥ 0.90` → high, still previewed

Always `needs_review` regardless of confidence: `customer.aadhaar_last4`, `customer.pan`,
`customer.bank_account`, `customer.category`, `customer.annual_income`,
`customer.disability_status`, `customer.date_of_birth`.

The review screen shows, per field: detected label, proposed value, confidence, the source
document, and the source text snippet. The operator accepts, edits, or rejects. Accepting writes
to `customers` **and** to `customer_field_values` with status `operator_verified`, plus an audit
entry. Rejecting keeps the extracted value in `customer_field_values` as `rejected` for
traceability but never surfaces it for autofill.

## 7. Retention (§12.7)

- Documents are stored only when the operator attaches them to a customer.
- Temporary processing artefacts are deleted at the end of the job.
- Raw OCR text is retained only while the extraction is unreviewed, then truncated to the matched
  snippets.
- Org-level retention setting drives the `retention.sweep` job.
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

- any twelve-digit run is masked to `XXXX XXXX 1234` — deliberately broader than the Verhoeff
  check, because a misread Aadhaar is still an Aadhaar we must not store,
- `customer.aadhaar_last4` is reduced to four digits whatever the extractor produced,
- a field keyed to a full number (`customer.aadhaar`, `customer.uid`, …) is dropped outright.

`safety.test.ts` is a regression suite for a product rule, not an implementation detail
(docs/DEVELOPMENT_RULES.md §1 rule 5). Do not weaken it.

## 10. Running the pipeline

Extraction is a background job, and the job is what owns the retry policy:

```text
POST /api/documents/upload-intent   → row reserved, one-time signed upload URL returned
PUT  <signed upload url>            → bytes go browser → storage, never through a route handler
POST /api/documents/:id/process     → magic bytes sniffed server-side, then `ocr.extract` queued
                                      …then run inline (see below)
POST /api/jobs/run                  → scheduler claims due jobs and runs this pipeline
GET  /api/documents/:id/extraction  → the review payload
POST /api/documents/:id/review      → the human gate; the only path into a customer profile
```

### Who actually runs the job

A queue with no worker is a document that says "Reading" forever, so there are two entry points
into the same execution path (`apps/web/lib/jobs/runner.ts`):

| Entry point       | Claims via            | Scope                                        |
| ----------------- | --------------------- | -------------------------------------------- |
| `runDocumentJob`  | `claim_document_job`  | only the job for the document being processed |
| `runPendingJobs`  | `claim_jobs`          | whatever is due, across organizations         |

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

| Shape                                       | Handling                                                          |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `Label: Value` per line                     | as-is                                                             |
| `Label = Value`                             | `=` accepted alongside `:`, `  `, ` - `                          |
| `A: 1, B: 2, C: 3` on one line              | split at a separator **only** when a new `label:` follows         |
| `Address: H.No 12, Rampur, Ghazipur`        | not split — the lookahead needs a label, so the address survives   |
| `Father's Name` / `Ram Kumar` on two lines | paired, but only if line 1 is a known label and line 2 is not      |

Two things are deliberately different from the document path:

1. **Nothing is persisted at parse time.** A document keeps its raw text until review because
   the reviewer needs to check the extractor against the page. Pasted text is already in front
   of the operator, so a second copy would be retention with no purpose (§7). There is no row,
   no file and no `document_extractions` record; the text lives in the request and the browser
   tab only.
2. **The write route re-validates every value.** Because nothing was stored, the accepted values
   arrive from the client. `POST /api/customers/:id/values` therefore checks each key against
   the field registry and runs every value through `sanitizeExtractedFields` (§9) before
   writing, so a full Aadhaar cannot be smuggled in under a permitted key.

```text
POST /api/customers/parse-text     → proposed fields; stores nothing
POST /api/customers/:id/values     → the human gate; the only path into a customer profile
```

Accepting writes to `customers` **and** `customer_field_values` with status
`operator_verified` and `source_document_id = null`, exactly as document review does — which
is what makes the values available to the form engine for autofill (§14).
