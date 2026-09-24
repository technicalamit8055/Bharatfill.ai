/**
 * OTP verification route. The screen lives in
 * `components/registration/OtpVerificationScreen.tsx`; this route owns navigation, the code's
 * expiry, and what happens on Verify and Resend.
 *
 * Expects `?phone=+91XXXXXXXXXX` from the mobile-number step. A missing or malformed number
 * sends the citizen back there rather than showing an OTP screen for nobody.
 *
 * SMS OTP (Supabase phone auth, spec §6 Phase 2) is not wired yet — doing so sends the number
 * to an SMS provider and needs product-owner sign-off. Until then Verify and Resend say so
 * plainly — except in development builds, where Verify continues the demo walk-through to
 * profile setup — and neither the number nor the code is stored, logged or sent anywhere.
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { OtpVerificationScreen } from '../../components/registration/OtpVerificationScreen';
import { OTP_TTL_SECONDS } from '../../lib/auth/otp';
import { formatE164ForDisplay, nationalDigitsFromE164 } from '../../lib/auth/phone';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function OtpVerificationRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  const nationalDigits = typeof phone === 'string' ? nationalDigitsFromE164(phone) : null;

  // Set when a code is sent; a successful Resend will replace it with a fresh deadline.
  const [expiresAt] = useState(() => Date.now() + OTP_TTL_SECONDS * 1000);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/mobile-number');
  }, [router]);

  const handleHelp = useCallback(() => {
    Alert.alert(t('otp.helpTitle'), t('otp.helpBody'), [{ text: t('registration.ok') }]);
  }, [t]);

  const showUnavailable = useCallback(() => {
    Alert.alert(t('registration.otpUnavailableTitle'), t('registration.otpUnavailableBody'), [
      { text: t('registration.ok') },
    ]);
  }, [t]);

  const handleVerify = useCallback(() => {
    // Development-only: continue the demo walk-through to profile setup. No code is checked —
    // there is none to check until SMS OTP is wired. `__DEV__` is false in release builds.
    if (__DEV__) {
      router.replace('/(auth)/profile-setup');
      return;
    }
    showUnavailable();
  }, [router, showUnavailable]);

  if (!nationalDigits) return <Redirect href="/(auth)/mobile-number" />;

  return (
    <OtpVerificationScreen
      phoneNumber={formatE164ForDisplay(nationalDigits)}
      expiresAt={expiresAt}
      onBack={handleBack}
      onHelp={handleHelp}
      onVerify={handleVerify}
      onResend={showUnavailable}
    />
  );
}
