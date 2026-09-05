-- =============================================================================
-- 0026  Allow full Aadhaar storage
-- Product decision (docs/DEVELOPMENT_RULES.md §1 rule 5): the last-four-only default and the
-- legal-review-gated org flag are lifted. The full 12-digit Aadhaar number may now be stored in
-- identity_summary_json.aadhaar, alongside identity_summary_json.aadhaar_last4. The field stays
-- high-risk (always reviewed, masked on display with audited reveal) and is still never logged,
-- searched, or indexed.
-- =============================================================================

-- The trigger from 0003_customers.sql rejected any twelve-digit value under
-- identity_summary_json.aadhaar. Replace it with one that only keeps the aadhaar_last4 format
-- check, which is an unrelated data-integrity guard, not a policy gate.
create or replace function public.reject_full_aadhaar()
returns trigger
language plpgsql
as $$
begin
  if (new.identity_summary_json ->> 'aadhaar_last4') is not null
     and (new.identity_summary_json ->> 'aadhaar_last4') !~ '^[0-9]{4}$' then
    raise exception 'ASSISTIGO_INVALID_AADHAAR_LAST4: expected exactly four digits'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- organizations.settings.allow_full_aadhaar is no longer read anywhere in the app — full Aadhaar
-- storage is now the product default for every organization, not a per-org opt-in — but the key
-- stays for now so a future re-introduction of per-org control has somewhere to land.
alter table public.organizations
  alter column settings set default jsonb_build_object(
    'ai_processing_enabled', false,
    'allow_full_aadhaar', true,
    'retention', 'keep',
    'overwrite_filled_fields', false
  );

update public.organizations
   set settings = jsonb_set(settings, '{allow_full_aadhaar}', 'true')
 where settings ->> 'allow_full_aadhaar' = 'false';

comment on column public.organizations.settings is
  'allow_full_aadhaar is currently unused by the app — full Aadhaar storage is unconditional. Kept for a possible future per-org control.';
