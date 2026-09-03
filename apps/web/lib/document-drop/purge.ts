import 'server-only';

import { logger } from '../api/logger';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { DocumentDropFileRow } from '../supabase/database.types';

/**
 * Retention sweep for unclaimed walk-in intake.
 * Master spec §12.7, §19.3.
 *
 * A drop session holds a citizen's identity documents *outside* the customer record — nobody
 * has accepted responsibility for them yet. So the unclaimed ones do not linger: two hours after
 * they are opened, the rows and the bytes both go.
 *
 * The order is the whole design:
 *
 *   1. Mark stale live sessions `expired`. Conversion and discard both require a claimable
 *      status, so this single statement is what makes the rest safe — once a session is marked,
 *      no operator can be halfway through claiming it while its files are deleted.
 *   2. Read the file rows, then delete the storage objects. Postgres cannot reach the storage
 *      backend, which is why this is not all one SQL function.
 *   3. Delete those sessions' rows, cascading their files. Scoped to the batch from step 2, so a
 *      row — the only thing that points at an object — never outlives its bytes or the reverse.
 *
 * Runs with the service-role client — a permitted caller, as the scheduled worker
 * (docs/SECURITY.md §2).
 */

export type DropPurgeResult = {
  sessionsExpired: number;
  objectsRemoved: number;
  sessionsDeleted: number;
  /** True when there was more to sweep than one run handles; the next run picks it up. */
  moreRemaining: boolean;
};

/**
 * How many sessions one run strips.
 *
 * A ceiling, not a target. `.in('session_id', ids)` becomes a query string, so an unbounded list
 * after a backlog or an outage would produce a request too long to send — and the sweep would
 * then fail forever, which is the one outcome a retention job must not have. The scheduler runs
 * often enough that a backlog drains over a few cycles.
 */
const SESSIONS_PER_RUN = 200;

export async function purgeExpiredDropSessions(
  admin: AssistigoSupabaseClient,
): Promise<DropPurgeResult> {
  // Step 1 — mark, and learn which sessions are now safe to strip.
  const { data: expired, error: expireError } = await admin
    .from('document_drop_sessions')
    .update({ status: 'expired' })
    .in('status', ['active', 'ready'])
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (expireError) throw expireError;

  const sessionIds = ((expired ?? []) as { id: string }[]).map((row) => row.id);

  // Step 2 — every session already sitting in a terminal-but-undeleted state, not just the ones
  // this run marked. A previous run that died between marking and deleting left work behind.
  const { data: terminal, error: terminalError } = await admin
    .from('document_drop_sessions')
    .select('id')
    .in('status', ['expired', 'abandoned'])
    .order('updated_at', { ascending: true })
    // Oldest first, so the sessions that have been waiting longest to be deleted go first.
    .limit(SESSIONS_PER_RUN);

  if (terminalError) throw terminalError;

  const terminalIds = ((terminal ?? []) as { id: string }[]).map((row) => row.id);
  const doomed = Array.from(new Set(terminalIds)).slice(0, SESSIONS_PER_RUN);
  const moreRemaining = terminalIds.length >= SESSIONS_PER_RUN;

  let objectsRemoved = 0;

  if (doomed.length > 0) {
    const { data: files, error: filesError } = await admin
      .from('document_drop_files')
      .select('id, storage_bucket, storage_path, converted_document_id')
      .in('session_id', doomed);

    if (filesError) throw filesError;

    const rows = (files ?? []) as Pick<
      DocumentDropFileRow,
      'id' | 'storage_bucket' | 'storage_path' | 'converted_document_id'
    >[];

    // Group by bucket so each bucket takes one remove call rather than one per object.
    const byBucket = new Map<string, string[]>();
    for (const file of rows) {
      // A promoted file's bytes now live at the document path and the staged copy is already
      // gone; deleting by this path again would be harmless but pointless.
      if (file.converted_document_id) continue;
      const paths = byBucket.get(file.storage_bucket) ?? [];
      paths.push(file.storage_path);
      byBucket.set(file.storage_bucket, paths);
    }

    for (const [bucket, paths] of byBucket) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        // Do not delete the rows this run: without them the objects become unreachable orphans.
        // Leaving both means the next sweep tries again.
        logger.error('document_drop.purge_storage_failed', {
          bucket,
          pathCount: paths.length,
          dbError: error.message,
        });
        return {
          sessionsExpired: sessionIds.length,
          objectsRemoved,
          sessionsDeleted: 0,
          moreRemaining: true,
        };
      }
      objectsRemoved += paths.length;
    }
  }

  /*
   * Step 3 — the rows, scoped to the batch whose objects were just removed.
   *
   * Deliberately not `purge_expired_document_drops()`, which deletes every expired session there
   * is: with a batch cap in place that would drop rows whose bytes are still in the bucket, and
   * a row is the only thing that points at an object. That function remains the DB-side
   * equivalent for a pg_cron deployment; here the ids are already known.
   */
  let sessionsDeleted = 0;

  if (doomed.length > 0) {
    const { data: deleted, error: deleteError } = await admin
      .from('document_drop_sessions')
      .delete()
      .in('id', doomed)
      .select('id');

    if (deleteError) throw deleteError;
    sessionsDeleted = ((deleted ?? []) as { id: string }[]).length;
  }

  const result: DropPurgeResult = {
    sessionsExpired: sessionIds.length,
    objectsRemoved,
    sessionsDeleted,
    moreRemaining,
  };

  if (result.sessionsDeleted > 0 || result.objectsRemoved > 0) {
    logger.info('document_drop.purged', result);
  }

  return result;
}
