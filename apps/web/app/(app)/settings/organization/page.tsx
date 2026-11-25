import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { OrganizationForm } from './organization-form';

export const metadata = { title: 'Organization' };

/** The centre's own profile (master spec, Settings: "Organization profile"). */
export default async function OrganizationPage() {
  const { organization } = await requirePagePermission('org.settings');
  const { t } = await getTranslations();

  return (
    <div className="space-y-5">
      <SettingsPageHeader
        section="organization"
        title={t('settings.organization')}
        subtitle={t('settings.org.subtitle')}
      />
      <OrganizationForm
        initial={{
          name: organization.name,
          businessType: organization.business_type,
          phone: organization.phone ?? '',
          email: organization.email ?? '',
          city: organization.city ?? '',
          district: organization.district ?? '',
          state: organization.state ?? '',
          preferredLocale: organization.preferred_locale,
        }}
      />
    </div>
  );
}
