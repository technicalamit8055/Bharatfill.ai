/**
 * Bharatfill Citizen App — layout, type and component presets.
 *
 * Screens compose from these rather than inventing one-off numbers, so spacing and type stay
 * consistent across the scanner, the vault and the consent screens.
 *
 * Presets that depend on light/dark are functions of `ThemeColors`; static geometry is a const.
 */

import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { type ThemeColors, brand, neutral } from './colors';

/** 4pt base scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  bodyLarge: 17,
  title: 20,
  heading: 24,
  display: 30,
} as const;

export const lineHeight = {
  caption: 16,
  small: 18,
  body: 22,
  bodyLarge: 24,
  title: 26,
  heading: 30,
  display: 36,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/**
 * Minimum touch target. Many citizens use the app one-handed on low-end devices in poor light;
 * 48dp is the Android accessibility floor and we do not go below it.
 */
export const MIN_TOUCH_TARGET = 48;

export const elevation = {
  card: {
    shadowColor: neutral[950],
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sheet: {
    shadowColor: neutral[950],
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
} as const satisfies Record<string, ViewStyle>;

/** Type presets that do not depend on the colour scheme. */
export const typePresets = StyleSheet.create({
  display: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
  },
  heading: {
    fontSize: fontSize.heading,
    lineHeight: lineHeight.heading,
    fontWeight: fontWeight.semibold,
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.regular,
  },
  bodyStrong: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.semibold,
  },
  caption: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
  },
});

export type ThemedPresets = ReturnType<typeof createPresets>;

/**
 * Builds the colour-dependent presets for one scheme. Call once per scheme and memoise at the
 * provider, not per render inside a screen.
 */
export function createPresets(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screenContent: {
      padding: spacing.base,
      gap: spacing.base,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.base,
      gap: spacing.sm,
      ...elevation.card,
    },
    sectionHeader: {
      ...typePresets.title,
      color: colors.textPrimary,
    },
    textPrimary: {
      ...typePresets.body,
      color: colors.textPrimary,
    },
    textSecondary: {
      ...typePresets.body,
      color: colors.textSecondary,
    },
    textMuted: {
      ...typePresets.caption,
      color: colors.textMuted,
    },
    primaryButton: {
      minHeight: MIN_TOUCH_TARGET,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primaryButtonLabel: {
      ...typePresets.bodyStrong,
      color: colors.textOnBrand,
    },
    secondaryButton: {
      minHeight: MIN_TOUCH_TARGET,
      borderRadius: radius.md,
      backgroundColor: colors.primarySurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    secondaryButtonLabel: {
      ...typePresets.bodyStrong,
      color: colors.primary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: colors.primarySurface,
    },
    badgeLabel: {
      ...typePresets.caption,
      color: colors.primary,
    },
  });
}

/**
 * Navigation header/tab-bar options derived from the same tokens.
 *
 * Deliberately not `as const`: React Navigation's option types are mutable, so a deeply
 * readonly object is not assignable to them. `headerTitleStyle` also accepts only a subset of
 * TextStyle (font family/size/weight plus colour), which is why the title preset is spread
 * field by field rather than wholesale — `lineHeight` is not allowed there.
 */
export function navigationPresets(colors: ThemeColors) {
  return {
    header: {
      headerStyle: { backgroundColor: colors.surface },
      headerTitleStyle: {
        fontSize: typePresets.title.fontSize,
        fontWeight: typePresets.title.fontWeight,
        color: colors.textPrimary,
      },
      headerTintColor: colors.primary,
      headerShadowVisible: false,
    },
    tabBar: {
      tabBarActiveTintColor: colors.tabActive,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: {
        backgroundColor: colors.tabBar,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        height: 60,
        paddingBottom: spacing.sm,
        paddingTop: spacing.xs,
      },
      tabBarLabelStyle: {
        fontSize: fontSize.caption,
        fontWeight: fontWeight.medium,
      },
    },
  };
}

/** Splash/brand surfaces reference the ramp directly. */
export const brandSurface = {
  splashBackground: brand[600],
  splashForeground: neutral[0],
} as const;
