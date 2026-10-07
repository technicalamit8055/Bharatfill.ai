-- =============================================================================
-- 0034  `stored` document status
-- Master spec §12.4; docs/AI_PIPELINE.md §2
--
-- A photograph or a signature has nothing to read — it is the value itself. When the operator
-- uploads one as such, `POST /api/documents/:id/process` still sniffs the bytes, then keeps the
-- file without queueing `ocr.extract`. No existing status says that honestly: `extracted` claims
-- a read that never happened, and `uploaded` is what the upload panels poll on as "a job is still
-- coming".
--
-- Same shape as 0019: the column keeps a text check mirroring `DOCUMENT_STATUSES` in
-- packages/core/src/documents/types.ts. The constraint was declared inline in 0004, so it carries
-- Postgres's default name.
-- =============================================================================

alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('uploaded', 'processing', 'extracted', 'review_required', 'verified',
                    'stored', 'failed', 'deleted'));
