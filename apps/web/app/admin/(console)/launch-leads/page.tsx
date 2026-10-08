import { Download, Megaphone } from 'lucide-react';
import { z } from 'zod';
import { formatMobile } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { logger } from '@/lib/api/logger';
import { getTranslations } from '@/lib/i18n/server';
import type { LaunchLeadRow } from '@/lib/supabase/database.types';
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminPageHeader,
  AdminPagination,
  AdminTable,
  TD,
  TH,
} from '../ui';
import { formatConsoleDateTime } from '../format';
import { DeleteLeadButton } from './delete-lead-button';

export const metadata = { title: 'Launch leads' };

const PAGE_SIZE = 50;

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(10_000).catch(1) });

/**
 * The pre-launch early-access list (migration 0035): cyber cafes and CSCs who left a WhatsApp
 * number on the launch notice. Newest first, with the CSV export for the launch-day message.
 *
 * Super admin only. These are operators' contact details, kept until the operator signs up or
 * asks to be removed — deleting is the "remove me" path.
 */
export default async function LaunchLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.leads.view');
  const canManage = session.permissions.has('platform.leads.manage');
  const { t, locale } = await getTranslations();
  const { page } = querySchema.parse(await searchParams);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await session.supabase
    .from('launch_leads')
    .select('id, whatsapp_number, shop_name, city, locale, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) logger.error('admin.launch_leads_load_failed', { dbError: error.message });

  const leads = (data ?? []) as LaunchLeadRow[];
  const total = count ?? 0;
  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');
  const hrefForPage = (target: number) =>
    target > 1 ? `/admin/launch-leads?page=${target}` : '/admin/launch-leads';

  return (
    <>
      <AdminPageHeader
        icon={<Megaphone />}
        title={t('admin.launchLeads.title')}
        description={t('admin.launchLeads.subtitle')}
        meta={<AdminBadge>{t('admin.launchLeads.totalCount', { count: n(total) })}</AdminBadge>}
        actions={
          total > 0 ? (
            // A plain link, not next/link: this is a file download, not a page to navigate to.
            <a
              href="/admin/launch-leads/export"
              download
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 [&_svg]:h-4 [&_svg]:w-4"
            >
              <Download aria-hidden />
              {t('admin.launchLeads.export')}
            </a>
          ) : null
        }
      />

      {error ? <AdminNote tone="danger">{t('admin.launchLeads.loadFailed')}</AdminNote> : null}

      <AdminNote>{t('admin.launchLeads.privacyNote')}</AdminNote>

      <AdminCard flush>
        <AdminTable
          minWidth={760}
          head={
            <tr>
              <TH>{t('admin.launchLeads.joined')}</TH>
              <TH>{t('admin.launchLeads.whatsapp')}</TH>
              <TH>{t('admin.launchLeads.shopName')}</TH>
              <TH>{t('admin.launchLeads.city')}</TH>
              <TH>{t('admin.launchLeads.language')}</TH>
              {canManage ? <TH className="text-right">{t('admin.launchLeads.actions')}</TH> : null}
            </tr>
          }
          empty={
            leads.length === 0 && !error ? (
              <AdminEmpty icon={<Megaphone />} title={t('admin.launchLeads.empty')} />
            ) : undefined
          }
        >
          {leads.map((lead) => (
            <tr key={lead.id} className="transition-colors hover:bg-slate-900/60">
              <TD className="whitespace-nowrap text-xs text-slate-400">
                {formatConsoleDateTime(lead.created_at, locale)}
              </TD>
              <TD className="whitespace-nowrap font-mono text-sm text-slate-100">
                +91 {formatMobile(lead.whatsapp_number) ?? lead.whatsapp_number}
              </TD>
              <TD className="text-slate-100">{lead.shop_name}</TD>
              <TD>{lead.city}</TD>
              <TD>
                <AdminBadge>{lead.locale === 'hi' ? 'हिन्दी' : 'English'}</AdminBadge>
              </TD>
              {canManage ? (
                <TD>
                  <DeleteLeadButton leadId={lead.id} />
                </TD>
              ) : null}
            </tr>
          ))}
        </AdminTable>
        {total > PAGE_SIZE ? (
          <AdminPagination
            summary={t('admin.launchLeads.range', {
              from: n(from + 1),
              to: n(from + leads.length),
              total: n(total),
            })}
            previousHref={page > 1 ? hrefForPage(page - 1) : null}
            nextHref={from + PAGE_SIZE < total ? hrefForPage(page + 1) : null}
            previousLabel={t('admin.launchLeads.previous')}
            nextLabel={t('admin.launchLeads.next')}
          />
        ) : null}
      </AdminCard>
    </>
  );
}
