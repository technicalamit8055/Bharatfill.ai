-- =============================================================================
-- 0047  A centre adds a document for a BharatDoc app customer
-- Migrations 0038 (citizen vault), 0041 (app customers); docs/VAULT_BRIDGE_DESIGN.md §17
--
-- Product owner, 2026-11-23: an operator holding a live grant over an app customer may upload a
-- document for them, as for their own customers. The file lands in two places:
--
--   * `documents`, in the BharatDoc app organization, read by the usual pipeline (0041). Written
--     by the server on the service role after it has re-proved the grant; no write policy is
--     added for grant holders.
--   * the citizen's cloud vault, sealed on the server with the citizen's document key, so the
--     phone pulls it in and both sides show the same set. `mirror_document_id` already links the
--     two, so rename, retype and delete from the app follow through exactly as for a phone sync.
--
-- 1. `citizen_vault_documents.added_by_organization_id` / `added_by_centre_name`: who added it.
--    The name is kept as it was when added, so the phone can say "Added by <centre>" without
--    reading `organizations`, and the label survives the centre renaming itself. Null on every
--    document the citizen synced from the phone.
-- 2. `vault_access_events.action` gains 'added', so the citizen's access history shows it.
-- =============================================================================

alter table public.citizen_vault_documents
  add column if not exists added_by_organization_id uuid
    references public.organizations (id) on delete set null,
  add column if not exists added_by_centre_name text
    check (added_by_centre_name is null or char_length(btrim(added_by_centre_name)) between 1 and 160);

comment on column public.citizen_vault_documents.added_by_organization_id is
  'The centre that uploaded this document for the citizen under a live grant (0047). Null when the phone synced it.';
comment on column public.citizen_vault_documents.added_by_centre_name is
  'That centre''s name when it added the document, shown in the app (0047).';

alter table public.vault_access_events
  drop constraint if exists vault_access_events_action_check;
alter table public.vault_access_events
  add constraint vault_access_events_action_check
  check (action in (
    'granted', 'listed', 'viewed', 'attached', 'copied', 'ended',
    'restored', 'restore_refused', 'pin_changed', 'added'));
