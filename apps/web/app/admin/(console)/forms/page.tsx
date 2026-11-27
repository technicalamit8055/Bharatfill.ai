import { z } from 'zod';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import type { PortalAdapterRow } from '@/lib/supabase/database.types';
import {
  AdminCard,
  AdminEmpty,
  AdminLinkButton,
  AdminNote,
  AdminPageHeader,
  AdminTable,
  TH,
} from '../ui';
import { AdapterRow } from './adapter-row';

export const metadata = { title: 'Portal forms' };

/**
 * Global portal adapters — the forms the extension knows how to fill.
 *
 * Only `organization_id is null` rows appear: a centre's private override is their data and is
 * not listed here.
 */

/** `health` is a free jsonb column, so it is parsed rather than indexed into. */
const healthSchema = z.object({
  successRate: z.number().min(0).max(1).nullable().default(null),
  lastFailureAt: z.string().nullable().default(null),
});

export default async function AdminFormsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.forms.view');
  const { t } = await getTranslations();
  const params = await searchParams;

  const query = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase();
  const status = typeof params.status === 'string' ? params.status : '';

  const { data } = await session.supabase
    .from('portal_adapters')
    .select('*')
    .is('organization_id', null)
    .order('portal_name', { ascending: true });

  const adapters = ((data ?? []) as PortalAdapterRow[]).filter((adapter) => {
    if (status && adapter.status !== status) return false;
    if (!query) return true;
    return `${adapter.portal_name} ${adapter.form_name} ${adapter.slug} ${adapter.region ?? ''}`
      .toLowerCase()
      .includes(query);
  });

  const canEdit = session.permissions.has('platform.forms.edit');

  return (
    <>
      <AdminPageHeader
        title={t('admin.forms.title')}
        description={t('admin.forms.subtitle')}
        actions={
          <AdminLinkButton href="/admin/forms/contributions">
            {t('admin.forms.contributionsLink')}
          </AdminLinkButton>
        }
      />

      <AdminNote>{t('admin.forms.safetyNote')}</AdminNote>

      <AdminCard>
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={typeof params.q === 'string' ? params.q : ''}
            placeholder={t('admin.forms.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <select
            name="status"
            defaultValue={status}
            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">{t('admin.forms.allStatuses')}</option>
            {['draft', 'testing', 'active', 'deprecated'].map((value) => (
              <option key={value} value={value}>
                {t(`formLibrary.status.${value}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            {t('common.apply')}
          </button>
        </form>

        <AdminTable
          head={
            <tr>
              <TH>{t('admin.forms.adapter')}</TH>
              <TH>{t('admin.forms.region')}</TH>
              <TH>{t('admin.forms.status')}</TH>
              <TH className="text-right">{t('admin.forms.mappings')}</TH>
              <TH className="text-right">{t('admin.forms.successRate')}</TH>
              <TH />
            </tr>
          }
          empty={
            adapters.length === 0 ? (
              <AdminEmpty
                title={t('admin.forms.empty')}
                description={t('admin.forms.emptyHelp')}
              />
            ) : undefined
          }
        >
          {adapters.map((adapter) => {
            const health = healthSchema.safeParse(adapter.health);
            const mappings = Array.isArray(adapter.field_mappings)
              ? adapter.field_mappings.length
              : 0;

            return (
              <AdapterRow
                key={adapter.id}
                readOnly={!canEdit}
                adapter={{
                  id: adapter.id,
                  slug: adapter.slug,
                  portalName: adapter.portal_name,
                  formName: adapter.form_name,
                  region: adapter.region,
                  version: adapter.version,
                  status: adapter.status,
                  notes: adapter.notes,
                  knownIssues: adapter.known_issues,
                  lastVerifiedAt: adapter.last_verified_at,
                  mappingCount: mappings,
                  successRate: health.success ? health.data.successRate : null,
                }}
              />
            );
          })}
        </AdminTable>
      </AdminCard>
    </>
  );
}
