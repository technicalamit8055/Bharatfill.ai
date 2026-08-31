-- =============================================================================
-- 0019  Graduation marksheet document class
-- Master spec §12.2; docs/AI_PIPELINE.md §3
--
-- Degree and university marksheets were landing on `unknown`, which put only the universal
-- fields in scope and threw away the roll number, registration number, college, course and
-- result the operator actually needed. `marksheet_graduation` gives them a first-class class,
-- and the extractor a field allow-list to match (packages/ai/src/rules.ts).
--
-- The column keeps its check constraint rather than moving to an enum: `DOCUMENT_TYPES` in
-- packages/core/src/documents/types.ts is the source of truth, and a text check is what the
-- rest of this schema uses (0004).
-- =============================================================================

alter table public.documents
  drop constraint if exists documents_document_type_check;

alter table public.documents
  add constraint documents_document_type_check
  check (document_type in (
    'aadhaar_like', 'pan', 'voter_id', 'marksheet_10', 'marksheet_12', 'marksheet_graduation',
    'caste_certificate', 'income_certificate', 'residence_certificate',
    'photo', 'signature', 'receipt', 'application_pdf', 'generic', 'unknown'));
