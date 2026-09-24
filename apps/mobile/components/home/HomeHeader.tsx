/**
 * Home header: the app icon, "नमस्ते, Amit 👋" with the tagline under it, then the bell and the
 * initials avatar. Without a saved name the greeting drops the name and the avatar shows a
 * person icon instead of initials.
 */

import { Bell, User } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { firstNameOf, initialsOf } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { homePalette as palette } from './palette';

export type HomeHeaderProps = {
  readonly citizenName: string | null;
  readonly hasUnreadNotifications: boolean;
  readonly onOpenNotifications: () => void;
  readonly onOpenProfile: () => void;
};

export function HomeHeader({
  citizenName,
  hasUnreadNotifications,
  onOpenNotifications,
  onOpenProfile,
}: HomeHeaderProps) {
  const { t } = useTranslation();

  const firstName = firstNameOf(citizenName);
  const initials = initialsOf(citizenName);

  return (
    <View style={styles.row}>
      <View style={styles.logoShadow}>
        <Image
          source={require('../../assets/home/bharatdoc-logo.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
      </View>

      <View style={styles.copy}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.greeting}>
          {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName')}
        </Text>
        <Text numberOfLines={2} style={styles.tagline}>
          {t('home.tagline')}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasUnreadNotifications ? t('home.notificationsUnread') : t('home.notifications')
        }
        hitSlop={4}
        onPress={onOpenNotifications}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
      >
        <Bell color={palette.headerIcon} size={26} strokeWidth={2} />
        {hasUnreadNotifications ? <View style={styles.unreadDot} /> : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.openProfile')}
        hitSlop={2}
        onPress={onOpenProfile}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        {initials ? (
          <Text numberOfLines={1} style={styles.initials}>
            {initials}
          </Text>
        ) : (
          <User color={palette.avatarText} size={22} strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },

  logoShadow: {
    borderRadius: 14,
    shadowColor: palette.logoShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    // Android drops the shadow unless the layer is opaque.
    backgroundColor: palette.surface,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },

  copy: {
    flex: 1,
    marginLeft: 12,
    marginRight: 4,
  },
  greeting: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  tagline: {
    marginTop: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.textSecondary,
  },

  bell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.notificationDotRing,
    backgroundColor: palette.notificationDot,
  },

  avatar: {
    width: 46,
    height: 46,
    marginLeft: 6,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.avatarSurface,
  },
  initials: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.avatarText,
  },
});
