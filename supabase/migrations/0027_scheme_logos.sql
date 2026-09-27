-- =============================================================================
-- 0027  Scheme logos
-- docs/DATABASE.md (schemes_catalog); docs/SECURITY.md §storage
--
-- An optional logo per catalogue row, shown on the scheme cards in the hub.
--
-- The column holds a *storage path* inside the `scheme-logos` bucket, never a URL. A free URL
-- would let a catalogue row point every operator's browser at a third-party host — leaking their
-- IP and user agent to whoever runs it, and serving whatever that host decides to serve that day.
-- A path can only name bytes a platform admin uploaded, and the check below pins its shape to the
-- one the upload action builds: `<slug>/<uuid>.<ext>`.
--
-- The bucket is private, like every other bucket (docs/SECURITY.md: "no public bucket"). Logos
-- are served to signed-in users by the app's /scheme-logos route, which reads them with the
-- service role. There are deliberately no storage.objects policies for it: tenants can neither
-- read the bucket directly nor write to it, and platform uploads go through the service role.
--
-- No personal data. Logos are reference imagery, like the rest of this table.
-- =============================================================================

alter table public.schemes_catalog
  add column logo_path text
    constraint schemes_catalog_logo_path_shape
      check (logo_path is null
             or logo_path ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$');

comment on column public.schemes_catalog.logo_path is
  'Object path in the private scheme-logos bucket (<slug>/<uuid>.<ext>), or null for the category icon. Never a URL.';

-- 256 KB is generous for a logo drawn at 48px. SVG is excluded on purpose: it is a document that
-- can carry script, and a logo has no need to be one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scheme-logos', 'scheme-logos', false, 262144,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
