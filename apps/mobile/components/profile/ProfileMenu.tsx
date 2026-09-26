/**
 * The settings list on Profile: one card of rows, each with a round icon, a title, a line
 * under it and a chevron. The screen works out each row's second line (the current language,
 * the app version); this only draws them.
 */

import {
  Bell,
  ChevronRight,
  CircleHelp,
  Globe,
  Info,
  LockKeyhole,
  Palette,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PROFILE_MENU_ITEMS, type ProfileMenuItem } from '../../lib/profile/profile-screen';
import { profilePalette as palette } from './palette';

const ICON_WELL_SIZE = 50;

const ICONS: Record<ProfileMenuItem, LucideIcon> = {
  personal: UserRound,
  security: LockKeyhole,
  notifications: Bell,
  language: Globe,
  appearance: Palette,
  help: CircleHelp,
  about: Info,
};

export type ProfileMenuRow = {
  readonly title: string;
  readonly subtitle: string;
};

export type ProfileMenuProps = {
  readonly rows: Readonly<Record<ProfileMenuItem, ProfileMenuRow>>;
  readonly onSelect: (item: ProfileMenuItem) => void;
};

export function ProfileMenu({ rows, onSelect }: ProfileMenuProps) {
  return (
    <View style={styles.card}>
      {PROFILE_MENU_ITEMS.map((item, index) => {
        const Icon = ICONS[item];
        const row = rows[item];
        return (
          <Fragment key={item}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${row.title}, ${row.subtitle}`}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.iconWell}>
                <Icon color={palette.headerIcon} size={24} strokeWidth={2} />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>
                  {row.title}
                </Text>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {row.subtitle}
                </Text>
              </View>
              <ChevronRight color={palette.chevron} size={22} strokeWidth={2} />
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 76,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.divider,
  },
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: ICON_WELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.menuIconSurface,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16.5,
    lineHeight: 22,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    color: palette.textMuted,
  },
});
