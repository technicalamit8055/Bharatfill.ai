/**
 * Profile setup route — step 2 of registration. The screen lives in
 * `components/registration/ProfileSetupScreen.tsx`; this route owns navigation and what
 * happens to the finished profile.
 *
 * The profile is just a name and a language (docs/VAULT_BRIDGE_DESIGN.md D10). Cloud builds
 * keep it in memory (`lib/cloud/registration-draft.ts`) and go on to the Vault PIN step, which
 * creates the account. Offline builds say saving is not available — except in development,
 * where the demo walk-through continues — and discard it.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { showDialog } from '../../lib/dialog/dialog-store';
import { ProfileSetupScreen } from '../../components/registration/ProfileSetupScreen';
import { cloudConfig } from '../../lib/cloud/config';
import { clearRegistrationDraft, setRegistrationDraft } from '../../lib/cloud/registration-draft';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { SignupProfile } from '../../lib/profile/profile';

export default function ProfileSetupRoute() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleBack = useCallback(() => {
    clearRegistrationDraft();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/mobile-number');
  }, [router]);

  const handleSkip = useCallback(() => {
    clearRegistrationDraft();
    router.replace('/(tabs)');
  }, [router]);

  const handleContinue = useCallback(
    (profile: SignupProfile) => {
      if (cloudConfig()) {
        setRegistrationDraft({
          displayName: profile.fullName,
          preferredLocale: profile.language,
        });
        router.push('/(auth)/security-setup');
        return;
      }
      if (__DEV__) {
        router.push('/(auth)/security-setup');
        return;
      }
      showDialog(
        t('profileSetup.saveUnavailableTitle'),
        t('profileSetup.saveUnavailableBody'),
        [{ text: t('registration.ok') }],
        { tone: 'warning' },
      );
    },
    [router, t],
  );

  return <ProfileSetupScreen onBack={handleBack} onSkip={handleSkip} onContinue={handleContinue} />;
}
