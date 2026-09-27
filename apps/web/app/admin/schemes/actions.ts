'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  SCHEME_IMAGE_KINDS,
  SCHEME_LOGO_BUCKET,
  getBuiltInScheme,
  schemeScheduleSchema,
  type SchemeImageKind,
} from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { adminSchemeInputSchema, toSchemeCatalogWrite } from '@/lib/admin/scheme-write';
import {
  SCHEME_IMAGE_MAX_BYTES,
  buildSchemeLogoPath,
  checkSchemeImage,
} from '@/lib/admin/scheme-logo';
import { logger } from '@/lib/api/logger';
import type { AssistigoSupabaseClient } from '@/lib/supabase/server';

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

/** Where each image kind is stored on the row. */
const IMAGE_COLUMN = {
  logo: 'logo_path',
  banner: 'banner_path',
  illustration: 'illustration_path',
} as const satisfies Record<SchemeImageKind, string>;

const imageKindSchema = z.enum(SCHEME_IMAGE_KINDS);

/**
 * The logo keeps its own audit action so its history reads as it always has; the detail-page
 * images share one, with the kind in the metadata.
 */
const imageAuditAction = (kind: SchemeImageKind) =>
  kind === 'logo' ? 'platform.scheme_logo_updated' : 'platform.scheme_artwork_updated';

/** The id and image kind every image action needs, or `null` if either is not well formed. */
function parseImageTarget(formData: FormData): { id: string; kind: SchemeImageKind } | null {
  const id = idSchema.safeParse(formData.get('id'));
  const kind = imageKindSchema.safeParse(formData.get('kind'));
  return id.success && kind.success ? { id: id.data, kind: kind.data } : null;
}

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
  // The image paths too, so their objects do not outlive the row.
  const { data: existing } = await session.supabase
    .from('schemes_catalog')
    .select('slug, logo_path, banner_path, illustration_path')
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

  const deleted = existing as
    ({ slug: string } & Record<(typeof IMAGE_COLUMN)[SchemeImageKind], string | null>) | null;
  if (deleted) {
    for (const kind of SCHEME_IMAGE_KINDS) {
      const path = deleted[IMAGE_COLUMN[kind]];
      if (path) await removeLogoObject(session.supabase, path);
    }
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scheme_deleted',
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: { slug: deleted?.slug ?? null },
  });

  revalidatePath('/admin/schemes');
  redirect('/admin/schemes');
}

// ---------------------------------------------------------------------------
// Logos and artwork
// ---------------------------------------------------------------------------

/**
 * Best-effort removal of an image object that no row points at any more.
 *
 * A failure is logged and swallowed: the row is already correct, and an orphaned image in a
 * private bucket is untidy rather than harmful. Failing the admin's action over it would be worse.
 */
async function removeLogoObject(supabase: AssistigoSupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(SCHEME_LOGO_BUCKET).remove([path]);
  if (error) logger.warn('platform.scheme_logo_cleanup_failed', { path, message: error.message });
}

function revalidateImageViews(id: string): void {
  revalidatePath('/admin/schemes');
  revalidatePath(`/admin/schemes/${id}`);
  revalidatePath('/schemes');
  // Any scheme's detail page can show one of these images.
  // The route pattern, route group included, as `revalidatePath` matches it.
  revalidatePath('/(app)/schemes/[slug]', 'page');
}

/**
 * Uploads or replaces one of a global scheme's images: its logo, the detail page's banner, or
 * the illustration beside "What the customer gets".
 *
 * Separate from `saveSchemeAction` for the same reason the schedule is: a picture should be
 * changeable without round-tripping the eligibility tree, and saving the form must never be able
 * to clobber an image it does not carry. The row goes live with the new image immediately if it
 * is already published — a picture is not a claim about a government rule, so it needs no
 * re-publish.
 *
 * The file is judged by its bytes, not by the name or type the browser sent, and the object path
 * is built here from the row's slug; nothing about where it lands comes from the request. The
 * column written is picked from a fixed map by a validated kind, never named by the request.
 */
export async function uploadSchemeImageAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const target = parseImageTarget(formData);
  if (!target) return { error: 'errors.validation_failed' };
  const { id, kind } = target;
  const column = IMAGE_COLUMN[kind];

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { error: 'admin.schemes.logoMissing' };
  // Refused before reading it into memory.
  if (file.size > SCHEME_IMAGE_MAX_BYTES[kind]) {
    return { error: `admin.schemes.${kind}TooLarge` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkSchemeImage(kind, bytes);
  if (!check.ok) return { error: check.error };

  const { data } = await session.supabase
    .from('schemes_catalog')
    .select(`slug, ${column}`)
    .eq('id', id)
    .is('organization_id', null)
    .maybeSingle();
  const row = data as unknown as ({ slug: string } & Record<typeof column, string | null>) | null;
  if (!row) return { error: 'errors.not_found' };

  const path = buildSchemeLogoPath(row.slug, check.type.ext);
  const upload = await session.supabase.storage.from(SCHEME_LOGO_BUCKET).upload(path, bytes, {
    contentType: check.type.mimeType,
    upsert: false,
  });
  if (upload.error) {
    logger.error('platform.scheme_image_upload_failed', { kind, message: upload.error.message });
    return { error: 'errors.internal' };
  }

  const { error } = await session.supabase
    .from('schemes_catalog')
    .update({ [column]: path })
    .eq('id', id)
    .is('organization_id', null);

  if (error) {
    // Nothing points at the new object, so it goes; the old image stays as it was.
    await removeLogoObject(session.supabase, path);
    logger.error('platform.scheme_image_save_failed', { kind, code: error.code });
    return { error: 'errors.internal' };
  }

  const previous = row[column];
  if (previous && previous !== path) await removeLogoObject(session.supabase, previous);

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: imageAuditAction(kind),
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: { slug: row.slug, kind, removed: false, bytes: bytes.length, type: check.type.ext },
  });

  revalidateImageViews(id);
  return { notice: `admin.schemes.${kind}Saved` };
}

/** Clears one of a global scheme's images; the page falls back to its default look. */
export async function removeSchemeImageAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const target = parseImageTarget(formData);
  if (!target) return { error: 'errors.validation_failed' };
  const { id, kind } = target;
  const column = IMAGE_COLUMN[kind];

  const { data } = await session.supabase
    .from('schemes_catalog')
    .select(`slug, ${column}`)
    .eq('id', id)
    .is('organization_id', null)
    .maybeSingle();
  const row = data as unknown as ({ slug: string } & Record<typeof column, string | null>) | null;
  if (!row) return { error: 'errors.not_found' };
  const previous = row[column];
  if (!previous) return { notice: `admin.schemes.${kind}Removed` };

  const { error } = await session.supabase
    .from('schemes_catalog')
    .update({ [column]: null })
    .eq('id', id)
    .is('organization_id', null);

  if (error) {
    logger.error('platform.scheme_image_save_failed', { kind, code: error.code });
    return { error: 'errors.internal' };
  }

  await removeLogoObject(session.supabase, previous);

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: imageAuditAction(kind),
    entityType: 'schemes_catalog',
    entityId: id,
    metadata: { slug: row.slug, kind, removed: true },
  });

  revalidateImageViews(id);
  return { notice: `admin.schemes.${kind}Removed` };
}

/**
 * Copies a built-in scheme into the global catalogue as an unpublished draft.
 *
 * Built-ins live in the build (packages/core/src/schemes/catalog.ts) and have no row, so there
 * was nowhere to hang a logo — or a correction — without retyping the whole definition. The copy
 * is a draft: tenants keep seeing the built-in until someone publishes the row, and it starts
 * unverified because nobody has checked it against a notification yet.
 */
export async function copyBuiltInSchemeAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.schemes.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const slug = formData.get('slug');
  const builtIn = typeof slug === 'string' ? getBuiltInScheme(slug) : undefined;
  if (!builtIn) return { error: 'errors.validation_failed' };

  const { data, error } = await session.supabase
    .from('schemes_catalog')
    .insert({
      ...toSchemeCatalogWrite(builtIn),
      organization_id: null,
      is_published: false,
      source: 'built_in' as const,
      created_by: session.userId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'admin.schemes.slugTaken' };
    logger.error('platform.scheme_copy_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  const schemeId = (data as { id: string }).id;

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scheme_created',
    entityType: 'schemes_catalog',
    entityId: schemeId,
    metadata: { slug: builtIn.slug, published: false, fromBuiltIn: true },
  });

  revalidatePath('/admin/schemes');
  redirect(`/admin/schemes/${schemeId}`);
}
