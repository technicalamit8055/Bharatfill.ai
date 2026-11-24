/**
 * The app's bottom tab bar, as in the Home mockup: Home, Vault, Scan, Connect and Profile, with
 * Scan as a raised blue circle over the middle. This connects Expo Router to `MotionTabBar`,
 * which draws and animates the bar.
 */

import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useTheme } from '../../theme';
import { homePalette } from '../home/palette';
import { MotionTabBar, type MotionTabItem } from './MotionTabBar';
import { tabBarPalette } from './palette';
import type { TabIconName } from './tab-icons';

type AppTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Icons by route name. */
const ROUTE_ICONS: Readonly<Record<string, TabIconName>> = {
  index: 'home',
  vault: 'vault',
  scan: 'scan',
  share: 'connect',
  profile: 'profile',
};

const RAISED_ROUTE = 'scan';

/** Tabs drawn on Home's light background whatever the colour scheme. */
const LIGHT_ONLY_ROUTES: ReadonlySet<string> = new Set(['index', 'vault', 'share']);

export function AppTabBar({ state, descriptors, navigation, insets }: AppTabBarProps) {
  const { scheme, colors } = useTheme();

  const focusedRoute = state.routes[state.index];
  // Home, the vault and Connect are light-only artwork on their own background; the rest use
  // the theme's.
  const backdropColor =
    focusedRoute !== undefined && LIGHT_ONLY_ROUTES.has(focusedRoute.name)
      ? homePalette.background
      : colors.background;

  const items = state.routes.map((route): MotionTabItem => {
    const options = descriptors[route.key]?.options;
    return {
      key: route.key,
      label:
        typeof options?.tabBarLabel === 'string'
          ? options.tabBarLabel
          : (options?.title ?? route.name),
      icon: ROUTE_ICONS[route.name],
      raised: route.name === RAISED_ROUTE,
    };
  });

  const onPress = (key: string) => {
    const route = state.routes.find((candidate) => candidate.key === key);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (key !== focusedRoute?.key && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <MotionTabBar
      items={items}
      activeKey={focusedRoute?.key}
      onPress={onPress}
      onLongPress={(key) => navigation.emit({ type: 'tabLongPress', target: key })}
      palette={tabBarPalette(scheme)}
      backdropColor={backdropColor}
      bottomInset={insets.bottom}
    />
  );
}
