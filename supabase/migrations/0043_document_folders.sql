-- =============================================================================
-- 0043  Document folders
-- docs/VAULT_BRIDGE_DESIGN.md §13; CITIZEN_MOBILE_APP_SPEC.md §3 Feature 2; migration 0041
--
-- The customer's Documents tab on the dashboard is laid out in the same folders as the BharatDoc
-- app vault: Identity, Education, Certificates, Photo & signature, Other. A document's folder is
-- normally the one its type belongs to (`documentFolder` in @assistigo/core), so nothing needs
-- storing for an operator's upload.
--
-- The exception is the app: a citizen can file a document in a folder other than its type's
-- (an Aadhaar kept under Certificates). That choice syncs to `citizen_vault_documents.category`
-- (0038) and is carried onto the customer-side copy (0041) here, so the operator sees the
-- document where the citizen put it.
--
-- Null = follow the type. Same text-check style as `document_type` (0019); the values mirror
-- `DOCUMENT_FOLDERS` in packages/core/src/citizen-vault/types.ts. Not sensitive: a section name.
-- =============================================================================

alter table public.documents
  add column if not exists folder text
    check (folder in ('identity', 'academic', 'certificate', 'form_asset', 'other'));

comment on column public.documents.folder is
  'Folder the document was filed in (a BharatDoc app citizen''s choice). Null: the folder of its document_type (0043).';
