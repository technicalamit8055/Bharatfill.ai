/**
 * Profile setup route — step 2 of registration. The screen lives in
 * `components/registration/ProfileSetupScreen.tsx`; this route owns navigation and what
 * happens to the finished profile.
 *
 * Saving the profile is not wired yet. The spec's `citizen_accounts` table has only
 * `full_name`; storing date of birth, gender and state is a new sensitive-data decision that
 * needs product-owner sign-off. Until then Continue says so plainly — except in development
 * builds, where it continues the demo walk-through to security setup — and the profile is
 * discarded either way: it is not stored, logged or sent anywhere. The preferred language is
 * the one exception — the screen applies it to the app as soon as it is picked.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { ProfileSetupScreen } from '../../components/registration/ProfileSetupScreen';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function ProfileSetupRoute() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/mobile-number');
  }, [router]);

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleContinue = useCallback(() => {
    // Development-only demo: carry on to security setup (step 3) so the flow can be walked
    // through. The profile is still discarded.
    if (__DEV__) {
      router.push('/(auth)/security-setup');
      return;
    }
    Alert.alert(t('profileSetup.saveUnavailableTitle'), t('profileSetup.saveUnavailableBody'), [
      { text: t('registration.ok') },
    ]);
  }, [router, t]);

  return <ProfileSetupScreen onBack={handleBack} onSkip={handleSkip} onContinue={handleContinue} />;
}
