import 'server-only';

import type { DropChannel } from '@assistigo/core';
import { logger } from '../api/logger';
import type { AssistigoSupabaseClient } from '../supabase/server';
import {
  bindSenderToSession,
  findSessionForSender,
  markSessionReady,
  resolveSessionForCode,
  saveInboundDropFile,
  type ResolvedDropSession,
} from './service';
import {
  doneMessage,
  noSessionMessage,
  receivedMessage,
  rejectedFileMessage,
  unknownCodeMessage,
  welcomeMessage,
} from './messages';

/**
 * The channel-independent half of intake.
 *
 * WhatsApp and Telegram differ only in how a message is authenticated, shaped and answered.
 * What happens to it — resolve a code to a session, bind the sender, store a file, count it,
 * reply — is identical, and duplicating it per channel is how the two quietly drift into
 * enforcing different limits. So each webhook normalises its payload and hands the result here.
 *
 * Every function returns the text to send back rather than sending it, so this file needs no
 * network access and the suite can assert on what a citizen would have been told.
 */

export type IntakeReply = { text: string } | null;

export type IntakeDeps = {
  admin: AssistigoSupabaseClient;
  channel: DropChannel;
};

/** The citizen opened the chat with a code from a QR or a standee. */
export async function handleStart(
  deps: IntakeDeps,
  input: { code: string; senderId: string; senderName: string | null },
): Promise<IntakeReply> {
  const session = await resolveSessionForCode(deps.admin, input.code, deps.channel);
  if (!session) return { text: unknownCodeMessage() };

  await bindSenderToSession(deps.admin, session.id, {
    senderId: input.senderId,
    senderName: input.senderName,
  });

  logger.info('document_drop.session_opened', {
    sessionId: session.id,
    channel: deps.channel,
    organizationId: session.organizationId,
  });

  return { text: welcomeMessage(session.organizationName) };
}

/** The citizen says they are finished. */
export async function handleDone(
  deps: IntakeDeps,
  senderId: string,
): Promise<IntakeReply> {
  const session = await findSessionForSender(deps.admin, deps.channel, senderId);
  if (!session) return { text: noSessionMessage() };

  await markSessionReady(deps.admin, session.id);
  return { text: doneMessage() };
}

export type InboundMedia = {
  filename: string;
  declaredMimeType: string | null;
  caption: string | null;
  /** Resolved lazily, so a sender with no session never causes a media download. */
  download: () => Promise<Uint8Array | null>;
};

/**
 * A file arrived.
 *
 * The session is resolved *before* the bytes are fetched. A stranger messaging the bot with no
 * live session should cost one database lookup, not a download from Meta's CDN — otherwise the
 * bot's number is a free bandwidth amplifier for anyone who finds it.
 */
export async function handleMedia(
  deps: IntakeDeps,
  input: { senderId: string; senderName: string | null; media: InboundMedia },
): Promise<IntakeReply> {
  const session = await findSessionForSender(deps.admin, deps.channel, input.senderId);
  if (!session) return { text: noSessionMessage() };

  const bytes = await input.media.download();
  if (!bytes) return { text: rejectedFileMessage() };

  try {
    await saveInboundDropFile(
      deps.admin,
      { id: session.id, organizationId: session.organizationId },
      {
        filename: input.media.filename,
        declaredMimeType: input.media.declaredMimeType,
        hint: input.media.caption,
      },
      bytes,
    );
  } catch (thrown) {
    // A rejected file is an ordinary outcome here — a citizen sends a voice note, a 30 MB scan,
    // or an eleventh document. The citizen is told plainly; nothing about their file is logged.
    logger.info('document_drop.file_rejected', {
      sessionId: session.id,
      channel: deps.channel,
      reason: thrown instanceof Error ? thrown.name : 'unknown',
    });
    return { text: rejectedFileMessage() };
  }

  const count = await countSessionFiles(deps.admin, session.id);
  return { text: receivedMessage(count) };
}

async function countSessionFiles(
  admin: AssistigoSupabaseClient,
  sessionId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('document_drop_files')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error) throw error;
  return count ?? 0;
}

export type { ResolvedDropSession };
