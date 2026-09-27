import { z } from 'zod';

/**
 * The "Details" column of a customer's activity log.
 *
 * Built only from what `writeAuditLog` already records for these actions — which fields were
 * touched, never what was in them (docs/SECURITY.md §4). A field key is turned into its label so
 * an operator reads "Category revealed", not `customer.category`; nothing here can surface a
 * value, because the audit metadata never holds one.
 *
 * Returns a translation key and its values, or `null` when there is nothing worth saying beyond
 * the action's own label.
 */

export type ActivityDetail = { key: string; values?: Record<string, string | number> };

const createdMetadata = z
  .object({ source: z.string().optional(), hasDocumentSource: z.boolean().optional() })
  .passthrough();

const updatedMetadata = z
  .object({
    // `POST /api/customers/:id/values` (paste review and the profile edit form).
    acceptedKeys: z.array(z.string()).optional(),
    // `PATCH /api/customers/:id`.
    fields: z.array(z.string()).optional(),
  })
  .passthrough();

const revealedMetadata = z.object({ fieldKey: z.string() }).passthrough();

export function activityDetail(
  action: string,
  metadata: unknown,
  labelFor: (fieldKey: string) => string | null,
): ActivityDetail | null {
  switch (action) {
    case 'customer.created': {
      const parsed = createdMetadata.safeParse(metadata);
      const fromDocument =
        parsed.success &&
        (parsed.data.source === 'document_drop' || parsed.data.hasDocumentSource === true);
      return { key: fromDocument ? 'customers.activity.createdFromDocument' : 'customers.activity.created' };
    }
    case 'customer.updated': {
      const parsed = updatedMetadata.safeParse(metadata);
      const count = parsed.success
        ? (parsed.data.acceptedKeys ?? parsed.data.fields ?? []).length
        : 0;
      if (count === 0) return { key: 'customers.activity.updated' };
      return {
        key: count === 1 ? 'customers.activity.updatedField' : 'customers.activity.updatedFields',
        values: { count },
      };
    }
    case 'customer.sensitive_revealed': {
      const parsed = revealedMetadata.safeParse(metadata);
      const label = parsed.success ? labelFor(parsed.data.fieldKey) : null;
      return label
        ? { key: 'customers.activity.revealedField', values: { field: label } }
        : { key: 'customers.activity.revealed' };
    }
    default:
      return null;
  }
}
