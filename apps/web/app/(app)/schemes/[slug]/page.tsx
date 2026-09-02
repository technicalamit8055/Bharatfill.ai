import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Card, EmptyState } from '@assistigo/ui';
import {
  EDUCATION_LEVEL_LABELS,
  SCHEME_CATEGORY_LABELS,
  SCHEME_DOCUMENTS,
  SCHEME_TRAIT_LABELS,
  formatIndianDate,
  formatInr,
  resolveSchemeLifecycle,
  stateLabel,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { REVERSE_MATCH_SCAN_LIMIT, findEligibleCustomers, loadScheme } from '@/lib/schemes/service';
import { EligibleCustomersTable } from './eligible-customers-table';

export const metadata = { title: 'Scheme' };

export default async function SchemeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePagePermission('customer.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const scheme = await loadScheme(supabase, session.organization.id, slug);
  if (!scheme) notFound();

  const { matches, scanned, scanLimitReached } = await findEligibleCustomers(
    supabase,
    session.organization.id,
    scheme,
  );

  const { eligibility, schedule } = scheme;
  const allowedStates = eligibility.allowedStates ?? [];
  const lifecycle = resolveSchemeLifecycle(schedule);

  const customers = matches.map((match) => ({
    id: match.id,
    customerCode: match.customerCode,
    fullName: match.fullName,
    mobile: match.mobile,
    status: match.result.status,
    ageAtCutoff: match.result.ageAtCutoff,
    missing: match.result.missingRequirements.map((requirement) =>
      requirement.kind === 'operator_confirmation'
        ? t('schemes.confirmTrait', { trait: localised(requirement.label, locale) })
        : localised(requirement.label, locale),
    ),
    pitch: match.result.pitch,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/schemes" className="text-xs text-slate-500 hover:underline">
          ← {t('schemes.title')}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {localised(scheme.title, locale)}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {localised(scheme.shortDescription, locale)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="info">{localised(SCHEME_CATEGORY_LABELS[scheme.category], locale)}</Badge>
            <Badge tone="success">{localised(scheme.benefitHighlight, locale)}</Badge>
          </div>
        </div>
      </div>

      <Card title={t('schemes.benefits')}>
        <p className="text-sm text-slate-700">{localised(scheme.benefitsSummary, locale)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={scheme.portalUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="primary">
              {t('schemes.openPortal')}
            </Button>
          </a>
          {scheme.officialNotificationUrl ? (
            <a href={scheme.officialNotificationUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost">
                {t('schemes.officialNotification')}
              </Button>
            </a>
          ) : null}
          {scheme.adapterSlug ? (
            <Link href={`/form-library/${scheme.adapterSlug}`}>
              <Button size="sm" variant="ghost">
                {t('schemes.viewFormSpecs')}
              </Button>
            </Link>
          ) : null}
        </div>
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-700">
            {t(`schemes.lifecycleStatus.${lifecycle.status}`)}
          </p>

          {schedule.isAlwaysOpen ? (
            <p className="mt-1 text-xs text-slate-500">{t('schemes.alwaysOpen')}</p>
          ) : schedule.applicationStartDate || schedule.applicationEndDate || schedule.examDate ? (
            <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              <WindowDate label={t('schemes.opensOn')} value={schedule.applicationStartDate} />
              <WindowDate label={t('schemes.closesOn')} value={schedule.applicationEndDate} />
              <WindowDate label={t('schemes.examOn')} value={schedule.examDate} />
            </dl>
          ) : (
            // No dates and not evergreen: say so, rather than implying the form is open.
            <p className="mt-1 text-xs text-slate-500">{t('schemes.cyclical')}</p>
          )}

          {lifecycle.status === 'closed' ? (
            <p className="mt-2 text-xs font-medium text-amber-700">{t('schemes.windowClosed')}</p>
          ) : null}
        </div>
      </Card>

      <Card title={t('schemes.eligibilityBreakdown')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {eligibility.minAge !== undefined || eligibility.maxAge !== undefined ? (
            <Criterion label={t('schemes.criteria.age')}>
              {t('schemes.ageRange', {
                min: eligibility.minAge ?? 0,
                max: eligibility.maxAge ?? 0,
              })}
              {eligibility.ageRelaxations ? (
                <span className="mt-0.5 block text-xs text-emerald-700">
                  {Object.entries(eligibility.ageRelaxations)
                    .map(([key, years]) => `${key.toUpperCase()} +${years}`)
                    .join(' · ')}
                </span>
              ) : null}
            </Criterion>
          ) : null}

          {eligibility.gender && eligibility.gender !== 'all' ? (
            <Criterion label={t('schemes.criteria.gender')}>
              {t(`schemes.gender.${eligibility.gender}`)}
            </Criterion>
          ) : null}

          <Criterion label={t('schemes.criteria.state')}>
            {allowedStates.length === 0
              ? t('schemes.allIndia')
              : allowedStates.map((code) => localised(stateLabel(code), locale)).join(', ')}
          </Criterion>

          {eligibility.allowedCategories?.length ? (
            <Criterion label={t('schemes.criteria.category')}>
              {eligibility.allowedCategories.map((value) => value.toUpperCase()).join(', ')}
            </Criterion>
          ) : null}

          {eligibility.minEducationLevel ? (
            <Criterion label={t('schemes.criteria.education')}>
              {localised(EDUCATION_LEVEL_LABELS[eligibility.minEducationLevel], locale)}
              {eligibility.alsoAcceptsEducation?.length ? (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t('schemes.alsoAccepts', {
                    levels: eligibility.alsoAcceptsEducation
                      .map((level) => localised(EDUCATION_LEVEL_LABELS[level], locale))
                      .join(', '),
                  })}
                </span>
              ) : null}
            </Criterion>
          ) : null}

          {eligibility.maxAnnualIncome !== undefined ? (
            <Criterion label={t('schemes.criteria.income')}>
              {t('schemes.incomeUpTo', {
                amount: formatInr(eligibility.maxAnnualIncome) ?? '—',
              })}
            </Criterion>
          ) : null}

          {eligibility.requiredTraits?.length ? (
            <Criterion label={t('schemes.criteria.traits')}>
              {eligibility.requiredTraits
                .map((trait) => localised(SCHEME_TRAIT_LABELS[trait], locale))
                .join(', ')}
            </Criterion>
          ) : null}

          <Criterion label={t('schemes.criteria.fee')}>
            {formatInr(scheme.estimatedOperatorFee) ?? '—'}
          </Criterion>
        </dl>

        {eligibility.requiredDocuments?.length ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-600">{t('schemes.criteria.documents')}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {eligibility.requiredDocuments.map((key) => (
                <li key={key}>
                  <Badge tone="neutral">{localised(SCHEME_DOCUMENTS[key].label, locale)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card
        title={t('schemes.eligibleCustomers')}
        description={t('schemes.eligibleCustomersHelp', { count: customers.length })}
      >
        {lifecycle.status === 'upcoming' ? (
          <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {t('schemes.outreachUpcoming', { days: lifecycle.daysUntilOpen ?? 0 })}
          </p>
        ) : null}
        {customers.length === 0 ? (
          <EmptyState
            title={t('schemes.noEligibleCustomers')}
            description={t('schemes.noEligibleCustomersHelp')}
          />
        ) : (
          <EligibleCustomersTable customers={customers} />
        )}
        {scanLimitReached ? (
          <p className="mt-3 text-xs text-amber-700">
            {t('schemes.scanLimit', { scanned, limit: REVERSE_MATCH_SCAN_LIMIT })}
          </p>
        ) : null}
      </Card>

      <p className="text-xs text-slate-400">{t('schemes.verifyNotice')}</p>
    </div>
  );
}

function WindowDate({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <dt className="font-medium text-slate-500">{label}:</dt>
      <dd>{formatIndianDate(value)}</dd>
    </div>
  );
}

function Criterion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
