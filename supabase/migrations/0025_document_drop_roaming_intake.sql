-- =============================================================================
-- 0025 — saving a walk-in drop onto a roaming customer
--
-- Master spec §9.1 (walk-in intake), §19.3 (private storage); docs/SECURITY.md §2 (roaming).
--
-- The gap this closes. Migration 0024 let a visiting operator holding a live, OTP-consented
-- grant *read* a roaming citizen's profile and files. It deliberately did not let them write
-- one, because at the time nothing needed to: a visiting centre filled a form from documents
-- that already existed.
--
-- Walk-in drop changes that. The citizen standing at a visiting counter hands over a fresh
-- document, and the only useful place for it is their own record at their home centre — so it
-- is there the next time they walk into either centre. Staging it at the visiting centre
-- instead would fork the citizen's file across two organizations, which is the outcome the
-- roaming design exists to avoid.
--
-- The shape of the permission, and why each half is needed:
--
--   * `organization_id` on the new row must be the customer's HOME organization, not the
--     caller's. The document belongs to the citizen's file. `has_org_role` therefore cannot be
--     the test — the caller has no role there at all — so the grant is the whole authority, and
--     the `organization_id = customers.organization_id` equality is what stops that authority
--     from being used to write a row into any *other* organization.
--   * `uploaded_by` must be the caller. A grant names one user (0024), so the row records which
--     human acted, in an organization they are not a member of. `audit_logs` carries the same
--     fact; this makes it legible on the document itself.
--   * INSERT only. No update, no delete. A visiting operator may add to the citizen's file and
--     may not alter or remove what the home centre holds — the same asymmetry 0024 struck for
--     reads, applied to writes.
--
-- Nothing here widens what a *bookmark* can do: `has_active_customer_grant` is unchanged, so a
-- centre that has merely looked the citizen up still writes nothing until the citizen consents
-- to an OTP and that consent is still live.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- documents — the insert path for a grant holder
--
-- Replaces 0010's org-role-only policy with the same test plus the roaming clause. The org-role
-- arm is copied verbatim so ordinary intake is untouched.
-- -----------------------------------------------------------------------------
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'manager', 'operator'])
    or (
      customer_id is not null
      and public.has_active_customer_grant(customer_id)
      -- The row must land in the customer's own centre, written by the grant holder themselves.
      and uploaded_by = auth.uid()
      and exists (
        select 1
        from public.customers c
        where c.id = documents.customer_id
          and c.organization_id = documents.organization_id
          and c.deleted_at is null
      )
    )
  );

comment on policy documents_insert on public.documents is
  'Home-centre roles, or a live roaming grant holder writing into the customer''s own organization (0025).';

-- -----------------------------------------------------------------------------
-- storage — the bytes behind that insert
--
-- The document row points at an object under `org/<home org>/...`, and 0010's write policy asks
-- whether the caller is a member of the organization in the path. A visiting operator is not,
-- so without this the row would insert and the copy would fail.
--
-- The object path is not yet claimed by any `documents` row at the moment of the copy — the row
-- is inserted after the bytes land — so this policy cannot look the object up the way the 0024
-- read policy does. It authorises on the path itself instead, and `documentStoragePath` in
-- packages/core makes that precise. A customer document is written to
--
--     org/<home org id>/customer/<customer id>/<document id>/<filename>
--
-- so this requires the caller to hold a live grant over the customer named in segment 4, and
-- that customer to live in the organization named in segment 2. The reachable set is exactly
-- the folder of one citizen who has consented — not the home centre's bucket at large.
-- `split_part` rather than `storage.foldername`, to match `org_id_from_storage_path` in 0010.
-- -----------------------------------------------------------------------------
create policy "assistigo roaming documents write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and split_part(storage.objects.name, '/', 3) = 'customer'
    and exists (
      select 1
      from public.customers c
      where c.id::text = split_part(storage.objects.name, '/', 4)
        and c.organization_id = public.org_id_from_storage_path(storage.objects.name)
        and c.deleted_at is null
        and public.has_active_customer_grant(c.id)
    )
  );

comment on policy "assistigo roaming documents write" on storage.objects is
  'A live roaming grant holder may add bytes under the consenting customer''s own folder (0025). Read stays governed by the 0024 policy; delete is never granted.';
