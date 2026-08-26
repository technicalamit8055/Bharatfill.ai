-- =============================================================================
-- 0016  Prepared files count towards the storage entitlement
-- Master spec §13 (document tools), §22.3 (limits enforced server-side)
--
-- Phase 6 turns on the document tools, which means `document_derivatives` starts holding real
-- objects in the `prepared-files` bucket. Those bytes occupy the same Supabase project as the
-- source documents and cost the same money, but `storage_used_bytes` — written in 0013, when
-- nothing wrote derivatives — only counted `documents`.
--
-- Left alone, an organization on a 500 MB plan could park unlimited prepared files: a
-- 16-photo A4 sheet at 300 DPI is a couple of megabytes, and an operator generates several per
-- customer. An entitlement that silently stops applying is a billing bug nobody finds.
--
-- Derivatives are hard-deleted (there is no `deleted_at` on the table), so unlike documents
-- there is no soft-delete to exclude: a row present means bytes present.
-- =============================================================================

create or replace function public.storage_used_bytes(org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  -- The membership check gates the whole total, and is the reason this is `security definer`:
  -- the function reads every row of two tenant tables to return one number, so it has to prove
  -- the caller belongs to the organization it is being asked about.
  select case
    when public.is_org_member(org) then
      coalesce((
        select sum(d.size_bytes)
        from public.documents d
        where d.organization_id = org
          and d.deleted_at is null
      ), 0)
      + coalesce((
        select sum(v.size_bytes)
        from public.document_derivatives v
        where v.organization_id = org
      ), 0)
    else 0
  end::bigint;
$$;

revoke execute on function public.storage_used_bytes(uuid) from public;
grant execute on function public.storage_used_bytes(uuid) to authenticated, service_role;
