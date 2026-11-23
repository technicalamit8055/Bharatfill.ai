import { Alert, Badge, Card } from '@assistigo/ui';
import {
  CATEGORY_OPTIONS,
  EDUCATION_LEVEL_LABELS,
  formatInr,
  SCHEME_DOCUMENTS,
  type RoamingCustomerCard,
} from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { RoamingAuthModal } from './roaming-auth-modal';

function categoryLabel(category: string, locale: 'en' | 'hi'): string {
  const option = CATEGORY_OPTIONS.find((candidate) => candidate.value === category);
  return option ? localised(option.label, locale) : category;
}

/**
 * The pre-auth view of a customer registered at another centre (§11, migration 0024).
 *
 * Everything rendered here comes straight off `RoamingCustomerCard` — the type itself is the
 * privacy control, so this component cannot accidentally render a field consent has not yet
 * covered. The schemes list is the one part of the whole roaming feature that stays open before
 * consent: pitching an eligible scheme is how the operator gets the citizen to say yes.
 */
export async function RoamingLockedCard({
  customerId,
  card,
  topSchemes,
  lockedByCustomer = false,
}: {
  customerId: string;
  card: RoamingCustomerCard;
  topSchemes: { slug: string; title: { en: string; hi: string }; estimatedFee: number }[] | null;
  /** This centre's own record, locked by the citizen in the BharatDoc app (0046). */
  lockedByCustomer?: boolean;
}) {
  const { t, locale } = await getTranslations();

  return (
    <Card>
      <Alert
        tone="warning"
        title={t(
          lockedByCustomer
            ? 'customers.roaming.lockedByCustomerTitle'
            : 'customers.roaming.lockedTitle',
        )}
      >
        {t(
          lockedByCustomer
            ? 'customers.roaming.lockedByCustomerBody'
            : 'customers.roaming.lockedBody',
        )}
      </Alert>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-lg font-semibold text-slate-900">{card.displayName}</span>
        <Badge tone="neutral">🔒 {t('customers.roaming.lockedShort')}</Badge>
        {card.mobileLast4 ? (
          <span className="text-sm tabular-nums text-slate-600">•••••• {card.mobileLast4}</span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {card.ageYears !== null ? (
          <div>
            <dt className="text-slate-500">{t('customers.roaming.age')}</dt>
            <dd className="font-medium text-slate-900">
              {t('customers.roaming.ageYears', { years: card.ageYears })}
            </dd>
          </div>
        ) : null}
        {card.category ? (
          <div>
            <dt className="text-slate-500">{t('customers.roaming.category')}</dt>
            <dd className="font-medium text-slate-900">{categoryLabel(card.category, locale)}</dd>
          </div>
        ) : null}
        {card.state ? (
          <div>
            <dt className="text-slate-500">{t('customers.roaming.state')}</dt>
            <dd className="font-medium text-slate-900">
              {card.state}
              {card.district ? `, ${card.district}` : ''}
            </dd>
          </div>
        ) : null}
        {card.educationLevel ? (
          <div>
            <dt className="text-slate-500">{t('customers.roaming.education')}</dt>
            <dd className="font-medium text-slate-900">
              {localised(EDUCATION_LEVEL_LABELS[card.educationLevel], locale)}
            </dd>
          </div>
        ) : null}
      </dl>

      {card.documentsOnFile.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('customers.roaming.documentsOnFile')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {card.documentsOnFile.map((key) => (
              <Badge key={key} tone="neutral">
                {localised(SCHEME_DOCUMENTS[key].label, locale)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {topSchemes && topSchemes.length > 0 ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">
            {t('customers.roaming.eligibleFor')}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-emerald-800">
            {topSchemes.map((scheme) => (
              <li key={scheme.slug}>
                • {localised(scheme.title, locale)}
                {scheme.estimatedFee > 0 ? ` — ${formatInr(scheme.estimatedFee)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <RoamingAuthModal customerId={customerId} />
      </div>
    </Card>
  );
}
