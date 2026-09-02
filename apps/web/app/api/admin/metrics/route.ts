import { z } from 'zod';
import { requirePlatformPermission, resolvePlatformContext } from '@/lib/admin/context';
import { handler, ok, parseQuery } from '@/lib/api/response';
import { loadPlatformMetrics } from '@/lib/admin/metrics';

const querySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * GET /api/admin/metrics — the aggregate dashboard, for monitoring and internal reporting.
 *
 * Returns exactly what `/admin` renders and comes from the same `platform_metrics()` RPC: counts
 * and nothing else. There is no tenant-scoped variant of this endpoint and no `organizationId`
 * parameter, because a per-tenant drill-down is the thing spec §6.1 does not grant.
 */
export const GET = handler('api.admin.metrics', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.analytics.view');

  const query = parseQuery(request, querySchema);
  const { metrics, live } = await loadPlatformMetrics(context.supabase, query.windowDays);

  return ok({ metrics, live });
});
