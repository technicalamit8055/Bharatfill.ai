import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, parseQuery } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { openGrantDocument } from '@/lib/vault/operator';

const idSchema = z.string().uuid();
const querySchema = z.object({ purpose: z.enum(['viewed', 'attached']).default('viewed') });

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * GET /api/vault/grants/:id/documents/:docId/file?purpose=viewed|attached
 *
 * Decrypts and streams one document for a live grant. The access event is written before any
 * byte is read. Never cached; served inline under a neutral name (the document type), never the
 * citizen's title — there is no Download in the operator UI (design §4.3).
 */
export const GET = handler(
  'api.vault.grants.file',
  async (request, ctx: { params: Promise<{ id: string; docId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'vault.access');
    const params = await ctx.params;
    const grantId = idSchema.parse(params.id);
    const documentId = idSchema.parse(params.docId);
    const { purpose } = parseQuery(request, querySchema);

    const file = await openGrantDocument(
      operatorVaultContext(context),
      grantId,
      documentId,
      purpose,
    );
    const name = `${file.documentType}.${EXTENSIONS[file.mimeType] ?? 'bin'}`;
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.length),
        'content-disposition': `inline; filename="${name}"`,
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
      },
    });
  },
);
