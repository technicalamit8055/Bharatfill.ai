import { z } from 'zod';
import { extractedFieldSchema } from '@assistigo/ai';
import {
  conflict,
  getCustomerField,
  isForbiddenFieldKey,
  notFound,
  validationFailed,
  type CustomerFieldDef,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { recordUsage } from '@/lib/billing/entitlements';
import { reviewSchema } from '@/lib/documents/schema';
import { buildCustomerPatch } from '@/lib/customers/write-values';
import { buildFieldValueRows } from '@/lib/customers/field-values';
import { matchesProfileValue, profileValuesForMatching } from '@/lib/documents/profile-match';
import { resolveDocumentScope } from '@/lib/documents/scope';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type {
  CustomerRow,
  DocumentExtractionRow,
  DocumentRow,
} from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();
const storedFieldsSchema = z.array(extractedFieldSchema).catch([]);

/**
 * POST /api/documents/:id/review
 *
 * The human gate (§12.6, §9.3). This is the ONLY path by which an extracted value reaches a
 * customer profile — the OCR job never writes to `customers`.
 *
 * Accepting writes to `customers` (the confirmed profile) *and* to `customer_field_values` with
 * status `operator_verified`, so the profile stays fast to query while provenance — which
 * document, what confidence, who confirmed it — is preserved (docs/DATABASE.md §5).
 *
 * Rejecting keeps the value in `customer_field_values` as `rejected` for traceability, and it
 * never surfaces for autofill.
 *
 * A BharatDoc app customer's document (migration 0041) is reviewed by the operator holding a
 * live grant over that customer; `resolveDocumentScope` proves that, and the writes then land in
 * the app organization through the service role. Everything else about the gate is identical.
 */
export const POST = handler(
  'api.documents.review',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'extraction.review');

    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, reviewSchema);

    // No organization filter here: `resolveDocumentScope` decides which documents this centre
    // may review, and RLS decides which it may read at all.
    const { data: documentRow, error: documentError } = await context.supabase
      .from('documents')
      .select('id, organization_id, customer_id, document_type, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (documentError) throw documentError;
    if (!documentRow) throw notFound('errors.not_found');

    const document = documentRow as Pick<
      DocumentRow,
      'id' | 'organization_id' | 'customer_id' | 'document_type' | 'status'
    >;

    const scope = await resolveDocumentScope({
      supabase: context.supabase,
      callerOrganizationId: context.organization.id,
      document,
      admin: createSupabaseAdminClient,
    });
    const orgId = scope.organizationId;
    const db = scope.writer;

    const { data: extractionRow, error: extractionError } = await context.supabase
      .from('document_extractions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('document_id', id)
      .maybeSingle();

    if (extractionError) throw extractionError;
    if (!extractionRow) throw notFound('errors.no_extraction');

    const extraction = extractionRow as DocumentExtractionRow;
    if (extraction.status === 'accepted') throw conflict('errors.extraction_already_reviewed');

    if (!document.customer_id) {
      // Creating a customer from a document is a separate flow (§9.3); this route updates an
      // existing profile. Refusing is better than inventing a customer the operator did not ask
      // for and cannot see.
      throw conflict('errors.document_has_no_customer');
    }

    const proposed = new Map(
      storedFieldsSchema.parse(extraction.extracted_fields).map((field) => [field.key, field]),
    );

    const accepted: Record<string, string> = {};
    const rejected: string[] = [];
    const confidenceByKey = new Map<string, number | null>();

    for (const decision of input.decisions) {
      const field = proposed.get(decision.fieldKey);
      // A decision about a field this extraction never proposed is a client bug at best and an
      // injection attempt at worst.
      if (!field) throw validationFailed({ fields: { decisions: 'errors.unknown_field' } });

      if (isForbiddenFieldKey(decision.fieldKey)) {
        throw validationFailed({ fields: { decisions: 'errors.unknown_field' } });
      }

      const definition: CustomerFieldDef | undefined = getCustomerField(decision.fieldKey);
      if (!definition) throw validationFailed({ fields: { decisions: 'errors.unknown_field' } });

      if (decision.action === 'reject') {
        rejected.push(decision.fieldKey);
        continue;
      }

      const value = decision.action === 'edit' ? (decision.value ?? '') : field.value;
      if (value.trim() === '') continue;

      accepted[decision.fieldKey] = value;
      // An edited value is the operator's own, so the extractor's confidence no longer describes
      // it. Recording null says "a human typed this", which is the stronger claim anyway.
      confidenceByKey.set(decision.fieldKey, decision.action === 'edit' ? null : field.confidence);
    }

    const customerId = document.customer_id;

    const { data: customerRow, error: customerError } = await db
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customerRow) throw notFound('errors.not_found');

    const customer = customerRow as CustomerRow;

    // Read before the write, so the audit entry can tell "already on the profile" apart from
    // genuinely new data — the review screen pre-accepts the former (lib/documents/profile-match.ts).
    const { data: existingValueRows, error: existingValuesError } = await db
      .from('customer_field_values')
      .select('field_key, value_text, status')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId);

    if (existingValuesError) throw existingValuesError;

    const profileValues = profileValuesForMatching(
      customer,
      (existingValueRows ?? []) as {
        field_key: string;
        value_text: string | null;
        status: string;
      }[],
    );
    const matchedKeys = Object.keys(accepted).filter((key) =>
      matchesProfileValue(accepted[key] ?? '', profileValues[key]),
    );

    const { patch, encryptedKeys } = buildCustomerPatch(customer, accepted);

    // Provenance rows are built first, because building them encrypts the high-risk values and
    // that is the step most likely to fail on a misconfigured server. Doing it before any write
    // means a missing FIELD_ENCRYPTION_KEY leaves the profile untouched rather than half-saved.
    const fieldValueRows = await buildFieldValueRows({
      organizationId: orgId,
      customerId,
      userId: context.userId,
      source: { documentId: id },
      accepted,
      rejected,
      encryptedKeys,
      confidenceByKey,
    });

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await db
        .from('customers')
        .update({ ...patch, updated_by: context.userId, verification_status: 'operator_verified' })
        .eq('id', customerId)
        .eq('organization_id', orgId);

      if (updateError) throw updateError;
    }

    if (fieldValueRows.length > 0) {
      const { error: valuesError } = await db
        .from('customer_field_values')
        .upsert(fieldValueRows, { onConflict: 'organization_id,customer_id,field_key' });

      if (valuesError) throw valuesError;
    }

    const now = new Date().toISOString();
    const { error: statusError } = await db
      .from('document_extractions')
      .update({
        status: Object.keys(accepted).length > 0 ? 'accepted' : 'rejected',
        reviewed_by: context.userId,
        reviewed_at: now,
        // Raw text exists to support review. Once reviewed, it is no longer needed
        // (docs/AI_PIPELINE.md §7).
        raw_text: null,
      })
      .eq('id', extraction.id)
      .eq('organization_id', orgId);

    if (statusError) throw statusError;

    const { error: documentStatusError } = await db
      .from('documents')
      .update({ status: 'verified' })
      .eq('id', id)
      .eq('organization_id', orgId);

    if (documentStatusError) throw documentStatusError;

    await writeAuditLog(context, {
      action: Object.keys(accepted).length > 0 ? 'extraction.accepted' : 'extraction.rejected',
      entityType: 'document_extraction',
      entityId: extraction.id,
      // Which fields were decided and how — never the values themselves (§24.2).
      metadata: {
        documentId: id,
        customerId,
        acceptedKeys: Object.keys(accepted),
        // Accepted keys whose value was already on the profile, unchanged.
        matchedKeys,
        rejectedKeys: rejected,
        editedCount: input.decisions.filter((decision) => decision.action === 'edit').length,
        ...(scope.kind === 'app' ? { appCustomer: true } : {}),
      },
    });

    // An app document was read on the platform's account, not the centre's: reviewing it does
    // not spend the centre's extraction quota.
    if (scope.kind === 'own') await recordUsage(context, 'ai_extraction', 1, { documentId: id });

    return ok({
      documentId: id,
      customerId,
      acceptedCount: Object.keys(accepted).length,
      rejectedCount: rejected.length,
    });
  },
);
