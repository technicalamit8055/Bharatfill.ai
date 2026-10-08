import { notFound } from 'next/navigation';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { logger } from '@/lib/api/logger';
import { launchLeadsCsv, type LaunchLeadCsvRow } from '@/lib/launch/leads';

/** Far more than a pre-launch list will hold; a cap so one request can never pull an unbounded table. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /admin/launch-leads/export — the early-access list as CSV, for the launch-day WhatsApp
 * message. Same console gate as the page, and every download is audited with its row count.
 */
export async function GET() {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.leads.view')) notFound();

  const { data, error } = await session.supabase
    .from('launch_leads')
    .select('whatsapp_number, shop_name, city, locale, created_at')
    .order('created_at', { ascending: true })
    .limit(EXPORT_LIMIT);

  if (error) {
    logger.error('admin.launch_leads_export_failed', { dbError: error.message });
    return new Response('Export failed', { status: 500 });
  }

  const rows = (data ?? []) as LaunchLeadCsvRow[];

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.launch_leads_exported',
    entityType: 'launch_lead',
    metadata: { rows: rows.length },
  });

  const day = new Date().toISOString().slice(0, 10);
  return new Response(launchLeadsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bharatfill-launch-leads-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
