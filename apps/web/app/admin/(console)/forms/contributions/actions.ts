'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  BUILT_IN_ADAPTERS,
  contributionGroupKey,
  mergeAdapters,
  mergeContributionIntoAdapter,
  newContributedAdapter,
  portalAdapterSchema,
  portalTargetForOrigin,
  selectAdapter,
  type MappingContribution,
  type PortalAdapter,
} from '@assistigo/form-engine';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { logger } from '@/lib/api/logger';
import type { MappingContributionRow, PortalAdapterRow } from '@/lib/supabase/database.types';

/**
 * Review of operator-taught mappings (docs/FORM_ENGINE.md §6c).
 *
 * Approving writes one structured field into a global adapter — never free-text JSON — through
 * `mergeContributionIntoAdapter`, which always makes it an exact-label, always-reviewed field and
 * refuses to shadow a hand-written one. That is what keeps this consistent with the rule on
 * /admin/forms that mappings are not hand-edited in the panel.
 */

export type ContributionActionState = { error?: string; notice?: string };

const idsSchema = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(z.array(z.string().uuid()).min(1).max(500));

function toContribution(row: MappingContributionRow): MappingContribution {
  return {
    pageOrigin: row.page_origin,
    pathPattern: row.path_pattern,
    fieldSignature: row.field_signature,
    tagName: row.tag_name,
    inputType: row.input_type,
    labelText: row.label_text,
    ariaLabel: row.aria_label,
    placeholder: row.placeholder,
    sectionHeading: row.section_heading,
    nameAttribute: row.name_attribute,
    idAttribute: row.id_attribute,
    customerField: row.customer_field,
  };
}

function adapterFromRow(row: PortalAdapterRow): PortalAdapter | null {
  const parsed = portalAdapterSchema.safeParse({
    id: row.id,
    slug: row.slug,
    portalName: row.portal_name,
    formName: row.form_name,
    region: row.region ?? undefined,
    urlPatterns: row.url_patterns,
    version: row.version,
    status: row.status,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    fields: row.field_mappings,
    documentRequirements: row.document_requirements,
    notes: row.notes ?? undefined,
    knownIssues: row.known_issues ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}

export async function approveContributionAction(
  _prev: ContributionActionState,
  formData: FormData,
): Promise<ContributionActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.forms.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const ids = idsSchema.safeParse(formData.get('ids'));
  if (!ids.success) return { error: 'errors.validation_failed' };

  const { data: rowData, error: rowsError } = await session.supabase
    .from('mapping_contributions')
    .select('*')
    .in('id', ids.data)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (rowsError) {
    logger.error('platform.contribution_load_failed', { code: rowsError.code });
    return { error: 'errors.internal' };
  }

  const rows = (rowData ?? []) as MappingContributionRow[];
  const latest = rows[0];
  if (!latest) return { error: 'admin.contributions.alreadyReviewed' };

  // Every id must be the same answer for the same box — a stale page cannot approve a mix.
  const contribution = toContribution(latest);
  const key = contributionGroupKey(contribution);
  if (rows.some((row) => contributionGroupKey(toContribution(row)) !== key)) {
    return { error: 'errors.validation_failed' };
  }

  // The adapter the page would use today: global rows merged over the built-ins, like /api/forms/map.
  const { data: adapterData, error: adaptersError } = await session.supabase
    .from('portal_adapters')
    .select('*')
    .is('organization_id', null)
    .neq('status', 'deprecated');
  if (adaptersError) {
    logger.error('platform.contribution_adapters_failed', { code: adaptersError.code });
    return { error: 'errors.internal' };
  }
  const adapterRows = (adapterData ?? []) as PortalAdapterRow[];
  const databaseAdapters = adapterRows
    .map(adapterFromRow)
    .filter((adapter): adapter is PortalAdapter => adapter !== null);
  const probePath = contribution.pathPattern.replace(/\*/g, '0');
  const current = selectAdapter(
    mergeAdapters(databaseAdapters, BUILT_IN_ADAPTERS),
    contribution.pageOrigin,
    probePath,
  );
  const persistedRow = current ? adapterRows.find((row) => row.slug === current.slug) : undefined;

  const target = portalTargetForOrigin(contribution.pageOrigin);
  const base =
    current ??
    newContributedAdapter({
      origin: contribution.pageOrigin,
      portalName: target?.name ?? new URL(contribution.pageOrigin).hostname,
      formName: 'All forms',
      ...(target?.region ? { region: target.region } : {}),
    });

  const merged = mergeContributionIntoAdapter(base, contribution);
  if (!merged) return { error: 'admin.contributions.shadowed' };
  const checked = portalAdapterSchema.safeParse(merged.adapter);
  if (!checked.success) return { error: 'errors.validation_failed' };
  const next = checked.data;

  let adapterId: string;
  if (persistedRow) {
    const { error } = await session.supabase
      .from('portal_adapters')
      .update({ field_mappings: next.fields, version: next.version })
      .eq('id', persistedRow.id)
      .is('organization_id', null);
    if (error) {
      logger.error('platform.contribution_adapter_update_failed', { code: error.code });
      return { error: 'errors.internal' };
    }
    adapterId = persistedRow.id;
  } else {
    /*
     * Either a portal with no adapter at all, or a built-in that was never seeded. In the second
     * case the whole built-in goes in with the new field: a database row replaces the built-in by
     * slug, so inserting the contributed field alone would wipe every hand-written mapping.
     */
    const { data: inserted, error } = await session.supabase
      .from('portal_adapters')
      .insert({
        organization_id: null,
        slug: next.slug,
        portal_name: next.portalName,
        form_name: next.formName,
        region: next.region ?? null,
        url_patterns: next.urlPatterns,
        version: next.version,
        status: next.status,
        field_mappings: next.fields,
        document_requirements: next.documentRequirements,
        notes: next.notes ?? null,
        known_issues: next.knownIssues ?? null,
        last_verified_at: next.lastVerifiedAt ?? null,
        created_by: session.userId,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      logger.error('platform.contribution_adapter_insert_failed', { code: error?.code });
      return { error: 'errors.internal' };
    }
    adapterId = String(inserted.id);
  }

  const { error: markError } = await session.supabase
    .from('mapping_contributions')
    .update({
      status: 'approved',
      portal_adapter_id: adapterId,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .in(
      'id',
      rows.map((row) => row.id),
    );
  if (markError) {
    logger.error('platform.contribution_mark_failed', { code: markError.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.mapping_contribution_approved',
    entityType: 'portal_adapter',
    entityId: adapterId,
    metadata: {
      slug: next.slug,
      version: next.version,
      customerField: contribution.customerField,
      pageOrigin: contribution.pageOrigin,
      contributions: rows.length,
      replaced: merged.replaced,
    },
  });

  revalidatePath('/admin/forms');
  revalidatePath('/admin/forms/contributions');
  return { notice: 'admin.contributions.approved' };
}

export async function rejectContributionAction(
  _prev: ContributionActionState,
  formData: FormData,
): Promise<ContributionActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.forms.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const ids = idsSchema.safeParse(formData.get('ids'));
  if (!ids.success) return { error: 'errors.validation_failed' };

  const { data, error } = await session.supabase
    .from('mapping_contributions')
    .update({
      status: 'rejected',
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', ids.data)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    logger.error('platform.contribution_reject_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.mapping_contribution_rejected',
    entityType: 'mapping_contribution',
    metadata: { contributions: (data ?? []).length },
  });

  revalidatePath('/admin/forms/contributions');
  return { notice: 'admin.contributions.rejected' };
}
