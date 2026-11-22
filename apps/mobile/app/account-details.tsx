/**
 * Personal Information route — `/account-details`, opened from Profile while signed in. The
 * screen is `components/profile/AccountDetailsScreen.tsx`; this route reads the account, saves a
 * new name, and runs Delete account (`lib/cloud/use-leave-account.ts`).
 *
 * Signed out (or offline before the account was ever read) there is nothing to edit, so it goes
 * back to Profile, which shows the sign-in card.
 */

import { CheckCircle2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountDetailsScreen } from '../components/profile/AccountDetailsScreen';
import { profilePalette } from '../components/profile/palette';
import { updateCloudAccount } from '../lib/cloud/account';
import { serverMessageKey } from '../lib/cloud/sign-in-flow';
import { useCloudProfile } from '../lib/cloud/use-cloud-profile';
import { useLeaveAccount } from '../lib/cloud/use-leave-account';
import { showDialog } from '../lib/dialog/dialog-store';
import { useTranslation } from '../lib/i18n/I18nProvider';

export default function AccountDetailsRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile, loading, reload } = useCloudProfile();
  const [saving, setSaving] = useState(false);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  const { busy, confirmDeleteAccount } = useLeaveAccount(
    useCallback(() => {
      showDialog(
        t('profile.leave.delete_account.doneTitle'),
        t('profile.leave.delete_account.doneBody'),
        [{ text: t('common.ok') }],
        { tone: 'success', icon: CheckCircle2 },
      );
      router.replace('/(tabs)/profile');
    }, [router, t]),
  );

  const account = profile.status === 'signed_in' ? profile.account : null;

  // Nothing to show once the first read says there is no account (signed out, or never read).
  useEffect(() => {
    if (!loading && !account && busy === null) back();
  }, [account, back, busy, loading]);

  const save = useCallback(
    async (displayName: string) => {
      setSaving(true);
      const result = await updateCloudAccount({ displayName });
      setSaving(false);
      if (result.ok) {
        reload();
        showDialog(
          t('accountDetails.savedTitle'),
          t('accountDetails.savedBody'),
          [{ text: t('common.ok'), onPress: back }],
          { tone: 'success', icon: CheckCircle2 },
        );
      } else {
        showDialog(
          t('cloud.errors.title'),
          t(serverMessageKey(result.messageKey, (key) => t(key) !== key)),
          [{ text: t('common.ok') }],
        );
      }
    },
    [back, reload, t],
  );

  if (!account || profile.status !== 'signed_in') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={profilePalette.brandBlue} />
      </View>
    );
  }

  return (
    <AccountDetailsScreen
      key={account.id}
      initialName={account.displayName}
      phoneNumber={profile.phoneNumber}
      busy={saving ? 'saving' : busy === 'deleting' ? 'deleting' : null}
      onBack={back}
      onSave={(name) => void save(name)}
      onDeleteAccount={confirmDeleteAccount}
      onChangeVaultPin={() => router.push('/change-vault-pin')}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: profilePalette.background,
  },
});
