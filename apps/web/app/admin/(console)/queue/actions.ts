'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isAppError } from '@assistigo/core';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { approveQueueItem, rejectQueueItem } from '@/lib/admin/scraper/publish';
import { logger } from '@/lib/api/logger';

/**
 * Reviewing the staging inbox.
 *
 * `platform.queue.review` is the permission that turns a scraped claim into advice a citizen acts
 * on, and it is deliberately not held by the role that runs the scrapers. A scraper operator
 * fills the inbox; a content manager empties it.
 */

export type QueueActionState = {
  error?: string;
  notice?: string;
  /** Which item the message belongs to, so a long inbox shows it on the right row. */
  itemId?: string;
};

const reviewSchema = z.object({
  itemId: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
});

export async function approveQueueItemAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.queue.review')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = reviewSchema.safeParse({
    itemId: formData.get('itemId'),
    note: (formData.get('note') as string) || undefined,
  });
  if (!parsed.success) return { error: 'errors.validation_failed' };

  try {
    const outcome = await approveQueueItem(session.supabase, {
      itemId: parsed.data.itemId,
      reviewerId: session.userId,
      note: parsed.data.note ?? null,
    });

    await writePlatformAuditLog(session.supabase, {
      actorUserId: session.userId,
      action: 'platform.queue_item_approved',
      entityType: 'scraped_schemes_queue',
      entityId: outcome.itemId,
      metadata: { slug: outcome.slug, publishedSchemeId: outcome.publishedSchemeId },
    });

    revalidatePath('/admin/queue');
    revalidatePath('/admin/schemes');
    revalidatePath('/admin/deadlines');
    return { notice: 'admin.queue.approved', itemId: outcome.itemId };
  } catch (error) {
    // A conflict here is the normal race — somebody else reviewed it first — so it gets its own
    // message rather than a generic failure.
    if (isAppError(error)) return { error: error.messageKey, itemId: parsed.data.itemId };
    logger.error('platform.queue_approve_failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return { error: 'errors.internal', itemId: parsed.data.itemId };
  }
}

export async function rejectQueueItemAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.queue.review')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = reviewSchema.safeParse({
    itemId: formData.get('itemId'),
    note: (formData.get('note') as string) || undefined,
  });
  if (!parsed.success) return { error: 'errors.validation_failed' };

  try {
    const outcome = await rejectQueueItem(session.supabase, {
      itemId: parsed.data.itemId,
      reviewerId: session.userId,
      note: parsed.data.note ?? null,
    });

    await writePlatformAuditLog(session.supabase, {
      actorUserId: session.userId,
      action: 'platform.queue_item_rejected',
      entityType: 'scraped_schemes_queue',
      entityId: outcome.itemId,
      metadata: { slug: outcome.slug },
    });

    revalidatePath('/admin/queue');
    return { notice: 'admin.queue.rejected', itemId: outcome.itemId };
  } catch (error) {
    if (isAppError(error)) return { error: error.messageKey, itemId: parsed.data.itemId };
    logger.error('platform.queue_reject_failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return { error: 'errors.internal', itemId: parsed.data.itemId };
  }
}
