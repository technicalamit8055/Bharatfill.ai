import 'server-only';
import { z } from 'zod';
import {
  buildDocumentChecklist,
  requirementsFromAdapter,
  requirementsFromScheme,
  type ChecklistDerivative,
  type ChecklistDocument,
  type ChecklistItem,
  type ChecklistRequirement,
} from '@assistigo/form-engine';
import { isPresetCode } from '@assistigo/document-tools';
import type { Locale } from '@/lib/i18n';
import { localised } from '@/lib/i18n';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import { loadSchemeCatalog } from '@/lib/schemes/service';
import type { AssistigoSupabaseClient } from '@/lib/supabase/server';

/** The `?for=` query value: which form or scheme the checklist is for. */
export const CHECKLIST_TARGET_PARAM = 'for';

const targetIdSchema = z
  .string()
  .max(120)
  .regex(/^(form|scheme):[a-z0-9][a-z0-9-]*$/);

export type ChecklistTarget = {
  /** `form:<adapter slug>` or `scheme:<scheme slug>`. */
  id: string;
  kind: 'form' | 'scheme';
  title: string;
  /** The portal, and the state where the form is state-specific. */
  subtitle: string | null;
  requirements: ChecklistRequirement[];
};

/**
 * An adapter can name a preset this build does not ship (RTPS's `rtps.photo`). Document Tools
 * refuses to save a file against an unknown code, so keeping it would leave the item stuck on
 * "needs preparing" for ever; without it, any chosen photo meets the requirement.
 */
function withKnownPreset(requirement: ChecklistRequirement): ChecklistRequirement {
  return requirement.presetCode && !isPresetCode(requirement.presetCode)
    ? { ...requirement, presetCode: null }
    : requirement;
}

/** A hand-edited query string is just an absent choice, never an error page. */
export function parseChecklistTargetId(value: unknown): string | null {
  const parsed = targetIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Every form and scheme this organization can see that lists the documents it needs. Forms
 * come first: a portal adapter knows the exact upload sizes, a scheme only the document names.
 */
export async function loadChecklistTargets(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  locale: Locale,
): Promise<ChecklistTarget[]> {
  const [adapters, schemes] = await Promise.all([
    loadAdapterCatalog(supabase, organizationId),
    loadSchemeCatalog(supabase, organizationId),
  ]);

  const forms: ChecklistTarget[] = adapters
    .filter((adapter) => adapter.status !== 'deprecated' && adapter.documentRequirements.length > 0)
    .map((adapter) => ({
      id: `form:${adapter.slug}`,
      kind: 'form' as const,
      title: adapter.formName,
      subtitle: [adapter.portalName, adapter.region].filter(Boolean).join(' · ') || null,
      requirements: requirementsFromAdapter(adapter.documentRequirements).map(withKnownPreset),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const schemeTargets: ChecklistTarget[] = schemes
    .filter((scheme) => (scheme.eligibility.requiredDocuments?.length ?? 0) > 0)
    .map((scheme) => ({
      id: `scheme:${scheme.slug}`,
      kind: 'scheme' as const,
      title: localised(scheme.title, locale),
      subtitle: scheme.portalName || null,
      requirements: requirementsFromScheme(scheme.eligibility.requiredDocuments ?? []),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return [...forms, ...schemeTargets];
}

/** How many of either a customer could have; the checklist only needs the newest of each type. */
const MAX_ROWS = 200;

function presetCodeOf(metadata: unknown): string | null {
  const parsed = z
    .object({ preset: z.object({ code: z.string() }).nullable().optional() })
    .safeParse(metadata);
  return parsed.success ? (parsed.data.preset?.code ?? null) : null;
}

/**
 * The checklist for one customer against one target. Metadata only — type, status and preset —
 * never a file, a filename or an extracted value. Reads go through RLS with the operator's own
 * session, so a roaming visit sees exactly the documents its grant opens (0024).
 */
export async function loadCustomerChecklist(
  supabase: AssistigoSupabaseClient,
  customer: { id: string; organizationId: string },
  target: ChecklistTarget,
): Promise<ChecklistItem[]> {
  const [{ data: documentRows, error: documentError }, { data: derivativeRows }] =
    await Promise.all([
      supabase
        .from('documents')
        .select('id, document_type, status, created_at')
        .eq('organization_id', customer.organizationId)
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      supabase
        .from('document_derivatives')
        .select('id, source_document_id, tool_type, metadata, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
    ]);
  if (documentError) throw documentError;

  const documents: ChecklistDocument[] = (documentRows ?? []).map((row) => ({
    id: String(row.id),
    documentType: String(row.document_type),
    status: String(row.status),
    createdAt: String(row.created_at),
  }));

  // A prepared file is a convenience on top of the documents: if they cannot be read, the
  // checklist still stands, it just asks for a photo to be prepared that may already be.
  const derivatives: ChecklistDerivative[] = (derivativeRows ?? []).map((row) => ({
    id: String(row.id),
    sourceDocumentId: (row.source_document_id as string | null) ?? null,
    toolType: row.tool_type as ChecklistDerivative['toolType'],
    presetCode: presetCodeOf(row.metadata),
    createdAt: String(row.created_at),
  }));

  return buildDocumentChecklist({ requirements: target.requirements, documents, derivatives });
}
