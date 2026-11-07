/**
 * Mobile-number registration route. The screen lives in
 * `components/registration/MobileNumberScreen.tsx`; this route owns navigation and what
 * happens when the citizen asks for an OTP.
 *
 * SMS OTP (Supabase phone auth, spec §6 Phase 2) is not wired yet — doing so sends the number
 * to an SMS provider and needs product-owner sign-off. Until then Get OTP says so plainly and
 * the number is discarded: it is not stored, logged or sent anywhere — except the dev-only
 * demo number below, which is handed to the OTP screen.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { MobileNumberScreen } from '../../components/registration/MobileNumberScreen';
import { useTranslation } from '../../lib/i18n/I18nProvider';

/**
 * Development-only demo number: Get OTP with it opens the OTP screen so the flow can be walked
 * through before SMS is wired. No OTP is sent. `__DEV__` is false in release builds, so the
 * shortcut and this number are stripped from anything shipped. Remove once SMS OTP is live.
 */
const DEMO_NUMBER = '+919876543210';

export default function MobileNumberRoute() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
  }, [router]);

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleRequestOtp = useCallback(
    (e164: string) => {
      if (__DEV__ && e164 === DEMO_NUMBER) {
        router.push({ pathname: '/(auth)/otp-verification', params: { phone: e164 } });
        return;
      }
      Alert.alert(t('registration.otpUnavailableTitle'), t('registration.otpUnavailableBody'), [
        { text: t('registration.ok') },
      ]);
    },
    [router, t],
  );

  return (
    <MobileNumberScreen onBack={handleBack} onSkip={handleSkip} onRequestOtp={handleRequestOtp} />
  );
}
