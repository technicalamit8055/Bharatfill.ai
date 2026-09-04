import { z } from 'zod';
import {
  checkUsageEntitlement,
  entitlementExceeded,
  notFound,
  previewValue,
} from '@assistigo/core';
import {
  detectionPayloadSchema,
  matchDocumentRequirements,
  mergeAdapters,
  proposeMappings,
  selectAdapter,
  type DocumentRequirement,
  type DocumentSuggestion,
  type OrgFieldMapping,
  type PortalAdapter,
} from '@assistigo/form-engine';
import { findPreset, presetsForCategory, type RequirementPreset } from '@assistigo/document-tools';
import { type DocumentType, isDocumentType } from '@assistigo/core';
import { hasPermission, requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import {
  customerValuesFromRow,
  unverifiedFieldKeys,
  type CustomerValues,
} from '@/lib/customers/values';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import type { CustomerRow, DocumentDerivativeRow, DocumentRow } from '@/lib/supabase/database.types';

const MAX_SUGGESTIONS_PER_FIELD = 5;

type DerivativeCandidateRow = Pick<
  DocumentDerivativeRow,
  'id' | 'tool_type' | 'filename' | 'mime_type' | 'size_bytes' | 'width' | 'height' | 'metadata' | 'created_at'
>;

type SourceDocumentCandidateRow = Pick<
  DocumentRow,
  'id' | 'document_type' | 'original_filename' | 'mime_type' | 'size_bytes' | 'created_at'
>;

/**
 * Which detected-file category (`DOCUMENT_CATEGORIES`) a customer's source document satisfies.
 *
 * Unlike a derivative, a source document has no `tool_type` — it is whatever the customer
 * uploaded, classified (or not yet classified) by OCR. `photo` and `signature` map directly;
 * every identity/educational/certificate type is a `pdf` (generic document) upload slot, the
 * same category `inferFileFieldCategory` now falls back to for an unrecognised file field.
 */
const DOCUMENT_TYPE_TO_CATEGORY: Partial<Record<DocumentType, 'photo' | 'signature' | 'pdf'>> = {
  photo: 'photo',
  signature: 'signature',
  aadhaar_like: 'pdf',
  pan: 'pdf',
  voter_id: 'pdf',
  marksheet_10: 'pdf',
  marksheet_12: 'pdf',
  marksheet_graduation: 'pdf',
  caste_certificate: 'pdf',
  income_certificate: 'pdf',
  residence_certificate: 'pdf',
  receipt: 'pdf',
  application_pdf: 'pdf',
  generic: 'pdf',
};

function categoryForDocumentType(documentType: string): 'photo' | 'signature' | 'pdf' | null {
  if (!isDocumentType(documentType)) return 'pdf'; // `unknown` and anything not yet classified.
  if (documentType === 'unknown') return 'pdf';
  return DOCUMENT_TYPE_TO_CATEGORY[documentType] ?? 'pdf';
}

/**
 * Narrows the generic 'pdf' category once the adapter's own resolved requirement says
 * specifically what it wants. Both an "address proof" upload box and a "marksheet" upload box
 * are category 'pdf' — `DOCUMENT_TYPE_TO_CATEGORY` has no room for the difference — but a
 * residence-certificate applicant's own graduation marksheet is never a fit for an address-proof
 * slot, and vice versa (RTPS Bihar bug: an income/residence-certificate form suggesting the
 * customer's unrelated marksheets because both are simply "pdf").
 *
 * Only applies when the adapter positively resolved a requirement for this field. A field with
 * no requirement match keeps the existing broad 'pdf' behaviour — the phantom-suggestion cases
 * (no label, no accept, invisible fields) are already excluded upstream, before a match ever
 * reaches this route.
 */
const ADDRESS_PROOF_DOCUMENT_TYPES: readonly DocumentType[] = [
  'aadhaar_like',
  'voter_id',
  'residence_certificate',
];
const EDUCATIONAL_DOCUMENT_TYPES: readonly DocumentType[] = [
  'marksheet_10',
  'marksheet_12',
  'marksheet_graduation',
];
const ADDRESS_PROOF_REQUIREMENT_WORDS = /address\s*proof|aadhaar|voter|residence/i;
const EDUCATIONAL_REQUIREMENT_WORDS = /marksheet|educational|graduation|\bclass\s*1[02]\b/i;

function allowedDocumentTypesForRequirement(
  requirement: DocumentRequirement | null,
): readonly DocumentType[] | null {
  if (!requirement) return null;
  const text = `${requirement.key} ${requirement.label}`;
  if (ADDRESS_PROOF_REQUIREMENT_WORDS.test(text)) return ADDRESS_PROOF_DOCUMENT_TYPES;
  if (EDUCATIONAL_REQUIREMENT_WORDS.test(text)) return EDUCATIONAL_DOCUMENT_TYPES;
  return null;
}

/** A preset chosen from the built-in catalogue, for a category and an adapter's portal name. */
function guessPresetForPortal(
  category: RequirementPreset['category'],
  portalName: string | undefined,
): RequirementPreset | null {
  if (!portalName) return null;
  const needle = portalName.trim().toLowerCase();
  if (!needle) return null;
  return (
    presetsForCategory(category).find((preset) => {
      const hay = preset.portal.toLowerCase();
      return hay === needle || hay.includes(needle) || needle.includes(hay);
    }) ?? null
  );
}

function toPresetSummary(preset: RequirementPreset): DocumentSuggestion['preset'] {
  return {
    code: preset.code,
    label: preset.label,
    portal: preset.portal,
    minBytes: preset.minBytes ?? null,
    maxBytes: preset.maxBytes ?? null,
    widthPx: preset.widthPx ?? null,
    heightPx: preset.heightPx ?? null,
    widthMm: preset.widthMm ?? null,
    heightMm: preset.heightMm ?? null,
    dpi: preset.dpi ?? null,
    colorMode: preset.colorMode ?? null,
    notes: preset.notes ?? null,
  };
}

const bodySchema = z.object({
  customerId: z.string().uuid(),
  detection: detectionPayloadSchema,
});

/**
 * POST /api/forms/map
 *
 * Takes field metadata from the extension and returns a mapping proposal plus the values that
 * would be used. Master spec §17.4, §14.3.
 *
 * Note what is *not* in the request: no page HTML, no field values, no query string (§14.2).
 * Values travel only in the response, to the operator who is about to review them.
 */
export const POST = handler('api.forms.map', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'fill.run');

  const { customerId, detection } = await parseBody(request, bodySchema);

  // Entitlement is checked before any work is done, so an out-of-credit organization gets a
  // clear answer rather than a proposal it cannot act on (§22.4).
  const entitlements = await loadEntitlementContext(context);
  const decision = checkUsageEntitlement(entitlements, 'fill');
  if (!decision.allowed) throw entitlementExceeded(decision.reason);

  /*
   * Neither query below filters by `context.organization.id`: a customer being filled here may
   * belong to another centre entirely, reachable only through a live roaming grant
   * (migration 0024). RLS is the only gate that can tell the two cases apart correctly — the
   * `customers_select` and `customer_field_values_select` policies already allow a home-org
   * member OR a live grant holder, and either way the row's own `organization_id` is what ends
   * up on this fill session, not the caller's.
   */
  const [customerResult, fieldValuesResult, adaptersResult, orgMappingsResult] = await Promise.all([
    context.supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle(),
    context.supabase
      .from('customer_field_values')
      .select('field_key, status, display_value, value_text')
      .eq('customer_id', customerId),
    context.supabase
      .from('portal_adapters')
      .select('*')
      .in('status', ['active', 'testing'])
      .or(`organization_id.is.null,organization_id.eq.${context.organization.id}`),
    context.supabase
      .from('org_field_mappings')
      .select('page_origin, field_signature, customer_field, transform')
      .eq('organization_id', context.organization.id)
      .eq('page_origin', detection.page.origin),
  ]);

  const customer = customerResult.data as CustomerRow | null;
  if (!customer) throw notFound('errors.customer_not_found');

  const fieldValueRows = (fieldValuesResult.data ?? []) as {
    field_key: string;
    status: string;
    display_value: string | null;
    value_text: string | null;
  }[];

  const values: CustomerValues = customerValuesFromRow(customer);

  // Operator-verified values from the provenance table win over the profile columns: they are
  // the ones a human has explicitly confirmed against a document.
  for (const row of fieldValueRows) {
    if (row.status === 'operator_verified' || row.status === 'customer_confirmed') {
      if (row.value_text) values[row.field_key] = row.value_text;
    }
  }

  const adapterRows = (adaptersResult.data ?? []) as Record<string, unknown>[];

  const databaseAdapters = adapterRows
    /*
     * Global rows first so that `mergeAdapters` — last-wins by slug — lets an organization's own
     * patched copy of an adapter beat the global one. The query is a single `.or()`, and
     * Postgres makes no promise about the order two branches of it come back in.
     */
    .slice()
    .sort((a, b) => Number(a.organization_id != null) - Number(b.organization_id != null))
    .map(
      (row) =>
        ({
          id: String(row.id),
          slug: String(row.slug),
          portalName: String(row.portal_name),
          formName: String(row.form_name),
          region: row.region as string | undefined,
          urlPatterns: (row.url_patterns as string[]) ?? [],
          version: String(row.version),
          status: row.status as PortalAdapter['status'],
          fields: (row.field_mappings as PortalAdapter['fields']) ?? [],
          documentRequirements:
            (row.document_requirements as PortalAdapter['documentRequirements']) ?? [],
        }) satisfies PortalAdapter,
    );

  /*
   * The adapters that ship with the build are the floor, not the ceiling: an unseeded database
   * used to mean "no portal is supported", which is a silent, total loss of the feature on any
   * deployment whose seed had not been run. A database row for the same slug still wins.
   */
  const adapters = mergeAdapters(databaseAdapters);
  const adapter = selectAdapter(adapters, detection.page.origin, detection.page.path);

  /*
   * `fill_sessions.portal_adapter_id` is a foreign key, so it may only name an adapter that is
   * actually a row. A built-in that has not been seeded yet still maps the form; it just does
   * not get credited in the session, and adapter health for it stays blank until it is seeded.
   */
  const persistedAdapterId =
    adapter && databaseAdapters.some((candidate) => candidate.id === adapter.id)
      ? adapter.id
      : null;

  const orgMappings = ((orgMappingsResult.data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        pageOrigin: String(row.page_origin),
        fieldSignature: String(row.field_signature),
        customerField: String(row.customer_field),
        transform: (row.transform as string | undefined) ?? undefined,
      }) satisfies OrgFieldMapping,
  );

  const settings = (context.organization.settings ?? {}) as { overwrite_filled_fields?: boolean };

  const proposal = proposeMappings({
    detection,
    customerValues: values,
    unverifiedFields: unverifiedFieldKeys(fieldValueRows),
    adapter,
    orgMappings,
    overwriteFilled: settings.overwrite_filled_fields === true,
  });

  // Open the fill session now, so a fill that is started and abandoned is still visible to the
  // operator and to adapter health (§18.2).
  const { data: session, error } = await context.supabase
    .from('fill_sessions')
    .insert({
      organization_id: context.organization.id,
      customer_id: customerId,
      portal_adapter_id: persistedAdapterId,
      page_origin: detection.page.origin,
      page_path: detection.page.path,
      page_title: detection.page.title,
      detected_fields_count: proposal.summary.detected,
      proposed_fields_count: proposal.summary.proposed,
      review_required_count: proposal.summary.needsReview,
      captcha_fields_count: proposal.summary.captcha,
      otp_fields_count: proposal.summary.otp,
      payment_fields_count: proposal.summary.payment,
      status: 'detected',
      extension_version: detection.extensionVersion ?? null,
      created_by: context.userId,
    })
    .select('id')
    .single();

  if (error) throw error;

  await writeAuditLog(context, {
    action: 'fill_session.started',
    entityType: 'fill_session',
    entityId: session.id as string,
    metadata: {
      pageOrigin: detection.page.origin,
      adapterId: persistedAdapterId,
      detected: proposal.summary.detected,
      proposed: proposal.summary.proposed,
    },
  });

  // Only the values for fields that were actually mapped are returned — not the customer's
  // whole profile.
  const usedValues: CustomerValues = {};
  for (const mapping of proposal.mappings) {
    if (mapping.customerField && values[mapping.customerField] !== undefined) {
      usedValues[mapping.customerField] = values[mapping.customerField] as string;
    }
  }

  /*
   * Document attachment helper (spec §7.4.5, §13.3). A file input is never fillable — see
   * mapper.ts's `isFileInput` branch — so this is the extension's other way to help: work out
   * what each one wants and, if the operator can see the customer's documents, which prepared
   * files already on file would satisfy it.
   */
  // Belt and suspenders: `matchDocumentRequirements` already skips a field the operator cannot
  // see, but a hidden file input never deserves a document suggestion regardless of which layer
  // catches it (RTPS Bihar's hidden representative-authorization / internal-uploader widgets).
  const visibleFields = detection.fields.filter((field) => field.visible !== false);
  const documentMatches = matchDocumentRequirements(visibleFields, adapter);
  const canSuggestDerivatives = hasPermission(context, 'document.view');

  const derivativesByCategory = new Map<string, DerivativeCandidateRow[]>();
  const sourceDocsByCategory = new Map<string, SourceDocumentCandidateRow[]>();

  if (canSuggestDerivatives && documentMatches.length > 0) {
    const categories = Array.from(new Set(documentMatches.map((match) => match.category)));

    // No organization_id filter on either query — see the comment on the customer/field-values
    // queries above. A roaming customer's documents belong to their home org, not the caller's;
    // `document_derivatives_select` and `documents_select` allow a live grant holder through the
    // same way `customers_select` does, and RLS is what tells the two cases apart correctly.
    const [derivativesResult, sourceDocsResult] = await Promise.all([
      context.supabase
        .from('document_derivatives')
        .select('id, tool_type, filename, mime_type, size_bytes, width, height, metadata, created_at')
        .eq('customer_id', customerId)
        .in('tool_type', categories)
        .order('created_at', { ascending: false })
        .limit(30),
      // Source documents (spec: dual document support) — a customer's original uploads
      // (Aadhaar, PAN, marksheets, photos) in `public.documents`, surfaced even when no
      // derivative has been prepared from them yet.
      context.supabase
        .from('documents')
        .select('id, document_type, original_filename, mime_type, size_bytes, created_at')
        .eq('customer_id', customerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (derivativesResult.error) throw derivativesResult.error;
    if (sourceDocsResult.error) throw sourceDocsResult.error;

    for (const row of (derivativesResult.data ?? []) as DerivativeCandidateRow[]) {
      const list = derivativesByCategory.get(row.tool_type) ?? [];
      list.push(row);
      derivativesByCategory.set(row.tool_type, list);
    }

    for (const row of (sourceDocsResult.data ?? []) as SourceDocumentCandidateRow[]) {
      const category = categoryForDocumentType(row.document_type);
      if (!category || !categories.includes(category)) continue;
      const list = sourceDocsByCategory.get(category) ?? [];
      list.push(row);
      sourceDocsByCategory.set(category, list);
    }
  }

  const documentSuggestions: DocumentSuggestion[] = documentMatches.map((match) => {
    const presetCode = match.requirement?.presetCode;
    const preset =
      (presetCode ? findPreset(presetCode) : null) ??
      guessPresetForPortal(match.category, adapter?.portalName);

    const derivativeCandidates = derivativesByCategory.get(match.category) ?? [];
    // Preset-matching derivatives first — they are the files Document Tools Studio prepared
    // specifically for this portal, and the strongest possible suggestion.
    const rankedDerivatives = preset
      ? [...derivativeCandidates].sort((a, b) => {
          const aMatches = (a.metadata as { preset?: { code?: string } } | null)?.preset?.code === preset.code;
          const bMatches = (b.metadata as { preset?: { code?: string } } | null)?.preset?.code === preset.code;
          return Number(bMatches) - Number(aMatches);
        })
      : derivativeCandidates;

    const derivativeSuggestions = rankedDerivatives.map((row) => ({
      id: row.id,
      filename: row.filename,
      sizeBytes: row.size_bytes,
      width: row.width ?? null,
      height: row.height ?? null,
      createdAt: row.created_at,
      mimeType: row.mime_type,
      matchesPreset: Boolean(
        preset && (row.metadata as { preset?: { code?: string } } | null)?.preset?.code === preset.code,
      ),
      kind: 'derivative' as const,
    }));

    // Source documents fill the remaining slots, ranked newest first — they are never a preset
    // match (no derivative tool has touched them), but still worth offering when no prepared
    // file exists yet. Once the adapter has resolved a specific requirement, narrow further than
    // the coarse category — an address-proof slot never wants a marksheet and vice versa.
    const allowedTypes = allowedDocumentTypesForRequirement(match.requirement);
    const sourceDocCandidates = (sourceDocsByCategory.get(match.category) ?? []).filter(
      (row) => !allowedTypes || (allowedTypes as readonly string[]).includes(row.document_type),
    );
    const sourceDocSuggestions = sourceDocCandidates.map((row) => ({
      id: row.id,
      filename: row.original_filename,
      sizeBytes: row.size_bytes,
      width: null,
      height: null,
      createdAt: row.created_at,
      mimeType: row.mime_type,
      matchesPreset: false,
      kind: 'source_document' as const,
      documentType: row.document_type,
    }));

    return {
      signature: match.signature,
      category: match.category,
      preset: preset ? toPresetSummary(preset) : null,
      suggestions: [...derivativeSuggestions, ...sourceDocSuggestions].slice(
        0,
        MAX_SUGGESTIONS_PER_FIELD,
      ),
    };
  });

  return ok({
    fillSessionId: session.id,
    adapter: adapter
      ? { id: adapter.id, portalName: adapter.portalName, formName: adapter.formName }
      : null,
    mappings: proposal.mappings,
    fillOrder: proposal.fillOrder,
    summary: proposal.summary,
    documentSuggestions,
    values: usedValues,
    /** Masked previews, safe to render in a log or a dashboard list. */
    previews: Object.fromEntries(
      Object.entries(usedValues).map(([key, value]) => [key, previewValue(value)]),
    ),
  });
});
