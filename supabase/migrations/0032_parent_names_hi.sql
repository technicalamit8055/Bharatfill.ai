-- =============================================================================
-- 0032  Hindi spellings of the parents' names
-- Master spec §11; docs/FORM_ENGINE.md §7a
--
-- `father_name` and `mother_name` hold the English spelling — the one central portals (SSC OTR,
-- banks, UPSC) accept and the one printed on the matriculation certificate. These hold the
-- Devanagari spelling for portals that ask for it, the same way `full_name_hi` sits beside
-- `full_name`. Neither is a new kind of data: it is the same name the profile already stores, in
-- the other script, so the RLS policies and retention rules on `customers` already cover it.
--
-- No backfill. A profile that saved a Hindi spelling in `father_name` keeps it there; the mapper
-- reads either column as the other's fallback, and the operator moves it when they next edit.
-- =============================================================================

alter table public.customers
  add column if not exists father_name_hi text,
  add column if not exists mother_name_hi text;

comment on column public.customers.father_name_hi is
  'Father''s name in Devanagari. father_name holds the English spelling.';
comment on column public.customers.mother_name_hi is
  'Mother''s name in Devanagari. mother_name holds the English spelling.';
