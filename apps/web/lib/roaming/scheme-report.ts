import 'server-only';

import type { CustomerRow, Json, RoamingCustomerCardRow } from '../supabase/database.types';

/**
 * Reassembles a `CustomerRow`-shaped object from a masked roaming row, for the one caller that
 * still needs the field registry's full walk: `buildCustomerSchemeReport`
 * (apps/web/lib/schemes/service.ts). That function is unchanged and reused as-is — the scheme
 * evaluator already carries no PII further than a first name (§14.6) — so a roaming pre-auth
 * page gets exactly the same eligibility engine and pitch scripts as a home-centre customer,
 * built from data the visiting operator did not need consent to see (the schemes widget is
 * explicitly the part of this feature that stays open before consent).
 *
 * This is not a `CustomerRow` read from the database — it is a projection re-shaped to fit a
 * function that expects one. Fields the roaming row does not carry (`full_name_hi`, address
 * detail beyond state/district, banking, notes) are left `null`, which the field registry
 * already treats as "not on file".
 */
export function customerRowFromRoamingCard(row: RoamingCustomerCardRow): CustomerRow {
  const now = row.created_at ?? new Date().toISOString();
  return {
    id: row.customer_id,
    organization_id: row.home_organization_id,
    customer_code: '',
    full_name: row.full_name,
    full_name_hi: null,
    mobile: row.mobile,
    mobile_alt: null,
    email: null,
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    marital_status: null,
    category: row.category,
    father_name: null,
    father_name_hi: null,
    mother_name: null,
    mother_name_hi: null,
    spouse_name: null,
    guardian_name: null,
    // Only the state/district the roaming projection already resolved server-side — enough for
    // the domicile-restricted schemes, nothing more precise than the masked card itself shows.
    address_json: {
      current: { state: row.state, district: row.district },
      permanent: { state: row.state, district: row.district },
    } as unknown as Json,
    identity_summary_json: row.identity_summary_json,
    education_json: row.education_json,
    certificates_json: row.certificates_json,
    notes: null,
    verification_status: row.verification_status,
    assigned_to: null,
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    mobile_normalized: null,
  };
}
