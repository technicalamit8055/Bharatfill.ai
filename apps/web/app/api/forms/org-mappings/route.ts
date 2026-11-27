import { z } from 'zod';
import { isCustomerFieldKey, validationFailed } from '@assistigo/core';
import {
  buildMappingContribution,
  defaultTransformFor,
  detectedFieldSchema,
  pageContextSchema,
  unteachableReason,
} from '@assistigo/form-engine';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { logger } from '@/lib/api/logger';

/*
 * The box's own metadata, as the extension already sends it to /api/forms/map. `nearbyText` is
 * part of the safety check below but is never stored or shared.
 */
const bodySchema = z.object({
  page: pageContextSchema.pick({ origin: true, path: true }),
  field: detectedFieldSchema.pick({
    signature: true,
    tagName: true,
    inputType: true,
    name: true,
    id: true,
    placeholder: true,
    labelText: true,
    ariaLabel: true,
    nearbyText: true,
    sectionHeading: true,
    maxLength: true,
  }),
  customerField: z.string().max(120),
  /** Share the portal's side of this mapping with Bharatfill for review (§9.6). */
  share: z.boolean(),
});

/**
 * POST /api/forms/org-mappings — an operator teaches the engine one box on one portal.
 *
 * Saved as this centre's override (§14.3 priority 2), so the next mapping of the page uses it.
 * With `share`, the portal metadata — never a customer value — also goes to the review queue in
 * /admin, where an approved mapping becomes an adapter field for every centre
 * (docs/FORM_ENGINE.md §6c).
 */
export const POST = handler('api.forms.org_mappings.create', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'fill.run');

  const { page, field, customerField, share } = await parseBody(request, bodySchema);

  if (!isCustomerFieldKey(customerField)) {
    throw validationFailed({ customerField: 'unknown_field' });
  }

  // A CAPTCHA, OTP, payment or submit control can never be taught — not even by a modified
  // client (§14.8). Same classifier the mapper runs first.
  const unteachable = unteachableReason(field);
  if (unteachable) throw validationFailed({ field: unteachable });

  const transform = defaultTransformFor(customerField, field.inputType) ?? null;

  const { error: overrideError } = await context.supabase.from('org_field_mappings').upsert(
    {
      organization_id: context.organization.id,
      page_origin: page.origin,
      field_signature: field.signature,
      customer_field: customerField,
      transform,
      created_by: context.userId,
    },
    { onConflict: 'organization_id,page_origin,field_signature' },
  );
  if (overrideError) throw overrideError;

  let shared = false;
  if (share) {
    const contribution = buildMappingContribution(field, page, customerField);
    if (contribution) {
      const { data: existing, error: existingError } = await context.supabase
        .from('mapping_contributions')
        .select('id, customer_field, status')
        .eq('organization_id', context.organization.id)
        .eq('page_origin', contribution.pageOrigin)
        .eq('field_signature', contribution.fieldSignature)
        .maybeSingle();
      if (existingError) throw existingError;

      const unchanged =
        existing &&
        existing.customer_field === customerField &&
        existing.status !== 'rejected';

      if (unchanged) {
        shared = true;
      } else {
        const { error } = await context.supabase.from('mapping_contributions').upsert(
          {
            organization_id: context.organization.id,
            page_origin: contribution.pageOrigin,
            path_pattern: contribution.pathPattern,
            field_signature: contribution.fieldSignature,
            tag_name: contribution.tagName,
            input_type: contribution.inputType,
            label_text: contribution.labelText,
            aria_label: contribution.ariaLabel,
            placeholder: contribution.placeholder,
            section_heading: contribution.sectionHeading,
            name_attribute: contribution.nameAttribute,
            id_attribute: contribution.idAttribute,
            customer_field: contribution.customerField,
            // A changed answer goes back to the queue, whatever it was before.
            status: 'pending',
            portal_adapter_id: null,
            reviewed_by: null,
            reviewed_at: null,
            created_by: context.userId,
          },
          { onConflict: 'organization_id,page_origin,field_signature' },
        );
        // The override is already saved and is what the operator needs right now; a failed share
        // is reported back rather than failing the whole request.
        if (error) {
          logger.error('forms.contribution_failed', { code: error.code });
        } else {
          shared = true;
        }
      }
    }
  }

  await writeAuditLog(context, {
    action: 'field_mapping.taught',
    entityType: 'org_field_mapping',
    metadata: { pageOrigin: page.origin, customerField, shared },
  });

  return ok({ mapping: { customerField, transform }, shared });
});
