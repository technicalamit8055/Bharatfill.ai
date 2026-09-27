-- =============================================================================
-- 0028  Scheme artwork: banner and illustration
-- docs/DATABASE.md (schemes_catalog); docs/SECURITY.md §storage
--
-- Two more optional images per catalogue row, for the scheme detail page: a wide banner behind
-- the hero, and an illustration beside "What the customer gets". They follow 0027's logo rules
-- exactly — a *storage path* in the same private `scheme-logos` bucket, never a URL, pinned to
-- the one shape the upload action builds: `<slug>/<uuid>.<ext>`.
--
-- Same bucket rather than a new one: the serving route, the "no storage policies" posture and
-- the RLS test that proves it all carry over unchanged, and a second bucket would be a second
-- place for that posture to drift.
--
-- No personal data. These are reference imagery, like the rest of this table.
-- =============================================================================

alter table public.schemes_catalog
  add column banner_path text
    constraint schemes_catalog_banner_path_shape
      check (banner_path is null
             or banner_path ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'),
  add column illustration_path text
    constraint schemes_catalog_illustration_path_shape
      check (illustration_path is null
             or illustration_path ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$');

comment on column public.schemes_catalog.banner_path is
  'Object path in the private scheme-logos bucket (<slug>/<uuid>.<ext>) for the detail-page hero banner, or null. Never a URL.';
comment on column public.schemes_catalog.illustration_path is
  'Object path in the private scheme-logos bucket (<slug>/<uuid>.<ext>) for the detail-page benefit illustration, or null. Never a URL.';

-- A banner is drawn ~760px wide on a retina screen, which a 256 KB logo limit cannot hold.
-- 1 MB is the bucket ceiling; the app keeps a tighter limit per kind (logo 256 KB, illustration
-- 512 KB) and checks it first for a readable error.
update storage.buckets
   set file_size_limit = 1048576
 where id = 'scheme-logos';
