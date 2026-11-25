'use client';

import { useActionState, useState } from 'react';
import { Building2, MapPin, Phone } from 'lucide-react';
import { Alert, Button, Field, Select, TextField } from '@assistigo/ui';
import { SettingsCard } from '@/components/settings/settings-card';
import { INDIAN_STATES } from '@/lib/constants/states';
import { useTranslations } from '@/lib/i18n/client';
import { BUSINESS_TYPES } from '@/lib/settings/organization';
import { updateOrganizationAction, type OrganizationState } from './actions';

type Values = Record<
  'name' | 'businessType' | 'phone' | 'email' | 'city' | 'district' | 'state' | 'preferredLocale',
  string
>;

export function OrganizationForm({ initial }: { initial: Values }) {
  const t = useTranslations();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<OrganizationState>({});
  const [, formAction, pending] = useActionState<OrganizationState, FormData>(
    async (previous, formData) => {
      const next = await updateOrganizationAction(previous, formData);
      setState(next);
      return next;
    },
    {},
  );

  const bind = (name: keyof Values) => ({
    name,
    value: values[name],
    onChange: (event: { target: { value: string } }) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [name]: value }));
      // "Saved" must not stay on screen next to an edit that is not.
      setState({});
    },
  });

  // Keep whatever is already saved selectable, even if it is not in the list.
  const states: string[] = [...INDIAN_STATES];
  if (initial.state && !states.includes(initial.state)) states.unshift(initial.state);

  return (
    // `onReset` is blocked because React resets a form after its action, which would put the
    // dropdowns back to their first option while the values still held the operator's choice.
    <form action={formAction} onReset={(event) => event.preventDefault()} className="space-y-5">
      <SettingsCard
        icon={<Building2 className="h-5 w-5" aria-hidden />}
        title={t('settings.org.profileTitle')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('onboarding.businessName')}
            required
            minLength={2}
            maxLength={160}
            {...bind('name')}
          />
          <Field label={t('onboarding.businessType')} htmlFor="org-business-type" required>
            <Select id="org-business-type" {...bind('businessType')}>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`onboarding.businessTypes.${type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('onboarding.preferredLanguage')}
            htmlFor="org-locale"
            hint={t('settings.org.languageHint')}
          >
            <Select id="org-locale" {...bind('preferredLocale')}>
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </Select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<Phone className="h-5 w-5" aria-hidden />}
        title={t('settings.org.contactTitle')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('settings.org.phone')}
            type="tel"
            maxLength={20}
            {...bind('phone')}
          />
          <TextField label={t('settings.org.email')} type="email" {...bind('email')} />
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<MapPin className="h-5 w-5" aria-hidden />}
        title={t('settings.location')}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label={t('onboarding.city')} maxLength={120} {...bind('city')} />
          <TextField label={t('onboarding.district')} maxLength={120} {...bind('district')} />
          <Field label={t('onboarding.state')} htmlFor="org-state">
            <Select id="org-state" {...bind('state')}>
              <option value="">{t('common.none')}</option>
              {states.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsCard>

      {state.error ? <Alert tone="danger">{t(state.error)}</Alert> : null}
      {state.notice ? <Alert tone="success">{t(state.notice)}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
