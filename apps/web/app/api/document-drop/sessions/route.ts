import { createDropSessionSchema, validationFailed } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { availableDropChannels, buildDropLinks } from '@/lib/document-drop/links';
import {
  createDropSession,
  ensureCounterCode,
  listDropSessions,
} from '@/lib/document-drop/service';

/**
 * GET /api/document-drop/sessions — the live walk-in queue (§9.1).
 *
 * Polled by the dashboard widget, so it is deliberately cheap and returns masked sender numbers
 * only. `document.view` rather than `document.upload`: a viewer is allowed to see that somebody
 * is waiting at the counter, they just cannot claim the intake.
 */
export const GET = handler('api.document_drop.list', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'document.view');

  const sessions = await listDropSessions(context.supabase, context.organization.id);

  return ok({ sessions, channels: await availableDropChannels() });
});

/**
 * POST /api/document-drop/sessions — open a desk session and get its QR links.
 *
 * Auditable because a live session code is, for as long as it lasts, a way for anyone who can
 * read it to put documents into this organization.
 */
export const POST = handler('api.document_drop.create', async (request) => {
  const context = await resolveContext(request);
  // The same permission that governs bringing a document into the organization.
  requirePermission(context, 'document.upload');

  const input = await parseBody(request, createDropSessionSchema);

  // A channel with no credentials configured cannot be offered: the citizen would scan a QR
  // pointing at a bot that will never answer.
  if (!(await availableDropChannels()).includes(input.channel)) {
    throw validationFailed({ channel: 'documentDrop.errors.channelUnavailable' });
  }

  const session = await createDropSession(context.supabase, {
    organizationId: context.organization.id,
    channel: input.channel,
    createdBy: context.userId,
  });

  await writeAuditLog(context, {
    action: 'drop_session.created',
    entityType: 'document_drop_session',
    entityId: session.id,
    metadata: { channel: session.channel },
  });

  // Minted here rather than at sign-up, so a centre that never uses walk-in drop never gets a
  // code — and the printable counter card the dialog links to has one by the time the operator
  // clicks through to it. The return value is unused: the standee page reads the column itself,
  // and an operator whose role cannot write it simply gets no card (see ensureCounterCode).
  await ensureCounterCode(context.supabase, {
    id: context.organization.id,
    name: context.organization.name,
    counter_drop_code: context.organization.counter_drop_code,
  });

  return created({ session, links: await buildDropLinks(session.sessionCode) });
});
