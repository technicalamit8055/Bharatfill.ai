import { z } from 'zod';
import { notFound, permissionDenied, simulateDropSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { isProduction } from '@/lib/env';
import { buildSimulatedFile } from '@/lib/document-drop/fixtures';
import {
  bindSenderToSession,
  saveInboundDropFile,
  type SavedDropFile,
} from '@/lib/document-drop/service';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { DocumentDropSessionRow } from '@/lib/supabase/database.types';

const idSchema = z.string().uuid();

/**
 * POST /api/document-drop/sessions/:id/simulate — drop invented files into a session (§32.1).
 *
 * Why this exists: almost nobody developing, reviewing or demoing this has a live Meta WhatsApp
 * Business number, and an intake feature that can only be exercised with one is a feature nobody
 * checks. The simulated files travel the real path — sniffed, stored in the private bucket,
 * queued for extraction, reviewed — so what it proves is real.
 *
 * Three gates, because a route that writes documents on demand deserves them:
 *
 *   1. **Off in production.** Not a flag an operator can flip; it is the deployment environment.
 *   2. **The caller's own organization.** The session id is checked against it through the
 *      caller's client, so RLS is the second gate as everywhere else.
 *   3. **Invented data only.** No bytes are accepted from the request. The body names fixtures
 *      from `DEMO_DOCUMENTS`; anything else is a validation failure.
 */
export const POST = handler(
  'api.document_drop.simulate',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    // Production intake must only ever contain what a citizen actually sent. A demo document in
    // a real centre's queue is a document an operator could file against a real person.
    if (isProduction()) throw notFound('errors.not_found');

    const context = await resolveContext(request);
    requirePermission(context, 'document.upload');

    const sessionId = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, simulateDropSchema);

    const { data, error } = await context.supabase
      .from('document_drop_sessions')
      .select('id, organization_id, status, channel')
      .eq('id', sessionId)
      .eq('organization_id', context.organization.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('errors.not_found');

    const session = data as Pick<
      DocumentDropSessionRow,
      'id' | 'organization_id' | 'status' | 'channel'
    >;
    if (session.status !== 'active' && session.status !== 'ready') {
      throw permissionDenied('documentDrop.errors.alreadyClaimed');
    }

    // Intake normally runs as the service role, because its real caller is a webhook with no
    // session. The simulator uses the same path rather than a parallel one, so what it exercises
    // is the code that will actually run in production.
    const admin = createSupabaseAdminClient();

    // A test number from the reserved 99000 range (docs/DATABASE.md §7), unless the caller
    // supplied one — never a real subscriber number.
    const senderId = input.senderId ?? '9900000123';
    await bindSenderToSession(admin, session.id, {
      senderId,
      senderName: 'Simulated walk-in',
    });

    const saved: SavedDropFile[] = [];
    for (const fixture of input.fixtures) {
      const file = buildSimulatedFile(fixture);
      saved.push(
        await saveInboundDropFile(
          admin,
          { id: session.id, organizationId: session.organization_id },
          {
            filename: file.filename,
            declaredMimeType: file.mimeType,
            hint: file.caption,
          },
          file.bytes,
        ),
      );
    }

    return ok({
      sessionId: session.id,
      files: saved.map((file) => ({
        id: file.id,
        suggestedDocumentType: file.suggestedDocumentType,
      })),
    });
  },
);
