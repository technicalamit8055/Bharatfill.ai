import {
  MAX_UPLOAD_BYTES,
  isDocumentType,
  normalizeDropCode,
  notFound,
  validationFailed,
  type DocumentType,
} from '@assistigo/core';
import { handler, ok } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { resolveSessionForCode, saveInboundDropFile } from '@/lib/document-drop/service';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * The zero-install web drop — `POST /api/document-drop/public/:code` (§9.1).
 *
 * The citizen's own phone talks to this, with no account and no session, which makes it the most
 * exposed surface in the product. What keeps that acceptable:
 *
 *   - **A valid live code is the only key.** An unknown, expired or claimed code is a flat 404
 *     with no hint about which — this endpoint must not become a way to enumerate live sessions
 *     or discover which centres exist.
 *   - **It only ever adds.** There is no read of anything already in the session, no listing, no
 *     preview. A leaked code lets somebody put a document in; it never lets them take one out.
 *   - **Every limit the operator path has.** Same 15 MB ceiling, same MIME allow-list decided by
 *     sniffing the bytes, same per-session file cap, same private bucket, same org-scoped path.
 *   - **A counter code mints at most one session per upload, under an hourly ceiling.** The
 *     ceiling lives in `createCounterSession`, because this is the only path in the feature that
 *     creates a session with no authenticated caller.
 *
 * One file per request, rather than a batch, so a citizen on a patchy mobile connection at a
 * counter gets per-file progress and a per-file retry instead of losing four photos to one
 * timeout. The response carries the resolved session code so the client sends the rest of their
 * documents to the same session — a standee code must not mint a session per photo.
 *
 * The web channel needs no third-party credentials, which is why it is the fallback that always
 * works: a citizen without WhatsApp, or a deployment with no messaging channel configured.
 */
export const POST = handler(
  'api.document_drop.public_upload',
  async (request, ctx: { params: Promise<{ code: string }> }) => {
    const code = normalizeDropCode(decodeURIComponent((await ctx.params).code));
    // The same `notFound` for a malformed code, an unknown one, an expired one and one whose
    // intake an operator has already claimed. Distinguishing them would tell a caller which
    // codes are real.
    if (!code) throw notFound('documentDrop.errors.sessionNotFound');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw validationFailed({ _: 'errors.invalid_json' });
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw validationFailed({ file: 'validation.file_required' });
    if (file.size === 0) throw validationFailed({ file: 'validation.file_empty' });
    // Checked before the code is resolved and before the body is buffered, so an oversized
    // upload costs nothing — and cannot be used to mint a session either.
    if (file.size > MAX_UPLOAD_BYTES) throw validationFailed({ file: 'validation.file_too_large' });

    // Service role, because the caller is the public: there is no user whose RLS could apply.
    // Authorization is the code, and the write is confined to the one session it resolves to.
    const admin = createSupabaseAdminClient();

    const session = await resolveSessionForCode(admin, code, 'web');
    if (!session) throw notFound('documentDrop.errors.sessionNotFound');

    const declaredType = form.get('documentType');
    const documentType: DocumentType | null =
      typeof declaredType === 'string' && isDocumentType(declaredType) ? declaredType : null;

    const saved = await saveInboundDropFile(
      admin,
      { id: session.id, organizationId: session.organizationId },
      {
        // The citizen's own filename, sanitised into the storage path by `dropStoragePath`.
        filename: file.name === '' ? 'upload' : file.name,
        declaredMimeType: file.type === '' ? null : file.type,
        documentType,
      },
      new Uint8Array(await file.arrayBuffer()),
    );

    const { count, error } = await admin
      .from('document_drop_files')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    if (error) throw error;

    logger.info('document_drop.web_upload', {
      sessionId: session.id,
      organizationId: session.organizationId,
      sizeBytes: file.size,
    });

    return ok({
      fileId: saved.id,
      suggestedDocumentType: saved.suggestedDocumentType,
      fileCount: count ?? 1,
      /**
       * The session this landed in. The client sends every subsequent file here, so a standee
       * code resolves once per citizen rather than once per photo.
       */
      sessionCode: session.sessionCode,
    });
  },
);
