/**
 * Restore route — this number already has a vault, but this phone does not hold its key
 * (a new or reset phone). docs/VAULT_BRIDGE_DESIGN.md §3.3, option 2: the Vault PIN.
 *
 * `POST /api/citizen/restore/pin` checks the PIN; on success it returns the document key, which
 * goes into SecureStore. Five wrong in a row lock the PIN for 24 hours and ten over the
 * account's life switch it off — the server's messages say so. Old-phone approval and the
 * 7-day wait are named on the screen and arrive in a later step.
 *
 * Back signs nothing out: the citizen can leave and use the on-phone vault without the cloud.
 */

import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { VaultPinScreen } from '../../components/registration/VaultPinScreen';
import { completeSignIn } from '../../lib/cloud/complete-sign-in';
import { cloudConfig } from '../../lib/cloud/config';
import { citizenApi } from '../../lib/cloud/session';
import { serverMessageKey } from '../../lib/cloud/sign-in-flow';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function RestoreRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleUnlock = useCallback(
    (pin: string) => {
      const api = citizenApi();
      if (!api || busy) return;
      setBusy(true);
      setServerError(null);
      void (async () => {
        try {
          const result = await api.restoreWithPin(pin, {
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
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
    [busy, router, t],
  );

  if (!cloudConfig()) return <Redirect href="/(tabs)" />;

  return (
    <VaultPinScreen
      mode="restore"
      onBack={handleBack}
      busy={busy}
      serverError={serverError}
      onSubmit={handleUnlock}
    />
  );
}
