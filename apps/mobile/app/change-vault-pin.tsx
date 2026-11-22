/**
 * Change Vault PIN — `/change-vault-pin`, opened from Personal Information while signed in
 * (docs/VAULT_BRIDGE_DESIGN.md D17). The screen is `VaultPinScreen` in `change` mode; this route
 * sends the request and reports.
 *
 * On success every other phone signed in to this account is signed out by the server, so a
 * phone someone else set up — a centre that "made the account" for the citizen — loses the
 * vault. This phone stays signed in. The PINs are never stored or logged here.
 */

import { CheckCircle2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  type VaultPinChangeSubmit,
  VaultPinScreen,
} from '../components/registration/VaultPinScreen';
import { citizenApi } from '../lib/cloud/session';
import { serverMessageKey } from '../lib/cloud/sign-in-flow';
import { showDialog } from '../lib/dialog/dialog-store';
import { useTranslation } from '../lib/i18n/I18nProvider';

export default function ChangeVaultPinRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/account-details');
  }, [router]);

  const submit = useCallback(
    (input: VaultPinChangeSubmit) => {
      if (busy) return;
      const api = citizenApi();
      if (!api) {
        setServerError(t('cloud.errors.unavailable'));
        return;
      }
      setBusy(true);
      setServerError(null);
      void (async () => {
        try {
          const result = await api.changeVaultPin(input.currentPin, input.newPin);
          if (!result.ok) {
            if (result.error.code === 'SIGNED_OUT') {
              router.replace('/(auth)/mobile-number');
              return;
            }
            setServerError(t(serverMessageKey(result.error.messageKey, (key) => t(key) !== key)));
            return;
          }
          showDialog(
            t('vaultPin.change.doneTitle'),
            t('vaultPin.change.doneBody'),
            [{ text: t('common.ok'), onPress: back }],
            { tone: 'success', icon: CheckCircle2 },
          );
        } finally {
          setBusy(false);
        }
      })();
    },
    [back, busy, router, t],
  );

  return (
    <VaultPinScreen
      mode="change"
      onBack={back}
      busy={busy}
      serverError={serverError}
      onSubmit={submit}
    />
  );
}
