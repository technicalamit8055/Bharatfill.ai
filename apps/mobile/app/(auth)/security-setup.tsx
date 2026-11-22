/**
 * Security setup route — step 3 of registration.
 *
 * Cloud builds with a profile from step 2: the Vault PIN screen
 * (`components/registration/VaultPinScreen.tsx`, mode "create"). Create my vault sends the
 * name, language, PIN and consent to `POST /api/citizen/account`, which creates the account in
 * one transaction and returns the vault's document key; the key goes into SecureStore and the
 * citizen enters the app (docs/VAULT_BRIDGE_DESIGN.md §3.1).
 *
 * Otherwise — offline builds, or arriving here without a profile — the app-lock step
 * (`SecuritySetupScreen`): Set up app lock opens `/security?from=setup`, which goes on into the
 * app once a lock is saved; Skip goes straight in. Cloud builds set the app lock later, from
 * Profile → Security.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { CITIZEN_TERMS_VERSION } from '@assistigo/core';

import { SecuritySetupScreen } from '../../components/registration/SecuritySetupScreen';
import {
  type VaultPinCreateSubmit,
  VaultPinScreen,
} from '../../components/registration/VaultPinScreen';
import { completeSignIn } from '../../lib/cloud/complete-sign-in';
import { cloudConfig } from '../../lib/cloud/config';
import { registrationDraft } from '../../lib/cloud/registration-draft';
import { citizenApi } from '../../lib/cloud/session';
import { serverMessageKey } from '../../lib/cloud/sign-in-flow';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function SecuritySetupRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const [draft] = useState(registrationDraft);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/profile-setup');
  }, [router]);

  const enterApp = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleCreate = useCallback(
    ({ pin, cloudSync }: VaultPinCreateSubmit) => {
      const api = citizenApi();
      if (!api || !draft || busy) return;
      setBusy(true);
      setServerError(null);
      void (async () => {
        try {
          const result = await api.createAccount({
            displayName: draft.displayName,
            preferredLocale: draft.preferredLocale,
            vaultPin: pin,
            termsVersion: CITIZEN_TERMS_VERSION,
            cloudSync,
            device: { platform: Platform.OS === 'ios' ? 'ios' : 'android' },
          });
          if (!result.ok) {
            if (result.error.code === 'SIGNED_OUT') {
              router.replace('/(auth)/mobile-number');
              return;
            }
            setServerError(t(serverMessageKey(result.error.messageKey, (key) => t(key) !== key)));
            return;
          }
          await completeSignIn(result.value);
          router.replace('/(tabs)');
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, draft, router, t],
  );

  if (cloudConfig() && draft) {
    return (
      <VaultPinScreen
        mode="create"
        onBack={handleBack}
        busy={busy}
        serverError={serverError}
        onSubmit={handleCreate}
      />
    );
  }

  return (
    <SecuritySetupScreen
      onBack={handleBack}
      onSkip={enterApp}
      onSetUp={() => router.push({ pathname: '/security', params: { from: 'setup' } })}
    />
  );
}
