/**
 * Profile tab — "My Profile": heading with a settings button, the account card, the plan card,
 * the settings list and Log Out.
 *
 * Presentational apart from the language picker, which it opens and applies itself (as the
 * registration profile form does): the route decides who is signed in and what every other tap
 * does. Light-only branded artwork like Home, so it does not read colours from `useTheme()`.
 */

import { LogOut, Settings } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  languageLabelKey,
  PROFILE_LANGUAGES,
  type ProfileMenuItem,
  type ProfileState,
} from '../../lib/profile/profile-screen';
import type { ColorScheme } from '../../theme';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { OptionSheet } from '../registration/OptionSheet';
import { profilePalette as palette } from './palette';
import { ProfileAccountCard } from './ProfileAccountCard';
import { ProfileMenu, type ProfileMenuRow } from './ProfileMenu';
import { ProfilePlanCard } from './ProfilePlanCard';

export type ProfileScreenProps = {
  readonly state: ProfileState;
  readonly scheme: ColorScheme;
  /** Null when the build does not report a version. */
  readonly appVersion: string | null;
  readonly onOpenSettings: () => void;
  readonly onOpenAccount: () => void;
  /** Omitted hides the camera badge (the account keeps no photo). */
  readonly onChangePhoto?: () => void;
  readonly onUpgrade: () => void;
  /** Every row except Language, which the screen handles. */
  readonly onSelect: (item: Exclude<ProfileMenuItem, 'language'>) => void;
  readonly onLogOut: () => void;
  /** Whether Log out is offered; defaults to signed in. */
  readonly canLogOut?: boolean;
  /** Log out is running: the button shows progress and ignores taps. */
  readonly loggingOut?: boolean;
};

export function ProfileScreen({
  state,
  scheme,
  appVersion,
  onOpenSettings,
  onOpenAccount,
  onChangePhoto,
  onUpgrade,
  onSelect,
  onLogOut,
  canLogOut = state.status === 'signed_in',
  loggingOut = false,
}: ProfileScreenProps) {
  const { t, locale, setLocale } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);

  const rows = useMemo<Record<ProfileMenuItem, ProfileMenuRow>>(
    () => ({
      personal: {
        title: t('profile.menu.personal.title'),
        subtitle: t('profile.menu.personal.subtitle'),
      },
      family: {
        title: t('profile.menu.family.title'),
        subtitle: t('profile.menu.family.subtitle'),
      },
      security: {
        title: t('profile.menu.security.title'),
        subtitle: t('profile.menu.security.subtitle'),
      },
      centres: {
        title: t('profile.menu.centres.title'),
        subtitle: t('profile.menu.centres.subtitle'),
      },
      notifications: {
        title: t('profile.menu.notifications.title'),
        subtitle: t('profile.menu.notifications.subtitle'),
      },
      language: {
        title: t('profile.menu.language.title'),
        subtitle: t(languageLabelKey(locale)),
      },
      appearance: {
        title: t('profile.menu.appearance.title'),
        subtitle: t(`profile.appearance.${scheme}`),
      },
      help: {
        title: t('profile.menu.help.title'),
        subtitle: t('profile.menu.help.subtitle'),
      },
      about: {
        title: t('profile.menu.about.title'),
        subtitle: appVersion
          ? t('profile.menu.about.subtitle', { version: appVersion })
          : t('profile.menu.about.subtitleUnknown'),
      },
    }),
    [appVersion, locale, scheme, t],
  );

  const languages = useMemo(
    () => PROFILE_LANGUAGES.map((value) => ({ value, label: t(languageLabelKey(value)) })),
    [t],
  );

  const plan = state.status === 'signed_in' ? state.account.plan : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titles}>
              <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
                {t('profile.heading')}
              </Text>
              <Text numberOfLines={2} style={styles.subtitle}>
                {t('profile.subtitle')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.settings')}
              hitSlop={6}
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
            >
              <Settings color={palette.headerIcon} size={30} strokeWidth={1.9} />
            </Pressable>
          </View>

          <ProfileAccountCard state={state} onOpen={onOpenAccount} onChangePhoto={onChangePhoto} />

          {plan ? <ProfilePlanCard plan={plan} onUpgrade={onUpgrade} /> : null}

          <ProfileMenu
            rows={rows}
            onSelect={(item) => {
              if (item === 'language') setLanguageOpen(true);
              else onSelect(item);
            }}
          />

          {canLogOut ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.logout')}
              accessibilityState={{ busy: loggingOut, disabled: loggingOut }}
              disabled={loggingOut}
              onPress={onLogOut}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              {loggingOut ? (
                <ActivityIndicator color={palette.logoutText} />
              ) : (
                <LogOut color={palette.logoutText} size={24} strokeWidth={2.1} />
              )}
              <Text numberOfLines={1} style={styles.logoutLabel}>
                {t(loggingOut ? 'profile.loggingOut' : 'profile.logout')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {languageOpen ? (
        <OptionSheet
          title={t('profile.languageSheetTitle')}
          closeLabel={t('profile.close')}
          options={languages}
          selected={locale}
          onSelect={setLocale}
          onClose={() => setLanguageOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 28,
  },
  pressed: {
    opacity: 0.6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  titles: {
    flex: 1,
    marginRight: 12,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 15.5,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  settings: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.logoutBorder,
    backgroundColor: palette.logoutSurface,
  },
  logoutLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.logoutText,
  },
});
