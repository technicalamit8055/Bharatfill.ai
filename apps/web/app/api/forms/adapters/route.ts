import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseQuery } from '@/lib/api/response';
import { loadAdapterCatalog } from '@/lib/forms/adapters';

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  region: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'testing', 'active', 'deprecated']).optional(),
});

/**
 * GET /api/forms/adapters — the catalogue behind the Form Library (§17, §21.4).
 */
export const GET = handler('api.forms.adapters.list', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'fill.run');
  const query = parseQuery(request, querySchema);

  const catalog = await loadAdapterCatalog(context.supabase, context.organization.id);

  const items = catalog
    .filter((adapter) => !query.status || adapter.status === query.status)
    .filter((adapter) => !query.region || adapter.region === query.region)
    .filter((adapter) => {
      if (!query.q) return true;
      const haystack = `${adapter.portalName} ${adapter.formName} ${adapter.region ?? ''}`.toLowerCase();
      return haystack.includes(query.q.toLowerCase());
    });

  return ok({ adapters: items });
});
