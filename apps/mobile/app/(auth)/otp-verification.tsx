/**
 * OTP verification route. The screen lives in
 * `components/registration/OtpVerificationScreen.tsx`; this route owns navigation, the code's
 * expiry, and what happens on Verify and Resend.
 *
 * Expects `?phone=+91XXXXXXXXXX` from the mobile-number step. A missing or malformed number
 * sends the citizen back there rather than showing an OTP screen for nobody.
 *
 * Cloud builds verify the code with Supabase, keep the session in SecureStore, then ask the
 * citizen API whether this number already has a vault (docs/VAULT_BRIDGE_DESIGN.md §3):
 *   no account                 → profile setup (finish sign-up)
 *   account, key on this phone → into the app
 *   account, no key here       → restore (Vault PIN)
 * The code is never stored or logged; the citizen taps Verify themselves.
 *
 * Offline builds behave as before: Verify and Resend say sign-in is not live yet, except that
 * development builds continue the demo walk-through to profile setup.
 */

import { CircleHelp } from 'lucide-react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { showDialog } from '../../lib/dialog/dialog-store';
import { OtpVerificationScreen } from '../../components/registration/OtpVerificationScreen';
import { OTP_TTL_SECONDS } from '../../lib/auth/otp';
import { formatE164ForDisplay, nationalDigitsFromE164, toE164 } from '../../lib/auth/phone';
import {
  authFailureMessageKey,
  requestPhoneOtp,
  verifyPhoneOtp,
} from '../../lib/cloud/auth-client';
import { hasCloudDocumentKey, saveCloudSession } from '../../lib/cloud/cloud-store';
import { cloudConfig } from '../../lib/cloud/config';
import { citizenApi } from '../../lib/cloud/session';
import { nextStepAfterSignIn, serverMessageKey } from '../../lib/cloud/sign-in-flow';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function OtpVerificationRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  const nationalDigits = typeof phone === 'string' ? nationalDigitsFromE164(phone) : null;

  const [expiresAt, setExpiresAt] = useState(() => Date.now() + OTP_TTL_SECONDS * 1000);
  const working = useRef(false);

  const showMessage = useCallback(
    (messageKey: string) => {
      showDialog(t('cloud.errors.title'), t(messageKey), [{ text: t('registration.ok') }], {
        tone: 'danger',
      });
    },
    [t],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/mobile-number');
  }, [router]);

  const handleHelp = useCallback(() => {
    showDialog(t('otp.helpTitle'), t('otp.helpBody'), [{ text: t('registration.ok') }], {
      icon: CircleHelp,
    });
  }, [t]);

  const showUnavailable = useCallback(() => {
    showDialog(
      t('registration.otpUnavailableTitle'),
      t('registration.otpUnavailableBody'),
      [{ text: t('registration.ok') }],
      { tone: 'warning' },
    );
  }, [t]);

  const handleVerify = useCallback(
    (code: string) => {
      const config = cloudConfig();
      if (!config || !nationalDigits) {
        // Development-only demo walk-through. No code is checked. False in release builds.
        if (__DEV__) {
          router.replace('/(auth)/profile-setup');
          return;
        }
        showUnavailable();
        return;
      }
      const api = citizenApi();
      if (!api || working.current) return;
      working.current = true;

      void (async () => {
        try {
          const verified = await verifyPhoneOtp(config, toE164(nationalDigits), code);
          if (!verified.ok) {
            showMessage(authFailureMessageKey(verified.reason));
            return;
          }
          await saveCloudSession(verified.value);

          const account = await api.getAccount();
          if (!account.ok) {
            showMessage(serverMessageKey(account.error.messageKey, (key) => t(key) !== key));
            return;
          }
          const hasKey = account.value ? await hasCloudDocumentKey(verified.value.userId) : false;
          const next = nextStepAfterSignIn(account.value !== null, hasKey);
          if (next === 'profile') router.replace('/(auth)/profile-setup');
          else if (next === 'restore') router.replace('/(auth)/restore');
          else router.replace('/(tabs)');
        } finally {
          working.current = false;
        }
      })();
    },
    [nationalDigits, router, showMessage, showUnavailable, t],
  );

  const handleResend = useCallback(() => {
    const config = cloudConfig();
    if (!config || !nationalDigits) {
      showUnavailable();
      return;
    }
    void requestPhoneOtp(config, toE164(nationalDigits)).then((result) => {
      if (result.ok) setExpiresAt(Date.now() + OTP_TTL_SECONDS * 1000);
      else showMessage(authFailureMessageKey(result.reason));
    });
  }, [nationalDigits, showMessage, showUnavailable]);

  if (!nationalDigits) return <Redirect href="/(auth)/mobile-number" />;

  return (
    <OtpVerificationScreen
      phoneNumber={formatE164ForDisplay(nationalDigits)}
      expiresAt={expiresAt}
      onBack={handleBack}
      onHelp={handleHelp}
      onVerify={handleVerify}
      onResend={handleResend}
    />
  );
}
