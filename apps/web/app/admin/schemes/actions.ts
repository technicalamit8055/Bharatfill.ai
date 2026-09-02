'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { schemeScheduleSchema } from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { adminSchemeInputSchema, toSchemeCatalogWrite } from '@/lib/admin/scheme-write';
import { logger } from '@/lib/api/logger';

/**
 * Global scheme catalogue mutations.
 *
 * Every action re-checks its permission server-side. The sidebar hides what a role cannot do and
 * the pages gate themselves, but a Server Action is a POST endpoint like any other and has to
 * stand on its own (docs/DEVELOPMENT_RULES.md §4).
 *
 * These write rows with `organization_id = null` — the catalogue every centre in the country
 * reads. That is why each one writes an audit entry, and why publishing is a separate permission
 * from editing: getting a draft wrong costs nothing, publishing a wrong age limit is advice given
 * at ten thousand counters.
 */

export type SchemeActionState = {
  error?: string;
  notice?: string;
  /** Field-level messages, keyed by the dotted path from Zod. */
  fields?: Record<string, string>;
};

const idSchema = z.string().uuid();

/**
 * The editor posts JSON in a hidden field rather than 40 flat form inputs.
 *
 * A scheme definition is a nested object with localised text pairs and an eligibility criteria
 * tree; flattening that into `FormData` keys and reassembling it here would be a second,
 * unvalidated schema living in string concatenation.
 */
function parseJsonField(formData: FormData, key: string): unknown {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join('.') || '_'] ??= issue.message;
  }
  return out;
}

export async function saveSchemeAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = adminSchemeInputSchema.safeParse(parseJsonField(formData, 'scheme'));
  if (!parsed.success) {
    return { error: 'errors.validation_failed', fields: fieldErrors(parsed.error) };
  }

  const rawId = formData.get('id');
  const existingId = typeof rawId === 'string' && rawId ? rawId : null;
  if (existingId && !idSchema.safeParse(existingId).success) {
    return { error: 'errors.validation_failed' };
  }

  // Publishing is its own permission. A content manager holds both; a role that could edit but
  // not publish must not be able to sneak a live row out of the create form.
  if (parsed.data.isPublished && !session.permissions.has('platform.schemes.publish')) {
    return { error: 'errors.permission_denied' };
  }

  const write = {
    ...toSchemeCatalogWrite(parsed.data),
    organization_id: null,
    is_published: parsed.data.isPublished,
    // A person typed this, so it is `manual` even when it started life as a scraped candidate —
    // the moment somebody edits it by hand they own the claim.
    source: 'manual' as const,
    verified_at: new Date().toISOString(),
    verified_by: session.userId,
  };

  const result = existingId
    ? await session.supabase
        .from('schemes_catalog')
        .update(write)
        .eq('id', existingId)
        .is('organization_id', null)
        .select('id')
        .maybeSingle()
    : await session.supabase
        .from('schemes_catalog')
        .insert({ ...write, created_by: session.userId })
        .select('id')
        .single();

  if (result.error) {
    // 23505 is the unique index on (slug) where organization_id is null.
    if (result.error.code === '23505') {
      return { error: 'admin.schemes.slugTaken', fields: { slug: 'admin.schemes.slugTaken' } };
    }
    logger.error('platform.scheme_save_failed', { code: result.error.code });
    return { error: 'errors.internal' };
  }

  const schemeId = (result.data as { id: string } | null)?.id ?? existingId;

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: existingId ? 'platform.scheme_updated' : 'platform.scheme_created',
    entityType: 'schemes_catalog',
    entityId: schemeId,
    metadata: { slug: parsed.data.slug, published: parsed.data.isPublished },
  });

  revalidatePath('/admin/schemes');
  revalidatePath('/admin/deadlines');
  if (!existingId && schemeId) redirect(`/admin/schemes/${schemeId}`);
  return { notice: 'admin.schemes.saved' };
}

/**
 * Moves a scheme's application window and nothing else.
 *
 * Used by both the per-scheme editor and the bulk deadline screen. Separate from `saveSchemeAction`
 * because it is the change made weekly, by someone who is looking at a notification and not at an
 * eligibility tree, and round-tripping the whole definition to move one date is how an unrelated
 * field gets clobbered.
 */
export async function updateScheduleAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.deadlines.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }

  const blankToNull = (value: FormDataEntryValue | null) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

  const parsed = schemeScheduleSchema.safeParse({
    applicationStartDate: blankToNull(formData.get('applicationStartDate')),
    applicationEndDate: blankToNull(formData.get('applicationEndDate')),
    examDate: blankToNull(formData.get('examDate')),
    isAlwaysOpen: formData.get('isAlwaysOpen') === 'on',
  });

  if (!parsed.success) {
    return { error: 'errors.validation_failed', fields: fieldErrors(parsed.error) };
  }

  // "Open all year" and "closes on a date" cannot both be true (0020,
  // schemes_catalog_evergreen_has_no_end). Caught here so the employee gets a field message
  // rather than a constraint violation.
  if (parsed.data.isAlwaysOpen && parsed.data.applicationEndDate) {
    return {
      error: 'admin.schemes.evergreenHasEndDate',
      fields: { applicationEndDate: 'admin.schemes.evergreenHasEndDate' },
    };
  }

  const { error } = await session.supabase
    .from('schemes_catalog')
    .update({
      application_start_date: parsed.data.applicationStartDate,
      application_end_date: parsed.data.applicationEndDate,
      exam_date: parsed.data.examDate,
      is_always_open: parsed.data.isAlwaysOpen,
      verified_at: new Date().toISOString(),
      verified_by: session.userId,
    })
    .eq('id', id)
    .is('organization_id', null);

  if (error) {
    logger.error('platform.schedule_update_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scheme_deadline_updated',
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: {
      start: parsed.data.applicationStartDate,
      end: parsed.data.applicationEndDate,
      alwaysOpen: parsed.data.isAlwaysOpen,
    },
  });

  revalidatePath('/admin/deadlines');
  revalidatePath('/admin/schemes');
  revalidatePath(`/admin/schemes/${id}`);
  return { notice: 'admin.schemes.deadlineSaved' };
}

export async function setPublishedAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.publish')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }
  const publish = formData.get('publish') === 'true';

  const { error } = await session.supabase
    .from('schemes_catalog')
    .update({ is_published: publish })
    .eq('id', id)
    .is('organization_id', null);

  if (error) {
    logger.error('platform.scheme_publish_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scheme_published',
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: { published: publish },
  });

  revalidatePath('/admin/schemes');
  revalidatePath(`/admin/schemes/${id}`);
  return { notice: publish ? 'admin.schemes.published' : 'admin.schemes.unpublished' };
}

export async function deleteSchemeAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.delete')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }

  // Read the slug before deleting: afterwards there is nothing left to name in the audit row, and
  // an audit entry that says only "a scheme was deleted" answers no question anyone will ask.
  const { data: existing } = await session.supabase
    .from('schemes_catalog')
    .select('slug')
    .eq('id', id)
    .is('organization_id', null)
    .maybeSingle();

  const { error } = await session.supabase
    .from('schemes_catalog')
    .delete()
    .eq('id', id)
    .is('organization_id', null);

  if (error) {
    logger.error('platform.scheme_delete_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scheme_deleted',
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: { slug: (existing as { slug: string } | null)?.slug ?? null },
  });

  revalidatePath('/admin/schemes');
  redirect('/admin/schemes');
}
