/**
 * Profile tab route. The screen lives in `components/profile/ProfileScreen.tsx`; this route
 * decides whose profile it shows and what each row does.
 *
 * Signed in (cloud builds), the card shows the account's name and the number it signed in with
 * and opens Personal Information; Log Out asks what happens to the documents on this phone
 * (`lib/cloud/use-leave-account.ts`). Changing the language here also updates the account, so
 * notices from Bharatfill arrive in it. Signed out, the card opens mobile-number sign-in.
 *
 * Development builds without a cloud configured show the mockup's sample account
 * (`components/profile/demo.ts`) so the layout can be reviewed; nothing in it is live. Security
 * opens App lock (`app/security.tsx`) in every build. Rows that are still not built (alerts,
 * dark mode, help) say so plainly and change nothing.
 */

import { Info } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { DEMO_PROFILE } from '../../components/profile/demo';
import { ProfileScreen } from '../../components/profile/ProfileScreen';
import { updateCloudAccount } from '../../lib/cloud/account';
import { cloudConfig } from '../../lib/cloud/config';
import { useCloudProfile } from '../../lib/cloud/use-cloud-profile';
import { useLeaveAccount } from '../../lib/cloud/use-leave-account';
import { showDialog } from '../../lib/dialog/dialog-store';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  appVersionOf,
  type ProfileMenuItem,
  type ProfileState,
  SIGNED_OUT_PROFILE,
  signedInProfile,
} from '../../lib/profile/profile-screen';
import { useTheme } from '../../theme';

/** Sample account only in a development build that has no cloud to sign in to. */
const SHOW_DEMO = __DEV__ && cloudConfig() === null;

export default function ProfileRoute() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { scheme } = useTheme();
  const isFocused = useIsFocused();
  const { profile, reload } = useCloudProfile();

  const appVersion = appVersionOf(Constants.expoConfig?.version);

  const state = useMemo<ProfileState>(() => {
    if (SHOW_DEMO) return DEMO_PROFILE;
    if (profile.status === 'signed_out') return SIGNED_OUT_PROFILE;
    return signedInProfile({
      displayName: profile.account?.displayName ?? null,
      phoneNumber: profile.phoneNumber,
    });
  }, [profile]);

  const comingSoon = useCallback(
    (reason: string) => {
      showDialog(
        t('common.comingSoon'),
        t(`profile.unavailable.${reason}`),
        [{ text: t('common.ok') }],
        { tone: 'brand' },
      );
    },
    [t],
  );

  const { busy, confirmLogOut } = useLeaveAccount(
    useCallback(() => {
      reload();
      // Straight on to sign-in, so another number can be used right away.
      showDialog(t('profile.leave.log_out.doneTitle'), t('profile.leave.log_out.doneBody'), [
        { text: t('common.ok'), onPress: () => router.push('/(auth)/mobile-number') },
      ]);
    }, [reload, router, t]),
  );

  const canLogOut =
    SHOW_DEMO ||
    profile.status === 'signed_in' ||
    (profile.status === 'signed_out' && profile.sessionOnPhone === true);

  // A language picked here also becomes the account's, once — not on every focus or reload.
  const signedIn = profile.status === 'signed_in' ? profile : null;
  const lastLocale = useRef(locale);
  useEffect(() => {
    if (lastLocale.current === locale) return;
    lastLocale.current = locale;
    if (signedIn?.account && signedIn.account.preferredLocale !== locale) {
      // Best effort: the app already switched; the account catches up next time if this fails.
      void updateCloudAccount({ preferredLocale: locale });
    }
  }, [locale, signedIn]);

  const openAccount = useCallback(() => {
    if (SHOW_DEMO) comingSoon('personal');
    else if (state.status === 'signed_out') router.push('/(auth)/mobile-number');
    else router.push('/account-details');
  }, [comingSoon, router, state.status]);

  const select = useCallback(
    (item: Exclude<ProfileMenuItem, 'language'>) => {
      if (item === 'personal' && !SHOW_DEMO && state.status === 'signed_in') {
        router.push('/account-details');
        return;
      }
      // App lock is on the phone alone, so it works signed in or not, and in every build.
      if (item === 'security') {
        router.push('/security');
        return;
      }
      // Centre access lives on the server: it needs a cloud build and a signed-in account.
      if (item === 'centres') {
        if (SHOW_DEMO || !cloudConfig()) comingSoon('centres');
        else if (state.status === 'signed_out') router.push('/(auth)/mobile-number');
        else router.push('/centre-access');
        return;
      }
      if (item !== 'about') {
        comingSoon(item);
        return;
      }
      showDialog(
        t('app.name'),
        `${t('app.tagline')}\n\n${
          appVersion
            ? t('profile.menu.about.subtitle', { version: appVersion })
            : t('profile.menu.about.subtitleUnknown')
        }`,
        [{ text: t('common.ok') }],
        { tone: 'brand', icon: Info },
      );
    },
    [appVersion, comingSoon, router, state.status, t],
  );

  return (
    <>
      {/* Profile is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <ProfileScreen
        state={state}
        scheme={scheme}
        appVersion={appVersion}
        onOpenSettings={() => comingSoon('settings')}
        onOpenAccount={openAccount}
        {...(SHOW_DEMO ? { onChangePhoto: () => comingSoon('photo') } : {})}
        onUpgrade={() => comingSoon('plan')}
        onSelect={select}
        onLogOut={SHOW_DEMO ? () => comingSoon('logout') : confirmLogOut}
        canLogOut={canLogOut}
        loggingOut={busy === 'logging_out'}
      />
    </>
  );
}
