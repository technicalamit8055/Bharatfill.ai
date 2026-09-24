/**
 * The registration progress stepper with its translated step labels, for a screen that only
 * needs to say which step it is.
 */

import { REGISTRATION_STEPS, type RegistrationStep } from '../../lib/auth/registration-steps';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ProgressStepper } from './ProgressStepper';

export function RegistrationStepper({ current }: { readonly current: RegistrationStep }) {
  const { t } = useTranslation();

  const labels = REGISTRATION_STEPS.map((step) => t(`registration.steps.${step}`));
  const index = REGISTRATION_STEPS.indexOf(current);

  return (
    <ProgressStepper
      steps={labels}
      current={index}
      accessibilityLabel={t('registration.stepProgress', {
        current: index + 1,
        total: REGISTRATION_STEPS.length,
        label: labels[index] ?? '',
      })}
    />
  );
}
