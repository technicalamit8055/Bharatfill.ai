import 'server-only';

import {
  CLAIMABLE_DROP_STATUSES,
  DOCUMENT_BUCKET,
  DROP_SESSION_TTL_MINUTES,
  MAX_DROP_FILES_PER_SESSION,
  MAX_UPLOAD_BYTES,
  conflict,
  documentStoragePath,
  dropStoragePath,
  generateCounterCode,
  generateDropSessionCode,
  isAllowedUploadMimeType,
  isClaimableDropStatus,
  isDocumentType,
  notFound,
  suggestDocumentTypeFromHint,
  unsupportedMedia,
  validationFailed,
  type AllowedUploadMimeType,
  type ConvertDropSessionInput,
  type DocumentType,
  type DropChannel,
} from '@assistigo/core';
import { logger } from '../api/logger';
import { writeAuditLog } from '../api/audit';
import type { RequestContext } from '../api/context';
import { enqueueJob } from '../jobs/queue';
import { SNIFF_BYTE_COUNT, assertDeclaredTypeMatchesBytes } from '../documents/storage';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type {
  DocumentDropFileRow,
  DocumentDropSessionRow,
  OrganizationRow,
} from '../supabase/database.types';

/**
 * Walk-in document drop — the service layer.
 * Master spec §9.1 (walk-in intake), §12 (documents), §19.3 (private storage), §19.5 (audit).
 *
 * Two callers with very different authority use this file, and the split is deliberate:
 *
 *   - The **webhook** side (`resolveSessionForCode`, `saveInboundDropFile`, …) is reached by
 *     Meta and Telegram, who present no user session. Those functions take the service-role
 *     client and are the only ones that do. They can therefore never be handed a request
 *     context, which is what keeps an operator's request from accidentally running as one.
 *
 *   - The **operator** side (`createDropSession`, `listDropSessions`, `convertDropSession`) takes
 *     the caller's own Supabase client, so RLS is still the second gate on everything it does.
 *
 * The line between staging and customer data is `convertDropSession`, and it is the only place
 * that crosses it.
 */

/** How many times to retry a colliding session code before giving up. */
const CODE_ATTEMPTS = 6;

// ---------------------------------------------------------------------------
// Session creation (operator)
// ---------------------------------------------------------------------------

export type CreatedDropSession = {
  id: string;
  sessionCode: string;
  channel: DropChannel;
  expiresAt: string;
};

/**
 * Mints a desk session for the operator's own organization.
 *
 * Retries on a code collision rather than widening the code: four digits is what makes a code
 * readable across a counter, and `document_drop_sessions_live_code_key` only constrains codes
 * that are still live, so a collision is rare and a retry is cheap.
 */
export async function createDropSession(
  supabase: AssistigoSupabaseClient,
  input: { organizationId: string; channel: DropChannel; createdBy: string },
): Promise<CreatedDropSession> {
  const expiresAt = new Date(Date.now() + DROP_SESSION_TTL_MINUTES * 60_000).toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const sessionCode = generateDropSessionCode();

    const { data, error } = await supabase
      .from('document_drop_sessions')
      .insert({
        organization_id: input.organizationId,
        session_code: sessionCode,
        channel: input.channel,
        status: 'active',
        created_by: input.createdBy,
        expires_at: expiresAt,
      })
      .select('id, session_code, channel, expires_at')
      .single();

    if (!error && data) {
      const row = data as Pick<
        DocumentDropSessionRow,
        'id' | 'session_code' | 'channel' | 'expires_at'
      >;
      return {
        id: row.id,
        sessionCode: row.session_code,
        channel: row.channel as DropChannel,
        expiresAt: row.expires_at,
      };
    }

    // 23505 is the unique violation: another live session already holds this code.
    if (error && error.code !== '23505') throw error;
  }

  // Every attempt collided, which at four digits means an implausible number of live sessions.
  throw conflict('documentDrop.errors.codeUnavailable');
}

/**
 * The permanent code for this centre's printed standee, minting one if it has none.
 *
 * Called when an operator opens the drop dialog rather than at sign-up, so a centre that never
 * uses this feature never gets a code — and by the time they reach for "Print counter card", the
 * code the card needs already exists.
 *
 * The three-digit tail is random rather than sequential: a sequence would leak how many centres
 * are on the platform onto a laminated card sitting on a public counter.
 */
export async function ensureCounterCode(
  supabase: AssistigoSupabaseClient,
  organization: { id: string; name: string; counter_drop_code: string | null },
): Promise<string | null> {
  if (organization.counter_drop_code) return organization.counter_drop_code;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateCounterCode(organization.name, Math.floor(Math.random() * 1000));

    const { data, error } = await supabase
      .from('organizations')
      .update({ counter_drop_code: candidate })
      .eq('id', organization.id)
      // Conditional, so two operators opening the dialog at once produce one code rather than
      // the second overwriting the first — and the card already printed keeps working.
      .is('counter_drop_code', null)
      .select('counter_drop_code')
      .maybeSingle();

    if (!error && data) {
      return (data as { counter_drop_code: string | null }).counter_drop_code;
    }

    if (error && error.code !== '23505') {
      // Not a collision: an operator without `org.settings` cannot write this column, and that
      // is not worth failing their drop session over. They simply get no standee code.
      logger.warn('document_drop.counter_code_mint_failed', { dbError: error.message });
      return null;
    }

    if (!error && !data) {
      // The conditional update matched nothing: somebody else won the race. Read theirs.
      const { data: existing } = await supabase
        .from('organizations')
        .select('counter_drop_code')
        .eq('id', organization.id)
        .maybeSingle();
      return (existing as { counter_drop_code: string | null } | null)?.counter_drop_code ?? null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Session resolution (webhook — service role)
// ---------------------------------------------------------------------------

export type ResolvedDropSession = {
  id: string;
  organizationId: string;
  organizationName: string;
  sessionCode: string;
  channel: DropChannel;
  status: string;
  senderId: string | null;
  locale: 'en' | 'hi';
};

type SessionJoin = DocumentDropSessionRow & {
  organizations: Pick<OrganizationRow, 'id' | 'name' | 'preferred_locale'> | null;
};

function toResolved(row: SessionJoin): ResolvedDropSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? '',
    sessionCode: row.session_code,
    channel: row.channel as DropChannel,
    status: row.status,
    senderId: row.sender_id,
    locale: row.organizations?.preferred_locale ?? 'en',
  };
}

const SESSION_SELECT =
  'id, organization_id, session_code, channel, status, sender_id, expires_at, organizations(id, name, preferred_locale)';

/**
 * Turns the code in an inbound message into a session to file the citizen's documents against.
 *
 * A session code addresses one desk session directly. A permanent counter code addresses the
 * centre, and mints a fresh session per citizen — which is the whole point of a printed standee:
 * two people at the same counter must not end up in one intake, and that mixing is exactly what
 * the WhatsApp-Web routine this replaces does today.
 *
 * Returns null for an unknown or dead code. The caller answers the citizen plainly rather than
 * saying which of the two it was: this endpoint is reachable by anyone, and confirming which
 * codes exist would make it an oracle for enumerating live sessions.
 */
export type DropTarget =
  /** A live desk session, addressed directly by its own code. */
  | { kind: 'session'; session: ResolvedDropSession }
  /** A printed standee's code: a centre, with no session yet. */
  | { kind: 'counter'; organization: Pick<OrganizationRow, 'id' | 'name' | 'preferred_locale'> };

/**
 * Reads what a code points at, creating nothing.
 *
 * This is what the public drop page uses. It has to name the centre so the citizen can see they
 * are sending to the right counter, and it must not mint a session to do it — a page that
 * created one per load would put an empty row in the operator's queue every time somebody
 * reloaded, or worse, orphan the session holding files they had already sent.
 *
 * Minting is deferred to the first actual upload, which is the moment intake genuinely begins.
 */
export async function resolveDropTarget(
  admin: AssistigoSupabaseClient,
  code: string,
): Promise<DropTarget | null> {
  const { data: sessionData, error: sessionError } = await admin
    .from('document_drop_sessions')
    .select(SESSION_SELECT)
    .eq('session_code', code)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (sessionData) {
    return { kind: 'session', session: toResolved(sessionData as unknown as SessionJoin) };
  }

  const { data: orgData, error: orgError } = await admin
    .from('organizations')
    .select('id, name, preferred_locale')
    .eq('counter_drop_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!orgData) return null;

  return {
    kind: 'counter',
    organization: orgData as Pick<OrganizationRow, 'id' | 'name' | 'preferred_locale'>,
  };
}

export async function resolveSessionForCode(
  admin: AssistigoSupabaseClient,
  code: string,
  channel: DropChannel,
): Promise<ResolvedDropSession | null> {
  const { data: sessionData, error: sessionError } = await admin
    .from('document_drop_sessions')
    .select(SESSION_SELECT)
    .eq('session_code', code)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (sessionData) return toResolved(sessionData as unknown as SessionJoin);

  const { data: orgData, error: orgError } = await admin
    .from('organizations')
    .select('id, name, preferred_locale')
    .eq('counter_drop_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!orgData) return null;

  const organization = orgData as Pick<OrganizationRow, 'id' | 'name' | 'preferred_locale'>;
  const created = await createCounterSession(admin, organization, channel, code);
  return created;
}

/**
 * How many sessions one printed standee may mint per hour.
 *
 * A counter code is the only thing in this feature that creates a session without an
 * authenticated caller, so it is the only thing that needs a ceiling. Sixty is above what a busy
 * Jan Seva Kendra sees in an hour and far below what would matter if a code leaked: past it, the
 * citizen is told to ask the operator, who can open a session on screen instead.
 */
const COUNTER_SESSIONS_PER_HOUR = 60;

/** A session minted by a citizen scanning the permanent standee, not by an operator. */
async function createCounterSession(
  admin: AssistigoSupabaseClient,
  organization: Pick<OrganizationRow, 'id' | 'name' | 'preferred_locale'>,
  channel: DropChannel,
  counterCode: string,
): Promise<ResolvedDropSession | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const { count, error: countError } = await admin
    .from('document_drop_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organization.id)
    .eq('metadata->>counter_code', counterCode)
    .gte('created_at', oneHourAgo);

  if (countError) throw countError;

  if ((count ?? 0) >= COUNTER_SESSIONS_PER_HOUR) {
    logger.warn('document_drop.counter_code_rate_limited', {
      organizationId: organization.id,
      sessionsLastHour: count ?? 0,
    });
    return null;
  }

  const expiresAt = new Date(Date.now() + DROP_SESSION_TTL_MINUTES * 60_000).toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin
      .from('document_drop_sessions')
      .insert({
        organization_id: organization.id,
        session_code: generateDropSessionCode(),
        channel,
        status: 'active',
        expires_at: expiresAt,
        // Records which standee this came from, so the operator can tell a counter walk-in from
        // a session they opened on screen. A code, not a person.
        metadata: { counter_code: counterCode },
      })
      .select(SESSION_SELECT)
      .single();

    if (!error && data) {
      const row = data as unknown as SessionJoin;
      // The insert's join does not come back on every PostgREST version; fill from what we have.
      return {
        ...toResolved(row),
        organizationName: row.organizations?.name ?? organization.name,
        locale: row.organizations?.preferred_locale ?? organization.preferred_locale,
      };
    }

    if (error && error.code !== '23505') throw error;
  }

  return null;
}

/**
 * The live session a returning sender's files belong to.
 *
 * A citizen sends four photos in a row; only the first message carries the code. So after the
 * code binds a sender to a session, everything else from that sender goes to their most recent
 * live session on that channel.
 */
export async function findSessionForSender(
  admin: AssistigoSupabaseClient,
  channel: DropChannel,
  senderId: string,
): Promise<ResolvedDropSession | null> {
  const { data, error } = await admin
    .from('document_drop_sessions')
    .select(SESSION_SELECT)
    .eq('channel', channel)
    .eq('sender_id', senderId)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? toResolved(data as unknown as SessionJoin) : null;
}

/**
 * Binds the sender to the session they just opened.
 *
 * The name is the messaging profile name, stored because it pre-fills the customer's name on
 * intake and saves the operator typing it. Both fields are personal data and neither is ever
 * logged (§19.6).
 */
export async function bindSenderToSession(
  admin: AssistigoSupabaseClient,
  sessionId: string,
  sender: { senderId: string; senderName?: string | null },
): Promise<void> {
  const { error } = await admin
    .from('document_drop_sessions')
    .update({
      sender_id: sender.senderId,
      ...(sender.senderName ? { sender_name: sender.senderName.slice(0, 120) } : {}),
    })
    .eq('id', sessionId);

  if (error) throw error;
}

/** Marks the session as the citizen having said they are done. Not a lock — see the type note. */
export async function markSessionReady(
  admin: AssistigoSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await admin
    .from('document_drop_sessions')
    .update({ status: 'ready' })
    .eq('id', sessionId)
    .in('status', ['active']);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Inbound files
// ---------------------------------------------------------------------------

export type InboundFileInfo = {
  filename: string;
  /** What the channel claims. Not trusted — the bytes decide (docs/SECURITY.md §4). */
  declaredMimeType: string | null;
  /** The citizen's caption or the button they tapped. */
  hint?: string | null;
  /** An explicit choice from the web drop page, which outranks a text hint. */
  documentType?: DocumentType | null;
};

export type SavedDropFile = { id: string; suggestedDocumentType: DocumentType };

/**
 * Stores one inbound file against a session.
 *
 * Every check the operator upload path performs happens here too, in the same order, because
 * this path is strictly less trustworthy: the sender is a stranger and the metadata is theirs.
 *
 *   1. the session must still be claimable and under its file ceiling,
 *   2. the size must be within the same 15 MB limit as `documents`,
 *   3. the *bytes* decide the MIME type — a declared type that disagrees is rejected outright,
 *   4. only then is anything written to the private bucket.
 *
 * Nothing is uploaded before step 3, so a file that lied about what it is never lands in
 * storage at all — unlike the operator flow, which has to sniff after the fact because the
 * browser uploads directly.
 */
export async function saveInboundDropFile(
  admin: AssistigoSupabaseClient,
  session: { id: string; organizationId: string },
  info: InboundFileInfo,
  bytes: Uint8Array,
): Promise<SavedDropFile> {
  if (bytes.length === 0) throw validationFailed({ _: 'validation.file_empty' });
  if (bytes.length > MAX_UPLOAD_BYTES) throw validationFailed({ _: 'validation.file_too_large' });

  const { count, error: countError } = await admin
    .from('document_drop_files')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id);

  if (countError) throw countError;
  if ((count ?? 0) >= MAX_DROP_FILES_PER_SESSION) {
    throw conflict('documentDrop.errors.tooManyFiles');
  }

  // The declared type is a hint about which signature to expect; the sniffed type is the answer.
  // A file whose bytes match nothing we accept is refused before it can reach the bucket.
  const declared = info.declaredMimeType ?? '';
  const expected: AllowedUploadMimeType | null = isAllowedUploadMimeType(declared)
    ? declared
    : null;

  const head = bytes.subarray(0, SNIFF_BYTE_COUNT);
  if (expected) {
    assertDeclaredTypeMatchesBytes(head, expected);
  }
  const mimeType = expected ?? sniffOrReject(head);

  const fileId = crypto.randomUUID();
  const storagePath = dropStoragePath({
    organizationId: session.organizationId,
    sessionId: session.id,
    fileId,
    filename: info.filename,
  });

  const { error: uploadError } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

  if (uploadError) throw uploadError;

  const suggested =
    info.documentType && isDocumentType(info.documentType)
      ? info.documentType
      : suggestDocumentTypeFromHint(info.hint);

  const { data, error } = await admin
    .from('document_drop_files')
    .insert({
      id: fileId,
      session_id: session.id,
      organization_id: session.organizationId,
      original_filename: info.filename,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: bytes.length,
      suggested_document_type: suggested,
    })
    .select('id')
    .single();

  if (error) {
    // Leaving the object behind would be an orphan nothing points at, and the retention sweep
    // walks rows, not the bucket.
    await admin.storage
      .from(DOCUMENT_BUCKET)
      .remove([storagePath])
      .catch(() => undefined);
    throw error;
  }

  // Shape only. The filename routinely carries the citizen's name, and `sender_id` is their
  // phone number — neither belongs in a log line (§19.6).
  logger.info('document_drop.file_received', {
    sessionId: session.id,
    mimeType,
    sizeBytes: bytes.length,
    suggestedType: suggested,
  });

  return { id: (data as { id: string }).id, suggestedDocumentType: suggested };
}

function sniffOrReject(head: Uint8Array): AllowedUploadMimeType {
  const types: AllowedUploadMimeType[] = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  for (const candidate of types) {
    try {
      assertDeclaredTypeMatchesBytes(head, candidate);
      return candidate;
    } catch {
      // Try the next signature.
    }
  }
  throw unsupportedMedia('errors.unsupported_media');
}

// ---------------------------------------------------------------------------
// The operator queue
// ---------------------------------------------------------------------------

export type DropQueueFile = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  suggestedDocumentType: DocumentType;
};

export type DropQueueSession = {
  id: string;
  sessionCode: string;
  channel: DropChannel;
  status: string;
  /** Masked. The full number is never sent to a client that has not asked for it (§19.3). */
  senderMasked: string | null;
  senderName: string | null;
  expiresAt: string;
  createdAt: string;
  files: DropQueueFile[];
};

type QueueRow = DocumentDropSessionRow & {
  document_drop_files: Pick<
    DocumentDropFileRow,
    | 'id'
    | 'original_filename'
    | 'mime_type'
    | 'size_bytes'
    | 'suggested_document_type'
    | 'storage_bucket'
    | 'storage_path'
    | 'created_at'
  >[];
};

/**
 * The live walk-in queue.
 *
 * Sessions with no file yet are included: the operator needs to see that somebody has scanned
 * and is mid-upload, otherwise the queue looks empty while a citizen is standing there.
 *
 * No signed preview URLs. The operator decides from the citizen's own type hints, and the bytes
 * are reached from the customer profile that intake lands them on — where reading a document is
 * the separate, audited action it is everywhere else (§19.3).
 */
export async function listDropSessions(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<DropQueueSession[]> {
  const { data, error } = await supabase
    .from('document_drop_sessions')
    .select(
      'id, session_code, channel, status, sender_id, sender_name, expires_at, created_at, document_drop_files(id, original_filename, mime_type, size_bytes, suggested_document_type, storage_bucket, storage_path, created_at)',
    )
    .eq('organization_id', organizationId)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 20);

  if (error) throw error;

  const rows = (data ?? []) as unknown as QueueRow[];

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      sessionCode: row.session_code,
      channel: row.channel as DropChannel,
      status: row.status,
      senderMasked: maskSender(row.sender_id),
      senderName: row.sender_name,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      files: await Promise.all(
        [...(row.document_drop_files ?? [])]
          .sort((left, right) => left.created_at.localeCompare(right.created_at))
          .map(async (file) => ({
            id: file.id,
            filename: file.original_filename,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
            suggestedDocumentType: isDocumentType(file.suggested_document_type)
              ? file.suggested_document_type
              : 'unknown',
          })),
      ),
    })),
  );
}

/**
 * Last four digits only, which is all an operator needs to match the queue row to the person in
 * front of them (§19.3). A Telegram chat id is numeric too, so the same rule covers both.
 */
function maskSender(senderId: string | null): string | null {
  if (!senderId) return null;
  const digits = senderId.replace(/\D+/g, '');
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Conversion — the one place staging becomes customer data
// ---------------------------------------------------------------------------

export type ConvertedDropSession = {
  customerId: string;
  documentIds: string[];
  /** Files that could not be promoted. The session keeps them so the operator can retry. */
  failedFileIds: string[];
  queuedExtractions: number;
};

/**
 * Turns a drop session into a customer profile and real documents, and queues extraction.
 *
 * Order matters and is not arbitrary:
 *
 *   1. Claim the session first, with a conditional update. That is what makes the intake button
 *      safe to double-click and what stops the retention sweep expiring a session mid-conversion
 *      — whoever moves the status out of `active`/`ready` first wins, and the loser gets a plain
 *      "already taken" instead of a duplicated customer.
 *   2. Resolve the customer: an existing profile if the operator picked one, otherwise a new one
 *      pre-filled with the sender's number, which is the time saving this whole feature is for.
 *   3. Per file: copy the bytes to the canonical document path, insert the `documents` row, then
 *      delete the staged copy. Copy-then-delete rather than move, so a failed insert leaves the
 *      original in place and the operator can press the button again.
 *   4. Queue `ocr.extract` per document, through the same RPC the upload path uses — so the
 *      database re-checks the caller's role rather than trusting this code.
 *
 * The operator verification gate is untouched: extraction proposes, review accepts (§12.6).
 */
export async function convertDropSession(
  context: RequestContext,
  sessionId: string,
  input: ConvertDropSessionInput,
): Promise<ConvertedDropSession> {
  const organizationId = context.organization.id;

  const { data: sessionData, error: sessionError } = await context.supabase
    .from('document_drop_sessions')
    .select('id, status, sender_id, sender_name, expires_at')
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!sessionData) throw notFound('errors.not_found');

  const session = sessionData as Pick<
    DocumentDropSessionRow,
    'id' | 'status' | 'sender_id' | 'sender_name' | 'expires_at'
  >;
  if (!isClaimableDropStatus(session.status)) {
    throw conflict('documentDrop.errors.alreadyClaimed');
  }

  const { data: files, error: filesError } = await context.supabase
    .from('document_drop_files')
    .select(
      'id, original_filename, storage_bucket, storage_path, mime_type, size_bytes, suggested_document_type',
    )
    .eq('session_id', sessionId)
    .eq('organization_id', organizationId)
    .is('converted_document_id', null)
    .order('created_at', { ascending: true });

  if (filesError) throw filesError;

  const staged = (files ?? []) as Pick<
    DocumentDropFileRow,
    | 'id'
    | 'original_filename'
    | 'storage_bucket'
    | 'storage_path'
    | 'mime_type'
    | 'size_bytes'
    | 'suggested_document_type'
  >[];

  if (staged.length === 0) throw conflict('documentDrop.errors.noFiles');

  // Step 1 — claim. Conditional on the status we just read, so two operators racing produce one
  // customer and one clear refusal rather than two profiles for the same walk-in.
  const { data: claimed, error: claimError } = await context.supabase
    .from('document_drop_sessions')
    .update({ status: 'converted', converted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .select('id')
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) throw conflict('documentDrop.errors.alreadyClaimed');

  try {
    const customerId = await resolveCustomer(context, session, input);

    const documentIds: string[] = [];
    const failedFileIds: string[] = [];

    for (const file of staged) {
      const documentId = crypto.randomUUID();
      const targetPath = documentStoragePath({
        organizationId,
        customerId,
        documentId,
        filename: file.original_filename,
      });

      try {
        const { error: copyError } = await context.supabase.storage
          .from(file.storage_bucket)
          .copy(file.storage_path, targetPath);
        if (copyError) throw copyError;

        const { error: insertError } = await context.supabase.from('documents').insert({
          id: documentId,
          organization_id: organizationId,
          customer_id: customerId,
          original_filename: file.original_filename,
          storage_bucket: file.storage_bucket,
          storage_path: targetPath,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          // The citizen's hint, carried across as a starting point. Classification still runs.
          document_type: file.suggested_document_type,
          status: 'uploaded',
          uploaded_by: context.userId,
        });

        if (insertError) {
          await context.supabase.storage
            .from(file.storage_bucket)
            .remove([targetPath])
            .catch(() => undefined);
          throw insertError;
        }

        await context.supabase
          .from('document_drop_files')
          .update({ converted_document_id: documentId })
          .eq('id', file.id)
          .eq('organization_id', organizationId);

        // The staged copy has served its purpose. A failure here is untidy, not unsafe: the
        // object is org-scoped and the sweep will not find it, so it is logged for cleanup.
        const { error: removeError } = await context.supabase.storage
          .from(file.storage_bucket)
          .remove([file.storage_path]);
        if (removeError) {
          logger.warn('document_drop.staged_remove_failed', {
            sessionId,
            dbError: removeError.message,
          });
        }

        documentIds.push(documentId);
      } catch (thrown) {
        // One bad file must not cost the operator the other five.
        logger.error('document_drop.file_promote_failed', {
          sessionId,
          reason: thrown instanceof Error ? thrown.message : 'unknown',
        });
        failedFileIds.push(file.id);
      }
    }

    let queuedExtractions = 0;
    for (const documentId of documentIds) {
      try {
        await enqueueJob(context.supabase, {
          type: 'ocr.extract',
          organizationId,
          payload: { documentId, extractionMode: 'auto' },
          idempotencyKey: `ocr.extract:${documentId}`,
        });
        queuedExtractions += 1;
      } catch (thrown) {
        // The document exists and is visible; the operator can press Read on it. Losing the
        // enqueue is not worth losing the intake over.
        logger.error('document_drop.enqueue_failed', {
          documentId,
          reason: thrown instanceof Error ? thrown.message : 'unknown',
        });
      }
    }

    await context.supabase
      .from('document_drop_sessions')
      .update({ customer_id: customerId })
      .eq('id', sessionId)
      .eq('organization_id', organizationId);

    await writeAuditLog(context, {
      action: 'drop_session.converted',
      entityType: 'document_drop_session',
      entityId: sessionId,
      // Counts and the channel-neutral shape of the intake. No sender id, no filename, no name
      // — `redact()` would strip them anyway, and they have no business being offered.
      metadata: {
        documentCount: documentIds.length,
        failedCount: failedFileIds.length,
        queuedExtractions,
        createdCustomer: !input.customerId,
      },
    });

    return { customerId, documentIds, failedFileIds, queuedExtractions };
  } catch (thrown) {
    // Conversion failed after the claim. Hand the session back so the operator can retry rather
    // than leaving a walk-in stranded in a status nothing will ever pick up.
    await context.supabase
      .from('document_drop_sessions')
      .update({ status: 'ready', converted_at: null })
      .eq('id', sessionId)
      .eq('organization_id', organizationId)
      .eq('status', 'converted');
    throw thrown;
  }
}

/**
 * The customer the documents attach to.
 *
 * An operator-picked profile is verified to belong to this organization first: RLS would refuse
 * a foreign id on the join anyway, but failing here gives them a real message instead of a
 * constraint error.
 *
 * A new profile is created unverified and deliberately thin — the sender's number and whatever
 * name the messaging profile carried. Everything else arrives through extraction and review,
 * which is the only path that writes to a confirmed profile (§12.6).
 */
async function resolveCustomer(
  context: RequestContext,
  session: Pick<DocumentDropSessionRow, 'sender_id' | 'sender_name'>,
  input: ConvertDropSessionInput,
): Promise<string> {
  const organizationId = context.organization.id;

  if (input.customerId) {
    const { data, error } = await context.supabase
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('errors.not_found');
    return (data as { id: string }).id;
  }

  const mobile = normalizeSenderMobile(session.sender_id);
  const fullName = input.fullName ?? session.sender_name ?? null;

  const { data, error } = await context.supabase
    .from('customers')
    .insert({
      organization_id: organizationId,
      // A walk-in whose name nobody has typed yet still needs a row; the profile screen prompts
      // for it. The placeholder is a label, not a claim about a person.
      full_name: fullName && fullName.trim().length >= 2 ? fullName.trim() : 'Walk-in customer',
      ...(mobile ? { mobile } : {}),
      verification_status: 'unverified',
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select('id')
    .single();

  if (error) throw error;

  await writeAuditLog(context, {
    action: 'customer.created',
    entityType: 'customer',
    entityId: (data as { id: string }).id,
    metadata: { source: 'document_drop' },
  });

  return (data as { id: string }).id;
}

/**
 * The sender identifier as an Indian mobile number, or nothing.
 *
 * WhatsApp reports `919000000000`; the column holds the ten-digit form the rest of the app
 * searches on. A Telegram chat id is a numeric account id and is *not* a phone number, so
 * anything that is not a plausible Indian mobile is dropped rather than stored as one — a wrong
 * number on a profile is worse than a blank field.
 */
export function normalizeSenderMobile(senderId: string | null): string | null {
  if (!senderId) return null;
  const digits = senderId.replace(/\D+/g, '');
  const tail = digits.slice(-10);
  if (tail.length !== 10) return null;
  if (!/^[6-9]/.test(tail)) return null;
  // A chat id long enough to only coincidentally end in mobile-shaped digits is not a number.
  if (digits.length > 13) return null;
  return tail;
}

// ---------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------

/**
 * Drops a session the operator does not want, bytes and all.
 *
 * Marked `abandoned` before the objects go, so the same ordering rule as the sweep holds: once
 * the status has moved, nothing can claim it while its files are being removed.
 */
export async function discardDropSession(
  context: RequestContext,
  sessionId: string,
): Promise<{ removedFiles: number }> {
  const organizationId = context.organization.id;

  const { data: claimed, error: claimError } = await context.supabase
    .from('document_drop_sessions')
    .update({ status: 'abandoned' })
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .in('status', CLAIMABLE_DROP_STATUSES)
    .select('id')
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) throw notFound('errors.not_found');

  const { data: files, error: filesError } = await context.supabase
    .from('document_drop_files')
    .select('id, storage_bucket, storage_path')
    .eq('session_id', sessionId)
    .eq('organization_id', organizationId);

  if (filesError) throw filesError;

  const rows = (files ?? []) as Pick<
    DocumentDropFileRow,
    'id' | 'storage_bucket' | 'storage_path'
  >[];

  for (const file of rows) {
    const { error } = await context.supabase.storage
      .from(file.storage_bucket)
      .remove([file.storage_path]);
    if (error) {
      logger.warn('document_drop.discard_remove_failed', { sessionId, dbError: error.message });
    }
  }

  const { error: deleteError } = await context.supabase
    .from('document_drop_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('organization_id', organizationId);

  if (deleteError) throw deleteError;

  await writeAuditLog(context, {
    action: 'drop_session.discarded',
    entityType: 'document_drop_session',
    entityId: sessionId,
    metadata: { fileCount: rows.length },
  });

  return { removedFiles: rows.length };
}
