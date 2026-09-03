import 'server-only';

import {
  ageFromDateOfBirth,
  availableDocumentsFromValues,
  educationLevelFromValues,
  maskLast4,
  maskShortName,
  type RoamingCustomerCard,
} from '@assistigo/core';
import { customerValuesFromRow } from '../customers/values';
import type { CustomerRow, RoamingCustomerCardRow } from '../supabase/database.types';

/**
 * Builds the masked pre-auth card from a `roaming_customer_search` / `roaming_customer_card`
 * row (migration 0024).
 *
 * Reuses the same field-registry walk (`customerValuesFromRow`) and the same pure evaluator
 * helpers the scheme matcher uses (`availableDocumentsFromValues`, `educationLevelFromValues`) —
 * the "which document kinds are on file" question is identical whether it is being asked to
 * pitch a scheme or to fill in a pre-auth card, so it is answered once. The fabricated row below
 * carries only the JSON columns those helpers read; every other `CustomerRow` field is absent,
 * which is safe because nothing here asks for a name, a mobile or an address through that path —
 * those come from the row's own dedicated columns, already resolved server-side.
 */
export function buildRoamingCard(row: RoamingCustomerCardRow): RoamingCustomerCard {
  const projectable = {
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    category: row.category,
    education_json: row.education_json,
    certificates_json: row.certificates_json,
    identity_summary_json: row.identity_summary_json,
  } as unknown as CustomerRow;

  const values = customerValuesFromRow(projectable);

  return {
    customerId: row.customer_id,
    displayName: maskShortName(row.full_name) ?? 'Customer',
    mobileLast4: maskLast4(row.mobile),
    ageYears: ageFromDateOfBirth(row.date_of_birth),
    gender: row.gender,
    category: row.category,
    state: row.state,
    district: row.district,
    educationLevel: educationLevelFromValues(values),
    documentsOnFile: [...availableDocumentsFromValues(values)],
    verificationStatus: row.verification_status,
    isLinked: row.is_linked ?? false,
  };
}
