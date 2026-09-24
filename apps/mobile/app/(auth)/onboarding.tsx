/**
 * Onboarding route. The screen itself lives in `components/onboarding/OnboardingScreen.tsx`;
 * this route only decides where the citizen goes next: Next continues to mobile-number
 * registration, Skip goes straight into the app.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();

  const handleNext = useCallback(() => {
    router.push('/(auth)/mobile-number');
  }, [router]);

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  return <OnboardingScreen onNext={handleNext} onSkip={handleSkip} />;
}
