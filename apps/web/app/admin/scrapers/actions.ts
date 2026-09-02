'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { scraperSourceInputSchema } from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { runScraperSource } from '@/lib/admin/scraper/run';
import { isAllowedSourceUrl, httpFetchingEnabled } from '@/lib/admin/scraper/fetchers';
import { logger } from '@/lib/api/logger';
import type { ScraperSourceRow } from '@/lib/supabase/database.types';

/**
 * Scraper source configuration and manual runs.
 *
 * `platform.scrapers.configure` and `platform.scrapers.run` are separate permissions, and both are
 * separate from `platform.queue.review`. A scraper operator can point the pipeline at a page and
 * pull from it; turning what comes back into advice a citizen acts on is somebody else's decision
 * (packages/core/src/platform/permissions.ts).
 */

export type ScraperActionState = {
  error?: string;
  notice?: string;
  fields?: Record<string, string>;
  /** Populated after a manual run so the operator sees what it did without a page reload. */
  runSummary?: { found: number; staged: number; skipped: number; warnings: string[] };
};

const idSchema = z.string().uuid();

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join('.') || '_'] ??= issue.message;
  return out;
}

export async function saveSourceAction(
  _prev: ScraperActionState,
  formData: FormData,
): Promise<ScraperActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.scrapers.configure')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = scraperSourceInputSchema.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    portalName: formData.get('portalName'),
    sourceUrl: formData.get('sourceUrl'),
    fetcher: formData.get('fetcher'),
    isEnabled: formData.get('isEnabled') === 'on',
    intervalMinutes: Number(formData.get('intervalMinutes') ?? 1440),
    notes: (formData.get('notes') as string) || undefined,
  });

  if (!parsed.success) {
    return { error: 'errors.validation_failed', fields: fieldErrors(parsed.error) };
  }

  // An `http` source that points somewhere the fetcher would refuse is worth rejecting at
  // configuration time. Saving it would produce a row that looks configured and silently stages
  // nothing, which is a far more confusing failure than a validation message.
  if (parsed.data.fetcher === 'http' && !isAllowedSourceUrl(parsed.data.sourceUrl)) {
    return {
      error: 'admin.scrapers.hostNotAllowed',
      fields: { sourceUrl: 'admin.scrapers.hostNotAllowed' },
    };
  }

  const rawId = formData.get('id');
  const existingId = typeof rawId === 'string' && rawId ? rawId : null;
  if (existingId && !idSchema.safeParse(existingId).success) {
    return { error: 'errors.validation_failed' };
  }

  const write = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    portal_name: parsed.data.portalName,
    source_url: parsed.data.sourceUrl,
    fetcher: parsed.data.fetcher,
    is_enabled: parsed.data.isEnabled,
    interval_minutes: parsed.data.intervalMinutes,
    notes: parsed.data.notes ?? null,
  };

  // `config` is set separately (below) rather than here: it is fetcher-specific and the form for
  // it differs per fetcher, so bundling it into this write would mean one shape validating three
  // different things.
  const result = existingId
    ? await session.supabase.from('scraper_sources').update(write).eq('id', existingId).select('id').maybeSingle()
    : await session.supabase
        .from('scraper_sources')
        .insert({ ...write, created_by: session.userId })
        .select('id')
        .single();

  if (result.error) {
    if (result.error.code === '23505') {
      return { error: 'admin.scrapers.slugTaken', fields: { slug: 'admin.scrapers.slugTaken' } };
    }
    logger.error('platform.source_save_failed', { code: result.error.code });
    return { error: 'errors.internal' };
  }

  const sourceId = (result.data as { id: string } | null)?.id ?? existingId;

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scraper_source_updated',
    entityType: 'scraper_source',
    entityId: sourceId,
    metadata: {
      slug: parsed.data.slug,
      fetcher: parsed.data.fetcher,
      enabled: parsed.data.isEnabled,
      created: !existingId,
    },
  });

  revalidatePath('/admin/scrapers');
  if (!existingId && sourceId) redirect(`/admin/scrapers/${sourceId}`);
  return { notice: 'admin.scrapers.saved' };
}

/** Fetcher-specific options, edited as JSON — the shape differs per fetcher. */
export async function saveSourceConfigAction(
  _prev: ScraperActionState,
  formData: FormData,
): Promise<ScraperActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.scrapers.configure')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }

  let config: unknown;
  try {
    config = JSON.parse((formData.get('config') as string) || '{}');
  } catch {
    return { error: 'admin.scrapers.configNotJson', fields: { config: 'admin.scrapers.configNotJson' } };
  }

  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return { error: 'admin.scrapers.configNotObject', fields: { config: 'admin.scrapers.configNotObject' } };
  }

  // A source that needs a credential is a source we are not entitled to scrape (spec §7.3), so
  // the config column refuses to become a place to keep one.
  const forbidden = ['password', 'token', 'secret', 'apikey', 'api_key', 'cookie', 'authorization'];
  const keys = Object.keys(config).map((key) => key.toLowerCase());
  if (keys.some((key) => forbidden.some((word) => key.includes(word)))) {
    return { error: 'admin.scrapers.configNoCredentials', fields: { config: 'admin.scrapers.configNoCredentials' } };
  }

  const { error } = await session.supabase
    .from('scraper_sources')
    .update({ config: config as never })
    .eq('id', id);

  if (error) {
    logger.error('platform.source_config_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scraper_source_updated',
    entityType: 'scraper_source',
    entityId: id,
    metadata: { configKeys: keys },
  });

  revalidatePath(`/admin/scrapers/${id}`);
  return { notice: 'admin.scrapers.configSaved' };
}

export async function deleteSourceAction(
  _prev: ScraperActionState,
  formData: FormData,
): Promise<ScraperActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.scrapers.configure')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }

  const { data: existing } = await session.supabase
    .from('scraper_sources')
    .select('slug')
    .eq('id', id)
    .maybeSingle();

  const { error } = await session.supabase.from('scraper_sources').delete().eq('id', id);
  if (error) {
    logger.error('platform.source_delete_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.scraper_source_updated',
    entityType: 'scraper_source',
    entityId: id,
    metadata: { slug: (existing as { slug: string } | null)?.slug ?? null, deleted: true },
  });

  revalidatePath('/admin/scrapers');
  redirect('/admin/scrapers');
}

/**
 * Runs a source now.
 *
 * The `manual` fetcher reads its candidate from `pastedText` + `schemeSlug`; the others ignore
 * both. Whatever comes back goes to the review queue — this action has no path to the live
 * catalogue (apps/web/lib/admin/scraper/run.ts).
 */
export async function runSourceAction(
  _prev: ScraperActionState,
  formData: FormData,
): Promise<ScraperActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.scrapers.run')) {
    return { error: 'errors.permission_denied' };
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !idSchema.safeParse(id).success) {
    return { error: 'errors.validation_failed' };
  }

  const { data, error } = await session.supabase
    .from('scraper_sources')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return { error: 'admin.scrapers.notFound' };
  const source = data as ScraperSourceRow;

  if (source.fetcher === 'http' && !httpFetchingEnabled()) {
    // Answered before opening a run: a disabled deployment switch is a configuration fact, not a
    // failure worth recording against this source's health.
    return { error: 'admin.scrapers.httpDisabled' };
  }

  const pastedText = formData.get('pastedText');
  const schemeSlug = formData.get('schemeSlug');
  const input =
    source.fetcher === 'manual' && typeof pastedText === 'string' && typeof schemeSlug === 'string'
      ? { schemeSlug, text: pastedText, sourceUrl: source.source_url }
      : undefined;

  if (source.fetcher === 'manual' && !input) {
    return { error: 'admin.scrapers.manualNeedsInput' };
  }

  try {
    const outcome = await runScraperSource(session.supabase, source, {
      triggeredBy: session.userId,
      trigger: 'manual',
      input,
    });

    await writePlatformAuditLog(session.supabase, {
      actorUserId: session.userId,
      action: 'platform.scraper_run_triggered',
      entityType: 'scraper_run',
      entityId: outcome.runId,
      metadata: {
        sourceSlug: source.slug,
        status: outcome.status,
        staged: outcome.itemsStaged,
        skipped: outcome.itemsSkipped,
      },
    });

    revalidatePath(`/admin/scrapers/${id}`);
    revalidatePath('/admin/queue');
    revalidatePath('/admin/scrapers');

    return {
      notice: outcome.status === 'failed' ? 'admin.scrapers.runFailed' : 'admin.scrapers.runDone',
      runSummary: {
        found: outcome.itemsFound,
        staged: outcome.itemsStaged,
        skipped: outcome.itemsSkipped,
        warnings: outcome.warnings,
      },
    };
  } catch (runError) {
    logger.error('platform.run_source_failed', {
      sourceSlug: source.slug,
      reason: runError instanceof Error ? runError.name : 'unknown',
    });
    return { error: 'admin.scrapers.runFailed' };
  }
}
