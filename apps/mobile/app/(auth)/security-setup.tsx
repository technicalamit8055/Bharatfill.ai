/**
 * Security setup route — step 3 of registration. The screen lives in
 * `components/registration/SecuritySetupScreen.tsx`, currently a placeholder: app lock is not
 * built, so Continue and Skip both carry on into the app without setting one up.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SecuritySetupScreen } from '../../components/registration/SecuritySetupScreen';

export default function SecuritySetupRoute() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/profile-setup');
  }, [router]);

  const enterApp = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  return <SecuritySetupScreen onBack={handleBack} onSkip={enterApp} onContinue={enterApp} />;
}
