import Image from 'next/image';
import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CircleCheck,
  CirclePlus,
  ExternalLink,
  FileText,
  FlaskConical,
  Info,
  Landmark,
  Link2,
  PencilLine,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import { formatIndianDate } from '@assistigo/core';
import type { AdapterStatus } from '@assistigo/form-engine';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import { portalLaunchUrl, portalLogoSrc } from '@/lib/forms/present';
import { CopyButton } from './copy-button';
import { FieldMappingCard } from './field-mapping-card';

const STATUS_STYLE: Record<AdapterStatus, { icon: LucideIcon; tone: string }> = {
  testing: { icon: FlaskConical, tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  active: { icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  draft: { icon: PencilLine, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  deprecated: { icon: Archive, tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

/** Row tints for the document icons. Decorative, cycled by position. */
const DOCUMENT_TINTS = [
  'bg-orange-50 text-orange-600 ring-orange-100',
  'bg-amber-50 text-amber-600 ring-amber-100',
  'bg-emerald-50 text-emerald-600 ring-emerald-100',
  'bg-sky-50 text-sky-600 ring-sky-100',
] as const;

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

const PRIMARY_ACTION =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY_ACTION =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function SectionIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span
      aria-hidden
      className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1', tone)}
    >
      <Icon size={22} strokeWidth={1.8} />
    </span>
  );
}

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
  const logoSrc = portalLogoSrc(adapter.slug);
  const status = STATUS_STYLE[adapter.status];
  const StatusIcon = status.icon;

  const createHref = adapter.persisted
    ? `/applications/new?portalAdapterId=${adapter.id}`
    : `/applications/new?portalName=${encodeURIComponent(adapter.portalName)}&formName=${encodeURIComponent(adapter.formName)}`;

  return (
    <div className="space-y-5">
      <Link
        href="/form-library"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        {t('formLibrary.detail.back')}
      </Link>

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/*
         * The map / dome / tricolour artwork, pinned to the right edge and faded in from white so
         * the heading never sits on top of it. Decorative only, and hidden below `md`, where the
         * card is no wider than its heading and buttons.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] max-w-[40%] select-none md:block"
        >
          <Image
            src="/form-library/portal-banner-hero.png"
            alt=""
            fill
            priority
            sizes="340px"
            className="object-cover object-right"
          />
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent" />
        </div>

        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6 md:pr-[240px]">
          {logoSrc ? (
            // Decorative: the heading beside it names the portal.
            <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <Image src={logoSrc} alt="" fill sizes="96px" className="object-contain p-2" />
            </span>
          ) : (
            <span
              aria-hidden
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"
            >
              <Landmark size={36} strokeWidth={1.6} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 text-xl font-bold leading-snug text-slate-900">
                {adapter.portalName}
              </h1>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1',
                  status.tone,
                )}
              >
                <StatusIcon size={15} strokeWidth={2} aria-hidden />
                {t(`formLibrary.status.${adapter.status}`)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">{adapter.formName}</p>

            {launchUrl || canCreateApplication ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {launchUrl ? (
                  <a href={launchUrl} target="_blank" rel="noopener noreferrer" className={PRIMARY_ACTION}>
                    <ExternalLink size={18} strokeWidth={1.8} aria-hidden />
                    {t('formLibrary.launchPortal')}
                  </a>
                ) : null}
                {canCreateApplication ? (
                  <Link href={createHref} className={SECONDARY_ACTION}>
                    <CirclePlus size={18} strokeWidth={1.8} aria-hidden />
                    {t('formLibrary.createApplication')}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={CARD}>
        <div className="flex items-start gap-4">
          <SectionIcon icon={Link2} tone="bg-brand-50 text-brand-600 ring-brand-100" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {t('formLibrary.detail.urlPatterns')}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {t('formLibrary.detail.urlPatternsHelp')}
                </p>
              </div>
              <CopyButton
                value={adapter.urlPatterns.join('\n')}
                label={t('formLibrary.detail.copyUrlPatterns')}
                showText
              />
            </div>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] leading-6 text-slate-700">
              {adapter.urlPatterns.join('\n')}
            </pre>
          </div>
        </div>
      </section>

      <FieldMappingCard fields={adapter.fields} version={adapter.version} />

      <section className={CARD}>
        <div className="flex items-start gap-4">
          <SectionIcon icon={FileText} tone="bg-violet-50 text-violet-600 ring-violet-100" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t('formLibrary.detail.documentRequirements')}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{t('formLibrary.detail.documentsHelp')}</p>
          </div>
        </div>

        {adapter.documentRequirements.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">—</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t('formLibrary.detail.documentRequirementLabel')}
                  </th>
                  <th scope="col" className="w-32 px-4 py-3">
                    {t('common.required')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('formLibrary.detail.documentNotes')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adapter.documentRequirements.map((requirement, index) => (
                  <tr key={requirement.key} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1',
                            DOCUMENT_TINTS[index % DOCUMENT_TINTS.length],
                          )}
                        >
                          <FileText size={18} strokeWidth={1.8} />
                        </span>
                        <span className="text-slate-900">{requirement.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex h-9 items-center gap-2 text-slate-700">
                        {requirement.required ? (
                          <CheckCircle2
                            size={20}
                            strokeWidth={2}
                            aria-hidden
                            className="fill-emerald-500 text-white"
                          />
                        ) : (
                          <XCircle
                            size={20}
                            strokeWidth={2}
                            aria-hidden
                            className="fill-rose-500 text-white"
                          />
                        )}
                        {requirement.required ? t('common.yes') : t('common.no')}
                      </span>
                    </td>
                    <td className="px-4 py-3 leading-6 text-slate-600">
                      {requirement.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adapter.notes ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <SectionIcon icon={FileText} tone="bg-amber-100 text-amber-700 ring-amber-200" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{t('formLibrary.detail.notes')}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {adapter.notes}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {adapter.knownIssues ? (
        <section className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <SectionIcon icon={Info} tone="bg-white text-brand-600 ring-brand-100" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                {t('formLibrary.detail.knownIssues')}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {adapter.knownIssues}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-slate-400">
        {adapter.lastVerifiedAt
          ? `${t('formLibrary.detail.lastVerified')}: ${formatIndianDate(adapter.lastVerifiedAt.slice(0, 10))}`
          : t('formLibrary.detail.neverVerified')}
      </p>
    </div>
  );
}
