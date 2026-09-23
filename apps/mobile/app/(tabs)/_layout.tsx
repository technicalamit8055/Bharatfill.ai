/**
 * Tab shell — the four top-level destinations from the citizen app spec:
 * Home, Vault, Scan and Profile.
 *
 * Icons are text glyphs for now. They are a deliberate placeholder: swapping in an icon set is
 * a one-line change per tab, and shipping the shell without waiting on assets keeps the
 * navigation structure reviewable.
 */

import { Tabs } from 'expo-router';
import { Text, type TextStyle } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

function TabGlyph({ glyph, color }: { glyph: string; color: TextStyle['color'] }) {
  return (
    <Text accessible={false} style={{ color, fontSize: 18 }}>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const { navigation } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs screenOptions={{ ...navigation.header, ...navigation.tabBar }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home.title'),
          tabBarLabel: t('tabs.home'),
          tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: t('vault.title'),
          tabBarLabel: t('tabs.vault'),
          tabBarIcon: ({ color }) => <TabGlyph glyph="🗂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('scan.title'),
          tabBarLabel: t('tabs.scan'),
          tabBarIcon: ({ color }) => <TabGlyph glyph="⛶" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.title'),
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: ({ color }) => <TabGlyph glyph="☺" color={color} />,
        }}
      />
    </Tabs>
  );
}
