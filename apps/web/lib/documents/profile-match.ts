import 'server-only';

import type { CustomerRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { customerValuesFromRow, unverifiedFieldKeys, type CustomerValues } from '../customers/values';

/**
 * "Already matched" detection for the document review screen (§9.3).
 *
 * When a new document is uploaded for an existing customer, most of what it says — name, date of
 * birth, father's name — is usually already on the profile. Those fields are flagged here so the
 * review screen can pre-accept them and tuck them into a collapsed section, leaving the operator
 * to look only at what is new or different.
 *
 * Extraction is unchanged: the document is still read in full, and the filtering happens here,
 * after the fact.
 *
 * Three rules keep this from becoming a silent-confirm path:
 *
 *   - only a value that is *equal* to the profile counts — a different value is new data and
 *     goes through normal review, however small the difference,
 *   - encrypted fields (PAN, bank account) are never decrypted to compare, so they never match
 *     and always get a human look (docs/SECURITY.md §4),
 *   - a profile value that is itself still unverified (`extracted`) does not count — a second
 *     document agreeing with an unconfirmed value is not a human confirming it (§14.6).
 *
 * Only the boolean leaves the server. The profile values themselves never reach the review UI.
 */

type FieldValueRow = {
  field_key: string;
  value_text: string | null;
  status: string;
};

/** The comparable, verified values on a customer profile, keyed by `customer.*` field key. */
export function profileValuesForMatching(
  customer: CustomerRow,
  fieldValueRows: readonly FieldValueRow[],
): CustomerValues {
  const values = customerValuesFromRow(customer);

  // Fields stored outside the `customers` row live in `customer_field_values.value_text`, the
  // same merge the customer profile endpoint does. Encrypted rows have no `value_text`.
  for (const row of fieldValueRows) {
    if (row.status !== 'rejected' && row.value_text) values[row.field_key] = row.value_text;
  }

  for (const key of unverifiedFieldKeys(fieldValueRows)) delete values[key];

  return values;
}

/**
 * Loads the profile values for a document's customer, or an empty map when the document is not
 * attached to one. Scoped by organization on top of RLS, like every other read in this flow.
 */
export async function loadProfileValuesForMatching(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  customerId: string | null,
): Promise<CustomerValues> {
  if (!customerId) return {};

  const [{ data: customerRow, error: customerError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('customer_field_values')
        .select('field_key, value_text, status')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId),
    ]);

  if (customerError) throw customerError;
  if (rowsError) throw rowsError;
  if (!customerRow) return {};

  return profileValuesForMatching(customerRow as CustomerRow, (rows ?? []) as FieldValueRow[]);
}

/**
 * Lenient only in ways that cannot change meaning: case and runs of whitespace. Extracted values
 * are already normalised by the pipeline (dates to ISO, mobiles to ten digits), so anything that
 * still differs after this is a real difference the operator should see.
 */
function canonical(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
}

export function matchesProfileValue(extracted: string, existing: string | undefined): boolean {
  if (existing === undefined) return false;
  const a = canonical(extracted);
  return a !== '' && a === canonical(existing);
}

export function markProfileMatches<T extends { key: string; value: string }>(
  fields: readonly T[],
  profileValues: Readonly<CustomerValues>,
): (T & { matchesProfile: boolean })[] {
  return fields.map((field) => ({
    ...field,
    matchesProfile: matchesProfileValue(field.value, profileValues[field.key]),
  }));
}
