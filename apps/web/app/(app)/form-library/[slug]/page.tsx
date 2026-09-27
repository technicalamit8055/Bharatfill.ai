import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';
import { Badge, Button, Card, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatIndianDate } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import { portalLaunchUrl } from '@/lib/forms/present';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  testing: 'warning',
  active: 'success',
  deprecated: 'neutral',
};

export default async function FormAdapterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requirePagePermission('fill.run');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const catalog = await loadAdapterCatalog(supabase, session.organization.id);
  const adapter = catalog.find((candidate) => candidate.slug === slug);
  if (!adapter) nextNotFound();

  const canCreateApplication = session.permissions.has('application.create');
  const launchUrl = portalLaunchUrl(adapter);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/form-library" className="text-xs font-medium text-slate-500 hover:text-slate-800">
          ← {t('formLibrary.detail.back')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{adapter.portalName}</h1>
          <Badge tone={STATUS_TONE[adapter.status] ?? 'neutral'}>
            {t(`formLibrary.status.${adapter.status}`)}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{adapter.formName}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {launchUrl ? (
          <a href={launchUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">{t('formLibrary.launchPortal')}</Button>
          </a>
        ) : null}
        {canCreateApplication ? (
          <Link
            href={
              adapter.persisted
                ? `/applications/new?portalAdapterId=${adapter.id}`
                : `/applications/new?portalName=${encodeURIComponent(adapter.portalName)}&formName=${encodeURIComponent(adapter.formName)}`
            }
          >
            <Button variant="ghost">{t('formLibrary.createApplication')}</Button>
          </Link>
        ) : null}
      </div>

      <Card title={t('formLibrary.detail.urlPatterns')}>
        <ul className="space-y-1 text-sm text-slate-700">
          {adapter.urlPatterns.map((pattern) => (
            <li key={pattern} className="font-mono text-xs text-slate-600">
              {pattern}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={t('formLibrary.detail.fieldMappings')}
        description={`${t('formLibrary.detail.version')}: ${adapter.version}`}
      >
        {adapter.fields.length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('formLibrary.detail.fieldLabel')}</TH>
                <TH>{t('formLibrary.detail.customerField')}</TH>
              </TR>
            </THead>
            <TBody>
              {adapter.fields.map((field) => (
                <TR key={field.key}>
                  <TD>{field.labelPatterns?.[0] ?? field.key}</TD>
                  <TD className="font-mono text-xs text-slate-600">{field.customerField}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title={t('formLibrary.detail.documentRequirements')}>
        {adapter.documentRequirements.length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('formLibrary.detail.documentRequirementLabel')}</TH>
                <TH>{t('common.required')}</TH>
              </TR>
            </THead>
            <TBody>
              {adapter.documentRequirements.map((requirement) => (
                <TR key={requirement.key}>
                  <TD>{requirement.label}</TD>
                  <TD>{requirement.required ? t('common.yes') : t('common.no')}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {adapter.notes || adapter.knownIssues ? (
        <Card>
          {adapter.notes ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t('formLibrary.detail.notes')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{adapter.notes}</p>
            </div>
          ) : null}
          {adapter.knownIssues ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {t('formLibrary.detail.knownIssues')}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{adapter.knownIssues}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <p className="text-xs text-slate-400">
        {adapter.lastVerifiedAt
          ? `${t('formLibrary.detail.lastVerified')}: ${formatIndianDate(adapter.lastVerifiedAt.slice(0, 10))}`
          : t('formLibrary.detail.neverVerified')}
      </p>
    </div>
  );
}
