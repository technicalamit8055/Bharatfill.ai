/**
 * The app's bottom tab bar, as in the Home mockup: Home, Vault, Scan, Share and Profile, with
 * Scan as a raised blue circle over the middle of a white bar with rounded top corners. The
 * focused tab turns blue and its icon fills in.
 *
 * The navigator lays the tab bar out under the screens, not over them, so the part of the circle
 * that pokes above the bar would sit over nothing. The bar therefore reserves a strip above
 * itself, painted in the focused screen's background, for the circle to rise into. That also
 * keeps the whole circle inside its parent, which Android needs to deliver taps to it.
 */

import type { Tabs } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Focus, Folder, House, User, Users } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { homePalette } from '../home/palette';
import { tabBarPalette } from './palette';

type AppTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Icons for the ordinary tabs, by route name. Scan draws its own raised button. */
const TAB_ICONS: Readonly<Record<string, LucideIcon>> = {
  index: House,
  vault: Folder,
  share: Users,
  profile: User,
};

const SCAN_ROUTE = 'scan';

const BAR_PADDING_TOP = 10;
const ICON_SIZE = 26;
const ICON_SLOT = 28;
const LABEL_GAP = 4;
const SCAN_BUTTON_SIZE = 58;
/** Space between the bottom of the Scan circle and its label. */
const SCAN_LABEL_GAP = 4;
/** How far the Scan circle rises above the bar, so its label lines up with the others. */
const SCAN_RAISE = SCAN_BUTTON_SIZE + SCAN_LABEL_GAP - (ICON_SLOT + LABEL_GAP) - BAR_PADDING_TOP;

export function AppTabBar({ state, descriptors, navigation, insets }: AppTabBarProps) {
  const { scheme, colors } = useTheme();
  const palette = tabBarPalette(scheme);

  const focusedRoute = state.routes[state.index];
  // Home is light-only artwork on its own background; every other tab uses the theme's.
  const stripColor = focusedRoute?.name === 'index' ? homePalette.background : colors.background;

  const tabs = state.routes.map((route, index) => {
    const focused = index === state.index;
    const options = descriptors[route.key]?.options;
    const label =
      typeof options?.tabBarLabel === 'string'
        ? options.tabBarLabel
        : (options?.title ?? route.name);

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };
    const onLongPress = () => {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    };

    return { route, focused, label, onPress, onLongPress };
  });

  return (
    <View style={[styles.root, { backgroundColor: stripColor }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: palette.bar,
            shadowColor: palette.barShadow,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        {tabs.map(({ route, focused, label, onPress, onLongPress }) => {
          const color = focused ? palette.active : palette.inactive;
          const labelStyle = [styles.label, { color }, focused && styles.labelFocused];

          if (route.name === SCAN_ROUTE) {
            // The label under the raised circle is a second, larger target for the same tab.
            // Screen readers get the circle alone, so the tab is announced once.
            return (
              <Pressable
                key={route.key}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.item}
              >
                <View style={styles.iconSlot} />
                <Text numberOfLines={1} style={labelStyle}>
                  {label}
                </Text>
              </Pressable>
            );
          }

          const Icon = TAB_ICONS[route.name];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View style={styles.iconSlot}>
                {Icon ? (
                  // Focused icons are filled; stroking them in the bar colour keeps the inner
                  // detail (the door of the house, the fold of the folder) visible.
                  <Icon
                    color={focused ? palette.bar : color}
                    fill={focused ? color : 'none'}
                    size={ICON_SIZE}
                    strokeWidth={focused ? 1.8 : 2}
                  />
                ) : null}
              </View>
              <Text numberOfLines={1} style={labelStyle}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Same slots as the bar, so the circle sits exactly over the Scan tab. */}
      <View style={styles.overlay}>
        {tabs.map(({ route, focused, label, onPress, onLongPress }) =>
          route.name === SCAN_ROUTE ? (
            <View key={route.key} style={styles.overlaySlot}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [
                  styles.scanButton,
                  {
                    backgroundColor: pressed ? palette.scanButtonPressed : palette.scanButton,
                    shadowColor: palette.scanButton,
                  },
                ]}
              >
                <Focus color={palette.scanIcon} size={28} strokeWidth={2.2} />
              </Pressable>
            </View>
          ) : (
            <View key={route.key} style={[styles.overlaySlot, styles.passThrough]} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: SCAN_RAISE,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: BAR_PADDING_TOP,
    paddingHorizontal: 6,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  iconSlot: {
    height: ICON_SLOT,
    justifyContent: 'center',
  },
  label: {
    marginTop: LABEL_GAP,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  labelFocused: {
    fontWeight: '700',
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 6,
    // Android draws siblings by elevation, so the circle must out-rank the bar's shadow.
    zIndex: 1,
    elevation: 14,
    pointerEvents: 'box-none',
  },
  overlaySlot: {
    flex: 1,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  passThrough: {
    pointerEvents: 'none',
  },
  scanButton: {
    width: SCAN_BUTTON_SIZE,
    height: SCAN_BUTTON_SIZE,
    borderRadius: SCAN_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 14,
  },
});
