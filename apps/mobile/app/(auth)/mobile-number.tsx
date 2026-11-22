/**
 * Mobile-number registration route. The screen lives in
 * `components/registration/MobileNumberScreen.tsx`; this route owns navigation and what
 * happens when the citizen asks for an OTP.
 *
 * Cloud builds (`lib/cloud/config.ts` configured) send the code through Supabase phone auth
 * (docs/VAULT_BRIDGE_DESIGN.md §3.1, D9) and open the OTP screen. The number goes to Supabase
 * over TLS and nowhere else; it is never stored or logged on the phone.
 *
 * Offline builds behave as before: Get OTP says sign-in is not live yet and the number is
 * discarded — except the dev-only demo number below, which opens the OTP screen.
 */

import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { showDialog } from '../../lib/dialog/dialog-store';
import { MobileNumberScreen } from '../../components/registration/MobileNumberScreen';
import { authFailureMessageKey, requestPhoneOtp } from '../../lib/cloud/auth-client';
import { cloudConfig } from '../../lib/cloud/config';
import { useTranslation } from '../../lib/i18n/I18nProvider';

/**
 * Development-only demo number for offline builds: Get OTP with it opens the OTP screen so the
 * flow can be walked through. No OTP is sent. `__DEV__` is false in release builds.
 */
const DEMO_NUMBER = '+919876543210';

export default function MobileNumberRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const sending = useRef(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
  }, [router]);

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleRequestOtp = useCallback(
    (e164: string) => {
      const config = cloudConfig();
      if (!config) {
        if (__DEV__ && e164 === DEMO_NUMBER) {
          router.push({ pathname: '/(auth)/otp-verification', params: { phone: e164 } });
          return;
        }
        showDialog(
          t('registration.otpUnavailableTitle'),
          t('registration.otpUnavailableBody'),
          [{ text: t('registration.ok') }],
          { tone: 'warning' },
        );
        return;
      }

      if (sending.current) return;
      sending.current = true;
      void requestPhoneOtp(config, e164)
        .then((result) => {
          if (result.ok) {
            router.push({ pathname: '/(auth)/otp-verification', params: { phone: e164 } });
          } else {
            showDialog(
              t('cloud.errors.title'),
              t(authFailureMessageKey(result.reason)),
              [{ text: t('registration.ok') }],
              { tone: 'danger' },
            );
          }
        })
        .finally(() => {
          sending.current = false;
        });
    },
    [router, t],
  );

  return (
    <MobileNumberScreen onBack={handleBack} onSkip={handleSkip} onRequestOtp={handleRequestOtp} />
  );
}
