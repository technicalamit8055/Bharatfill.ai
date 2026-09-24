/**
 * Tab shell — the five top-level destinations in the Home mockup: Home, Vault, Scan, Share and
 * Profile. Scan and the vault come from the citizen app spec; Share is the home for sharing with
 * a Cyber Cafe / CSC (spec §3 Features 3 and 4), a placeholder until that is built.
 *
 * The bar itself is `components/navigation/AppTabBar.tsx`, which draws the icons and the raised
 * Scan button. Screens here only give each tab its title and label.
 */

import { Tabs, useRouter } from 'expo-router';

import { AppTabBar } from '../../components/navigation/AppTabBar';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const { navigation } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Tabs screenOptions={navigation.header} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home.title'),
          // The dashboard draws its own greeting header.
          headerShown: false,
          tabBarLabel: t('tabs.home'),
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: t('vault.title'),
          tabBarLabel: t('tabs.vault'),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('scan.title'),
          tabBarLabel: t('tabs.scan'),
        }}
        listeners={{
          // The scanner is a full-screen modal, not a tab: open it over whichever tab is showing.
          tabPress: (event) => {
            event.preventDefault();
            router.push('/scanner');
          },
        }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: t('share.title'),
          tabBarLabel: t('tabs.share'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.title'),
          tabBarLabel: t('tabs.profile'),
        }}
      />
    </Tabs>
  );
}
