/**
 * Profile tab route. The screen lives in `components/profile/ProfileScreen.tsx`; this route
 * decides whose profile it shows and what each row does.
 *
 * Sign-in and the saved profile are not live, so a production build shows the signed-out card
 * (which opens mobile-number sign-in) and no plan or Log Out. Development builds show the
 * mockup's sample account instead (`components/profile/demo.ts`). Language works for real
 * through the screen's picker; About shows the build's version. Everything else the mockup
 * points at — editing details, app lock, alerts, dark mode, help, plans, photos, signing out —
 * says plainly that it is not live yet, and nothing is changed or sent.
 */

import Constants from 'expo-constants';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { DEMO_PROFILE } from '../../components/profile/demo';
import { ProfileScreen } from '../../components/profile/ProfileScreen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  appVersionOf,
  SIGNED_OUT_PROFILE,
  type ProfileMenuItem,
} from '../../lib/profile/profile-screen';
import { useTheme } from '../../theme';

const PROFILE = __DEV__ ? DEMO_PROFILE : SIGNED_OUT_PROFILE;

export default function ProfileRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const isFocused = useIsFocused();

  const appVersion = appVersionOf(Constants.expoConfig?.version);

  const comingSoon = useCallback(
    (reason: string) => {
      Alert.alert(t('common.comingSoon'), t(`profile.unavailable.${reason}`), [
        { text: t('common.ok') },
      ]);
    },
    [t],
  );

  const openAccount = useCallback(() => {
    if (PROFILE.status === 'signed_out') router.push('/(auth)/mobile-number');
    else comingSoon('personal');
  }, [comingSoon, router]);

  const select = useCallback(
    (item: Exclude<ProfileMenuItem, 'language'>) => {
      if (item !== 'about') {
        comingSoon(item);
        return;
      }
      Alert.alert(
        t('app.name'),
        `${t('app.tagline')}\n\n${
          appVersion
            ? t('profile.menu.about.subtitle', { version: appVersion })
            : t('profile.menu.about.subtitleUnknown')
        }`,
        [{ text: t('common.ok') }],
      );
    },
    [appVersion, comingSoon, t],
  );

  return (
    <>
      {/* Profile is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <ProfileScreen
        state={PROFILE}
        scheme={scheme}
        appVersion={appVersion}
        onOpenSettings={() => comingSoon('settings')}
        onOpenAccount={openAccount}
        onChangePhoto={() => comingSoon('photo')}
        onUpgrade={() => comingSoon('plan')}
        onSelect={select}
        onLogOut={() => comingSoon('logout')}
      />
    </>
  );
}
